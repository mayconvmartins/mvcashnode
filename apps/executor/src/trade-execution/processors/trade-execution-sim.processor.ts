import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import {
  PositionService,
  VaultService,
  TradeParameterService,
} from '@mvcashnode/domain';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus } from '@mvcashnode/shared';
import { randomUUID } from 'crypto';
import { NotificationHttpService } from '@mvcashnode/notifications';

@Processor('trade-execution-sim')
export class TradeExecutionSimProcessor extends WorkerHost {
  private readonly logger = new Logger(TradeExecutionSimProcessor.name);
  private notificationService: NotificationHttpService;

  constructor(
    private prisma: PrismaService
  ) {
    super();
    // Para simulação, não enviar notificações por padrão (pode ser configurável depois)
    // this.notificationService = new NotificationHttpService(process.env.API_URL || 'http://localhost:4010');
  }

  async process(job: Job<any>): Promise<any> {
    const { tradeJobId } = job.data;
    const startTime = Date.now();

    this.logger.log(`[EXECUTOR-SIM] Processando trade job ${tradeJobId} (SIMULATION)`);

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

      if (tradeJob.trade_mode !== 'SIMULATION') {
        throw new Error(`Trade job ${tradeJobId} não é do modo SIMULATION`);
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
      let baseQty = tradeJob.base_quantity?.toNumber() || 0;
      let quoteAmount = tradeJob.quote_amount?.toNumber() || 0;

      // Se não tem quantidade e é BUY, tentar buscar dos parâmetros
      if (baseQty <= 0 && quoteAmount <= 0 && tradeJob.side === 'BUY') {
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} sem quantidade, tentando buscar dos parâmetros...`);
        try {
          const tradeParameterService = new TradeParameterService(this.prisma);
          quoteAmount = await tradeParameterService.computeQuoteAmount(
            tradeJob.exchange_account_id,
            tradeJob.symbol,
            tradeJob.side,
            tradeJob.trade_mode
          );
          
          // Validar se a quantidade calculada é válida
          if (!quoteAmount || quoteAmount <= 0) {
            throw new Error('Quantidade calculada é inválida ou zero');
          }
          
          this.logger.log(`[EXECUTOR-SIM] Quantidade calculada dos parâmetros: ${quoteAmount} USDT`);
          
          // Atualizar o job com a quantidade calculada
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: { quote_amount: quoteAmount },
          });
        } catch (error: any) {
          const errorMessage = error?.message || 'Erro desconhecido';
          this.logger.error(`[EXECUTOR-SIM] Erro ao buscar quantidade dos parâmetros para job ${tradeJobId}: ${errorMessage}`);
          
          // Determinar reason_code baseado no tipo de erro
          let reasonCode = 'MISSING_TRADE_PARAMETER';
          let reasonMessage = errorMessage;
          
          if (errorMessage.includes('not found') || errorMessage.includes('Trade parameter not found')) {
            reasonCode = 'MISSING_TRADE_PARAMETER';
            reasonMessage = `Parâmetro de trade não encontrado para conta ${tradeJob.exchange_account_id}, símbolo ${tradeJob.symbol}, lado ${tradeJob.side}`;
          } else if (errorMessage.includes('Balance not found')) {
            reasonCode = 'BALANCE_NOT_FOUND';
            reasonMessage = `Saldo não encontrado para calcular quantidade (conta ${tradeJob.exchange_account_id}, modo ${tradeJob.trade_mode})`;
          } else if (errorMessage.includes('No quote amount configuration')) {
            reasonCode = 'INVALID_TRADE_PARAMETER';
            reasonMessage = `Parâmetro de trade encontrado mas sem configuração de quantidade (quote_amount_fixed ou quote_amount_pct_balance)`;
          } else if (errorMessage.includes('inválida') || errorMessage.includes('zero')) {
            reasonCode = 'INVALID_QUANTITY_CALCULATED';
            reasonMessage = `Quantidade calculada é inválida ou zero`;
          }
          
          // Marcar job como FAILED com reason_code específico
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.FAILED,
              reason_code: reasonCode,
              reason_message: reasonMessage,
            },
          });
          
          throw new Error(`Quantidade inválida para trade job ${tradeJobId}: ${reasonMessage}`);
        }
      }

      // Se não tem quantidade e é SELL, tentar buscar da posição aberta
      if (baseQty <= 0 && quoteAmount <= 0 && tradeJob.side === 'SELL') {
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} SELL sem quantidade, tentando buscar da posição aberta...`);
        try {
          const openPosition = await this.prisma.tradePosition.findFirst({
            where: {
              exchange_account_id: tradeJob.exchange_account_id,
              symbol: tradeJob.symbol,
              trade_mode: tradeJob.trade_mode,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
              lock_sell_by_webhook: false, // Não vender se estiver bloqueado
            },
            orderBy: {
              created_at: 'asc', // FIFO - vender a posição mais antiga primeiro
            },
          });

          if (openPosition) {
            baseQty = openPosition.qty_remaining.toNumber();
            this.logger.log(`[EXECUTOR-SIM] Posição aberta encontrada: ID ${openPosition.id}, quantidade: ${baseQty}`);
            
            // Atualizar o job com a quantidade encontrada
            await this.prisma.tradeJob.update({
              where: { id: tradeJobId },
              data: { base_quantity: baseQty },
            });
          } else {
            // Não há posição aberta - marcar como SKIPPED
            this.logger.warn(`[EXECUTOR-SIM] Nenhuma posição aberta encontrada para vender ${tradeJob.symbol} na conta ${tradeJob.exchange_account_id}`);
            await this.prisma.tradeJob.update({
              where: { id: tradeJobId },
              data: {
                status: TradeJobStatus.SKIPPED,
                reason_code: 'NO_ELIGIBLE_POSITIONS',
                reason_message: `Nenhuma posição aberta encontrada para vender ${tradeJob.symbol}`,
              },
            });
            return {
              success: false,
              skipped: true,
              reason: 'NO_ELIGIBLE_POSITIONS',
              message: 'Nenhuma posição aberta encontrada para vender',
            };
          }
        } catch (error: any) {
          this.logger.error(`[EXECUTOR-SIM] Erro ao buscar posição aberta: ${error.message}`);
          throw new Error(`Quantidade inválida para trade job ${tradeJobId} e não foi possível buscar posição aberta: ${error.message}`);
        }
      }

