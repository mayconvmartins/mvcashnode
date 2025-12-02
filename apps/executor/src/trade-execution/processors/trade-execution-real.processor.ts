import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import {
  PositionService,
  ExchangeAccountService,
  VaultService,
} from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus } from '@mvcashnode/shared';
import { NotificationHttpService } from '@mvcashnode/notifications';

@Processor('trade-execution-real')
export class TradeExecutionRealProcessor extends WorkerHost {
  private readonly logger = new Logger(TradeExecutionRealProcessor.name);
  private notificationService: NotificationHttpService;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
    this.notificationService = new NotificationHttpService(process.env.API_URL || 'http://localhost:4010');
  }

  async process(job: Job<any>): Promise<any> {
    const { tradeJobId } = job.data;
    const startTime = Date.now();

    this.logger.log(`[EXECUTOR] Processando trade job ${tradeJobId}`);

    try {
      const tradeJob = await this.prisma.tradeJob.findUnique({
        where: { id: tradeJobId },
        include: {
          exchange_account: true,
        },
      });

      if (!tradeJob) {
        throw new Error(`Trade job ${tradeJobId} não encontrado`);
      }

      if (tradeJob.trade_mode !== 'REAL') {
        throw new Error(`Trade job ${tradeJobId} não é do modo REAL`);
      }

      // Validar que a exchange account está ativa
      if (!tradeJob.exchange_account.is_active) {
        throw new Error(`Conta de exchange ${tradeJob.exchange_account_id} está inativa`);
      }

      // Validar símbolo
      if (!tradeJob.symbol || tradeJob.symbol.trim() === '') {
        throw new Error(`Símbolo inválido para trade job ${tradeJobId}`);
      }

      // Validar quantidade
      const baseQty = tradeJob.base_quantity?.toNumber() || 0;
      const quoteAmount = tradeJob.quote_amount?.toNumber() || 0;

      if (baseQty <= 0 && quoteAmount <= 0) {
        throw new Error(`Quantidade inválida para trade job ${tradeJobId}`);
      }

      // Update status to EXECUTING
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: { status: TradeJobStatus.EXECUTING },
      });

      this.logger.debug(`[EXECUTOR] Trade job ${tradeJobId} marcado como EXECUTING`);

      // Get API keys
      const accountService = new ExchangeAccountService(
        this.prisma,
        this.encryptionService
      );
      const keys = await accountService.decryptApiKeys(tradeJob.exchange_account_id);

      if (!keys || !keys.apiKey || !keys.apiSecret) {
        throw new Error(`API keys não encontradas para conta ${tradeJob.exchange_account_id}`);
      }

      this.logger.debug(`[EXECUTOR] API keys obtidas para conta ${tradeJob.exchange_account_id}`);

      // Create adapter
      const adapter = AdapterFactory.createAdapter(
        tradeJob.exchange_account.exchange as ExchangeType,
        keys.apiKey,
        keys.apiSecret,
        { testnet: tradeJob.exchange_account.testnet }
      );

      // Verificar saldo antes de executar (apenas para BUY)
      if (tradeJob.side === 'BUY') {
        try {
          const balance = await adapter.fetchBalance();
          const quoteAsset = tradeJob.symbol.split('/')[1] || 'USDT';
          const available = balance.free[quoteAsset] || 0;

          const requiredAmount = quoteAmount > 0 ? quoteAmount : baseQty * (tradeJob.limit_price?.toNumber() || 0);

          if (available < requiredAmount) {
            throw new Error(`Saldo insuficiente. Disponível: ${available} ${quoteAsset}, Necessário: ${requiredAmount} ${quoteAsset}`);
          }

          this.logger.debug(`[EXECUTOR] Saldo verificado: ${available} ${quoteAsset} disponível`);
        } catch (error: any) {
          // Se falhar ao verificar saldo, logar mas continuar (pode ser problema de API)
          this.logger.warn(`[EXECUTOR] Aviso: Não foi possível verificar saldo: ${error.message}`);
        }
      }

      // Execute order
      const orderType = tradeJob.order_type === 'LIMIT' ? 'limit' : 'market';
      this.logger.log(`[EXECUTOR] Criando ordem ${orderType} ${tradeJob.side} ${baseQty || quoteAmount} ${tradeJob.symbol}`);

      let order;
      try {
        order = await adapter.createOrder(
          tradeJob.symbol,
          orderType,
          tradeJob.side.toLowerCase(),
          baseQty || 0,
          tradeJob.limit_price?.toNumber()
        );

        this.logger.log(`[EXECUTOR] Ordem criada na exchange: ${order.id}, status: ${order.status}`);
      } catch (error: any) {
        const errorMessage = error?.message || 'Erro desconhecido';
        
        // Mapear erros comuns da exchange
        let reasonCode = 'EXECUTION_ERROR';
        if (errorMessage.includes('insufficient balance') || errorMessage.includes('saldo')) {
          reasonCode = 'INSUFFICIENT_BALANCE';
        } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
          reasonCode = 'RATE_LIMIT_EXCEEDED';
        } else if (errorMessage.includes('invalid symbol') || errorMessage.includes('símbolo inválido')) {
          reasonCode = 'INVALID_SYMBOL';
        } else if (errorMessage.includes('min notional') || errorMessage.includes('quantidade mínima')) {
          reasonCode = 'MIN_NOTIONAL_NOT_MET';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
          reasonCode = 'NETWORK_ERROR';
        }

        throw new Error(`${reasonCode}: ${errorMessage}`);
      }

      // Para ordens LIMIT, verificar se foi preenchida imediatamente
      const isLimitOrder = tradeJob.order_type === 'LIMIT';
      const orderStatus = order.status?.toUpperCase() || '';
      const isOrderFilled = orderStatus === 'FILLED' || orderStatus === 'CLOSED';
      const isOrderNew = orderStatus === 'NEW' || orderStatus === 'OPEN' || orderStatus === 'PENDING';
      const isOrderPartiallyFilled = orderStatus === 'PARTIALLY_FILLED';

      // Determinar quantidade executada e preço médio
      const executedQty = order.filled || (isOrderFilled ? (order.amount || baseQty) : 0);
      const avgPrice = order.average || order.price || tradeJob.limit_price?.toNumber() || 0;
      const cummQuoteQty = order.cost || (executedQty * avgPrice);

      // Se é ordem LIMIT e não foi preenchida, manter como PENDING_LIMIT
      if (isLimitOrder && isOrderNew && executedQty === 0) {
        // Criar execution apenas para registrar o exchange_order_id
        const execution = await this.prisma.tradeExecution.create({
          data: {
            trade_job_id: tradeJobId,
            exchange_account_id: tradeJob.exchange_account_id,
            trade_mode: tradeJob.trade_mode,
            exchange: tradeJob.exchange_account.exchange,
            exchange_order_id: order.id,
            client_order_id: `client-${tradeJobId}-${Date.now()}`,
            status_exchange: order.status,
            executed_qty: 0,
            cumm_quote_qty: 0,
            avg_price: tradeJob.limit_price?.toNumber() || 0,
            fills_json: order.fills || undefined,
            raw_response_json: JSON.parse(JSON.stringify(order)),
          },
        });

        // Manter status como PENDING_LIMIT para o monitor verificar depois
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: TradeJobStatus.PENDING_LIMIT,
            reason_code: 'LIMIT_ORDER_PLACED',
            reason_message: `Ordem LIMIT criada na exchange (${order.id}), aguardando preenchimento`,
          },
        });

        this.logger.log(`[EXECUTOR] Ordem LIMIT ${order.id} criada na exchange, aguardando preenchimento. Execution: ${execution.id}`);
        return {
          success: true,
          executionId: execution.id,
          executedQty: 0,
          avgPrice: tradeJob.limit_price?.toNumber() || 0,
          isPartiallyFilled: false,
          limitOrderPlaced: true,
          exchangeOrderId: order.id,
        };
      }

      // Verificar se ordem foi parcialmente preenchida
      const isPartiallyFilled = isOrderPartiallyFilled || (order.filled && order.filled < order.amount);

      // Create execution
      const execution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJobId,
          exchange_account_id: tradeJob.exchange_account_id,
          trade_mode: tradeJob.trade_mode,
          exchange: tradeJob.exchange_account.exchange,
          exchange_order_id: order.id,
          client_order_id: `client-${tradeJobId}-${Date.now()}`,
          status_exchange: order.status,
          executed_qty: executedQty,
          cumm_quote_qty: cummQuoteQty,
          avg_price: avgPrice,
          fills_json: order.fills || undefined,
          raw_response_json: JSON.parse(JSON.stringify(order)),
        },
      });

      this.logger.log(`[EXECUTOR] Execution criado: ${execution.id}, qty: ${executedQty}, price: ${avgPrice}`);

      // Update position apenas se quantidade executada > 0
      if (executedQty > 0) {
        const positionService = new PositionService(this.prisma);
        try {
          if (tradeJob.side === 'BUY') {
            const positionId = await positionService.onBuyExecuted(
              tradeJobId,
              execution.id,
              executedQty,
              avgPrice
            );
            this.logger.log(`[EXECUTOR] Posição de compra atualizada para job ${tradeJobId}, positionId: ${positionId}`);
            
            // Enviar notificação de posição aberta
            try {
              await this.notificationService.sendPositionOpened(positionId);
              this.logger.log(`[EXECUTOR] Notificação de posição aberta enviada para positionId: ${positionId}`);
            } catch (notifError: any) {
              this.logger.warn(`[EXECUTOR] Erro ao enviar notificação de posição aberta: ${notifError.message}`);
            }
          } else {
            // Buscar posições que serão fechadas antes de executar
            const positionsBefore = await this.prisma.tradePosition.findMany({
              where: {
                exchange_account_id: tradeJob.exchange_account_id,
                trade_mode: tradeJob.trade_mode,
                symbol: tradeJob.symbol,
                status: 'OPEN',
                qty_remaining: { gt: 0 },
              },
            });

            await positionService.onSellExecuted(
              tradeJobId,
              execution.id,
              executedQty,
              avgPrice,
              'WEBHOOK'
            );
            this.logger.log(`[EXECUTOR] Posição de venda atualizada para job ${tradeJobId}`);

            // Verificar quais posições foram fechadas ou parcialmente fechadas
            const positionsAfter = await this.prisma.tradePosition.findMany({
              where: {
                id: { in: positionsBefore.map(p => p.id) },
              },
            });

            // Enviar notificação para posições que foram fechadas ou parcialmente fechadas
            for (const posBefore of positionsBefore) {
              const posAfter = positionsAfter.find(p => p.id === posBefore.id);
              if (!posAfter) continue;

              const wasClosed = posAfter.status === 'CLOSED' && posBefore.status === 'OPEN';
              const wasPartiallyClosed = posAfter.qty_remaining.toNumber() < posBefore.qty_remaining.toNumber();

              if (wasClosed) {
                // Posição totalmente fechada - verificar motivo
                try {
                  // Verificar se foi SL (sl_triggered foi marcado antes ou close_reason indica SL)
                  if (posBefore.sl_triggered || posAfter.close_reason === 'STOP_LOSS') {
                    await this.notificationService.sendStopLoss(posAfter.id, execution.id);
                    this.logger.log(`[EXECUTOR] Notificação de Stop Loss enviada para positionId: ${posAfter.id}`);
                  } else {
                    // Outros motivos (TP, webhook, manual)
                    await this.notificationService.sendPositionClosed(posAfter.id);
                    this.logger.log(`[EXECUTOR] Notificação de posição fechada enviada para positionId: ${posAfter.id}`);
                  }
                } catch (notifError: any) {
                  this.logger.warn(`[EXECUTOR] Erro ao enviar notificação: ${notifError.message}`);
                }
              } else if (wasPartiallyClosed && posAfter.tp_enabled) {
                // Venda parcial com TP configurado - pode ser TP parcial
                // Marcar como partial_tp_triggered se ainda não estiver marcado
                if (!posAfter.partial_tp_triggered) {
                  await this.prisma.tradePosition.update({
                    where: { id: posAfter.id },
                    data: { partial_tp_triggered: true },
                  });
                }
                try {
                  await this.notificationService.sendPartialTP(posAfter.id, execution.id);
                  this.logger.log(`[EXECUTOR] Notificação de TP parcial enviada para positionId: ${posAfter.id}`);
                } catch (notifError: any) {
                  this.logger.warn(`[EXECUTOR] Erro ao enviar notificação de TP parcial: ${notifError.message}`);
                }
              }
            }
          }
        } catch (positionError: any) {
          this.logger.error(`[EXECUTOR] Erro ao atualizar posição: ${positionError.message}`, positionError.stack);
          // Não falhar o job se apenas a atualização de posição falhar
        }
      }

      // Update vault if applicable
      if (tradeJob.vault_id && executedQty > 0) {
        const vaultService = new VaultService(this.prisma);
        try {
          if (tradeJob.side === 'BUY') {
            await vaultService.confirmBuy(
              tradeJob.vault_id,
              'USDT',
              cummQuoteQty,
              tradeJobId
            );
            this.logger.log(`[EXECUTOR] Cofre atualizado (confirmBuy) para job ${tradeJobId}`);
          } else {
            await vaultService.creditOnSell(
              tradeJob.vault_id,
              'USDT',
              cummQuoteQty,
              tradeJobId
            );
            this.logger.log(`[EXECUTOR] Cofre atualizado (creditOnSell) para job ${tradeJobId}`);
          }
        } catch (vaultError: any) {
          this.logger.error(`[EXECUTOR] Erro ao atualizar cofre: ${vaultError.message}`, vaultError.stack);
          // Não falhar o job se apenas a atualização de cofre falhar
        }
      }

      // Update job status
      const finalStatus = isPartiallyFilled ? TradeJobStatus.PARTIALLY_FILLED : TradeJobStatus.FILLED;
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: {
          status: finalStatus,
          reason_code: isPartiallyFilled ? 'PARTIALLY_FILLED' : null,
          reason_message: isPartiallyFilled ? 'Ordem parcialmente preenchida' : null,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.log(`[EXECUTOR] Trade job ${tradeJobId} concluído com sucesso em ${duration}ms. Status: ${finalStatus}`);

      return {
        success: true,
        executionId: execution.id,
        executedQty,
        avgPrice,
        isPartiallyFilled,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';
      
      this.logger.error(`[EXECUTOR] Erro ao processar trade job ${tradeJobId} (${duration}ms): ${errorMessage}`, error.stack);

      // Determinar reason_code baseado no erro
      let reasonCode = 'EXECUTION_ERROR';
      let reasonMessage = errorMessage;

      if (errorMessage.includes('INSUFFICIENT_BALANCE')) {
        reasonCode = 'INSUFFICIENT_BALANCE';
        reasonMessage = 'Saldo insuficiente na exchange';
      } else if (errorMessage.includes('RATE_LIMIT_EXCEEDED')) {
        reasonCode = 'RATE_LIMIT_EXCEEDED';
        reasonMessage = 'Rate limit da exchange excedido';
      } else if (errorMessage.includes('INVALID_SYMBOL')) {
        reasonCode = 'INVALID_SYMBOL';
        reasonMessage = 'Símbolo inválido ou não suportado';
      } else if (errorMessage.includes('MIN_NOTIONAL_NOT_MET')) {
        reasonCode = 'MIN_NOTIONAL_NOT_MET';
        reasonMessage = 'Quantidade abaixo do mínimo permitido pela exchange';
      } else if (errorMessage.includes('NETWORK_ERROR')) {
        reasonCode = 'NETWORK_ERROR';
        reasonMessage = 'Erro de rede ou timeout na comunicação com a exchange';
      } else if (errorMessage.includes('API keys')) {
        reasonCode = 'INVALID_API_KEYS';
        reasonMessage = 'Credenciais de API inválidas ou expiradas';
      }

      // Update job status to FAILED
      try {
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: TradeJobStatus.FAILED,
            reason_code: reasonCode,
            reason_message: reasonMessage,
          },
        });
      } catch (updateError) {
        this.logger.error(`[EXECUTOR] Erro ao atualizar status do job para FAILED: ${updateError}`);
      }

      throw error;
    }
  }
}