      if (baseQty <= 0 && quoteAmount <= 0) {
        throw new Error(`Quantidade inválida para trade job ${tradeJobId}`);
      }

      // Update status to EXECUTING
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: { status: TradeJobStatus.EXECUTING },
      });

      this.logger.debug(`[EXECUTOR-SIM] Trade job ${tradeJobId} marcado como EXECUTING`);

      // For simulation, we need to get current price
      // Create read-only adapter (no API keys needed for simulation)
      const adapter = AdapterFactory.createAdapter(
        tradeJob.exchange_account.exchange as ExchangeType
      );

      // Get current price
      let currentPrice: number;
      try {
        const ticker = await adapter.fetchTicker(tradeJob.symbol);
        currentPrice = ticker.last;

        if (!currentPrice || currentPrice <= 0) {
          throw new Error(`Preço inválido obtido da exchange: ${currentPrice}`);
        }

        this.logger.debug(`[EXECUTOR-SIM] Preço atual de ${tradeJob.symbol}: ${currentPrice}`);
      } catch (error: any) {
        const errorMessage = error?.message || 'Erro ao buscar preço';
        throw new Error(`Erro ao buscar preço de ${tradeJob.symbol}: ${errorMessage}`);
      }

      // Calculate executed quantity and average price
      let executedQty = baseQty;
      let avgPrice = currentPrice;

      // Se for ordem com quote_amount, calcular base_quantity
      if (quoteAmount > 0 && baseQty === 0) {
        executedQty = quoteAmount / currentPrice;
      }

      // If it's a LIMIT order, check if price was reached
      if (tradeJob.order_type === 'LIMIT' && tradeJob.limit_price) {
        const limitPrice = tradeJob.limit_price.toNumber();
        this.logger.debug(`[EXECUTOR-SIM] Verificando ordem LIMIT: preço atual ${currentPrice}, limite ${limitPrice}, lado ${tradeJob.side}`);

        if (tradeJob.side === 'BUY' && currentPrice > limitPrice) {
          // Limit not reached for buy (preço atual maior que limite)
          executedQty = 0;
          this.logger.debug(`[EXECUTOR-SIM] Ordem LIMIT BUY não executada: preço atual (${currentPrice}) > limite (${limitPrice})`);
        } else if (tradeJob.side === 'SELL' && currentPrice < limitPrice) {
          // Limit not reached for sell (preço atual menor que limite)
          executedQty = 0;
          this.logger.debug(`[EXECUTOR-SIM] Ordem LIMIT SELL não executada: preço atual (${currentPrice}) < limite (${limitPrice})`);
        } else {
          avgPrice = limitPrice;
          this.logger.debug(`[EXECUTOR-SIM] Ordem LIMIT executada a preço ${limitPrice}`);
        }
      }

      if (executedQty === 0) {
        // Order not executed (LIMIT order not reached)
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: TradeJobStatus.PENDING_LIMIT,
            reason_code: 'LIMIT_NOT_REACHED',
            reason_message: `Preço atual (${currentPrice}) não atingiu o limite (${tradeJob.limit_price?.toNumber()})`,
          },
        });
        this.logger.log(`[EXECUTOR-SIM] Trade job ${tradeJobId} marcado como PENDING_LIMIT`);
        return { success: false, message: 'Limit order not reached', currentPrice, limitPrice: tradeJob.limit_price?.toNumber() };
      }

      // Create simulated execution
      const cummQuoteQty = executedQty * avgPrice;
      const execution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJobId,
          exchange_account_id: tradeJob.exchange_account_id,
          trade_mode: tradeJob.trade_mode,
          exchange: tradeJob.exchange_account.exchange,
          exchange_order_id: `SIM-${randomUUID()}`,
          client_order_id: `client-${tradeJobId}-${Date.now()}`,
          status_exchange: 'FILLED',
          executed_qty: executedQty,
          cumm_quote_qty: cummQuoteQty,
          avg_price: avgPrice,
          raw_response_json: {
            simulated: true,
            price: avgPrice,
            current_price: currentPrice,
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(`[EXECUTOR-SIM] Execution criado: ${execution.id}, qty: ${executedQty}, price: ${avgPrice}`);

      // Update position
      const positionService = new PositionService(this.prisma);
      try {
        if (tradeJob.side === 'BUY') {
          await positionService.onBuyExecuted(
            tradeJobId,
            execution.id,
            executedQty,
            avgPrice
          );
          this.logger.log(`[EXECUTOR-SIM] Posição de compra atualizada para job ${tradeJobId}`);
        } else {
          await positionService.onSellExecuted(
            tradeJobId,
            execution.id,
            executedQty,
            avgPrice,
            'WEBHOOK'
          );
          this.logger.log(`[EXECUTOR-SIM] Posição de venda atualizada para job ${tradeJobId}`);
        }
      } catch (positionError: any) {
        this.logger.error(`[EXECUTOR-SIM] Erro ao atualizar posição: ${positionError.message}`, positionError.stack);
        // Não falhar o job se apenas a atualização de posição falhar
      }

      // Update vault if applicable
      if (tradeJob.vault_id) {
        const vaultService = new VaultService(this.prisma);
        try {
          if (tradeJob.side === 'BUY') {
            await vaultService.confirmBuy(
              tradeJob.vault_id,
              'USDT',
              cummQuoteQty,
              tradeJobId
            );
            this.logger.log(`[EXECUTOR-SIM] Cofre atualizado (confirmBuy) para job ${tradeJobId}`);
          } else {
            await vaultService.creditOnSell(
              tradeJob.vault_id,
              'USDT',
              cummQuoteQty,
              tradeJobId
            );
            this.logger.log(`[EXECUTOR-SIM] Cofre atualizado (creditOnSell) para job ${tradeJobId}`);
          }
        } catch (vaultError: any) {
          this.logger.error(`[EXECUTOR-SIM] Erro ao atualizar cofre: ${vaultError.message}`, vaultError.stack);
          // Não falhar o job se apenas a atualização de cofre falhar
        }
      }

      // Update job status
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: { status: TradeJobStatus.FILLED },
      });

      const duration = Date.now() - startTime;
      this.logger.log(`[EXECUTOR-SIM] Trade job ${tradeJobId} concluído com sucesso em ${duration}ms`);

      return {
        success: true,
        executionId: execution.id,
        executedQty,
        avgPrice,
        simulated: true,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(`[EXECUTOR-SIM] Erro ao processar trade job ${tradeJobId} (${duration}ms): ${errorMessage}`, error.stack);

      // Determinar reason_code baseado no erro
      let reasonCode = 'EXECUTION_ERROR';
      let reasonMessage = errorMessage;

      if (errorMessage.includes('preço') || errorMessage.includes('price')) {
        reasonCode = 'PRICE_FETCH_ERROR';
        reasonMessage = 'Erro ao buscar preço atual da exchange';
      } else if (errorMessage.includes('símbolo') || errorMessage.includes('symbol')) {
        reasonCode = 'INVALID_SYMBOL';
        reasonMessage = 'Símbolo inválido ou não suportado';
      } else if (errorMessage.includes('quantidade') || errorMessage.includes('quantity')) {
        reasonCode = 'INVALID_QUANTITY';
        reasonMessage = 'Quantidade inválida';
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
        this.logger.error(`[EXECUTOR-SIM] Erro ao atualizar status do job para FAILED: ${updateError}`);
      }

      throw error;
    }
  }
}

