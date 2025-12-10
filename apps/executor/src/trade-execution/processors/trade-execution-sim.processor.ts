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
import { ExchangeType, TradeJobStatus, TradeMode, getBaseAsset, getQuoteAsset } from '@mvcashnode/shared';
import { randomUUID } from 'crypto';

@Processor('trade-execution-sim')
export class TradeExecutionSimProcessor extends WorkerHost {
  private readonly logger = new Logger(TradeExecutionSimProcessor.name);

  constructor(
    private prisma: PrismaService
  ) {
    super();
    // Para simulação, não enviar notificações por padrão (pode ser configurável depois)
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

      // ✅ CRITICAL FIX: Verificar se job já foi processado (previne reprocessamento)
      const finalStatuses: string[] = [
        TradeJobStatus.FILLED,
        TradeJobStatus.PARTIALLY_FILLED,
        TradeJobStatus.SKIPPED,
        TradeJobStatus.FAILED,
        TradeJobStatus.CANCELED,
      ];
      
      if (finalStatuses.includes(tradeJob.status as string)) {
        this.logger.warn(`[EXECUTOR-SIM] Job ${tradeJobId} já foi processado (status: ${tradeJob.status}), ignorando para evitar reprocessamento`);
        return {
          success: false,
          alreadyProcessed: true,
          status: tradeJob.status,
        };
      }

      // Log para debug de jobs PENDING_LIMIT
      if (tradeJob.status === TradeJobStatus.PENDING_LIMIT) {
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} - Status PENDING_LIMIT detectado, processando...`);
      }

      // ✅ CRITICAL FIX: Marcar como EXECUTING IMEDIATAMENTE (lock de processamento)
      if (tradeJob.status !== TradeJobStatus.EXECUTING) {
        try {
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: { status: TradeJobStatus.EXECUTING },
          });
          this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} marcado como EXECUTING (lock de processamento)`);
        } catch (updateError: any) {
          // Se falhar ao atualizar, pode ser race condition - verificar status novamente
          const recheckJob = await this.prisma.tradeJob.findUnique({
            where: { id: tradeJobId },
            select: { status: true },
          });
          
          if (recheckJob && finalStatuses.includes(recheckJob.status as string)) {
            this.logger.warn(`[EXECUTOR-SIM] Job ${tradeJobId} foi processado por outro worker (status: ${recheckJob.status}), abortando`);
            return {
              success: false,
              alreadyProcessed: true,
              status: recheckJob.status,
            };
          }
          
          this.logger.warn(`[EXECUTOR-SIM] Job ${tradeJobId} - Erro ao marcar como EXECUTING, mas continuando: ${updateError?.message}`);
        }
      }

      this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} - orderType=${tradeJob.order_type}, limitPrice=${tradeJob.limit_price?.toNumber() || 'NULL'}, side=${tradeJob.side}`);

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
            tradeJob.trade_mode as TradeMode
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

      // Status já foi atualizado para EXECUTING no início (lock de processamento)

      // Para ordens LIMIT com limitPrice, não precisamos buscar preço atual
      // Podemos usar o limitPrice diretamente
      let currentPrice: number | null = null;
      
      if (tradeJob.order_type === 'LIMIT' && tradeJob.limit_price) {
        // Para ordens LIMIT, usar limitPrice como preço atual (não precisa buscar)
        currentPrice = tradeJob.limit_price.toNumber();
        this.logger.log(`[EXECUTOR-SIM] Ordem LIMIT detectada - usando limitPrice ${currentPrice} como preço atual (não buscando da exchange)`);
      } else {
        // Para ordens MARKET ou LIMIT sem limitPrice, buscar preço atual
        // Create read-only adapter (no API keys needed for simulation)
        const adapter = AdapterFactory.createAdapter(
          tradeJob.exchange_account.exchange as ExchangeType
        );

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
      }

      // ✅ CRITICAL FIX: Validar posição ANTES de simular execução (previne execuções inválidas)
      if (tradeJob.position_id_to_close && tradeJob.side === 'SELL') {
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} - Validando posição ${tradeJob.position_id_to_close} antes de simular execução...`);
        
        const targetPosition = await this.prisma.tradePosition.findUnique({
          where: { id: tradeJob.position_id_to_close },
        });
        
        if (!targetPosition) {
          this.logger.error(`[EXECUTOR-SIM] Job ${tradeJobId} - Posição ${tradeJob.position_id_to_close} não encontrada`);
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: 'POSITION_NOT_ELIGIBLE',
              reason_message: `Position ${tradeJob.position_id_to_close} not found`,
            },
          });
          return {
            success: false,
            skipped: true,
            reason: 'POSITION_NOT_ELIGIBLE',
            message: `Position ${tradeJob.position_id_to_close} not found`,
          };
        }
        
        // Validar elegibilidade (MESMA LÓGICA de onSellExecuted)
        const isEligible = 
          targetPosition.exchange_account_id === tradeJob.exchange_account_id &&
          targetPosition.trade_mode === tradeJob.trade_mode &&
          targetPosition.symbol === tradeJob.symbol &&
          targetPosition.side === 'LONG' &&
          targetPosition.status === 'OPEN' &&
          targetPosition.qty_remaining.toNumber() > 0;
        
        if (!isEligible) {
          this.logger.error(`[EXECUTOR-SIM] Job ${tradeJobId} - Posição ${tradeJob.position_id_to_close} não é elegível para fechamento`);
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: 'POSITION_NOT_ELIGIBLE',
              reason_message: `Position ${tradeJob.position_id_to_close} is not eligible for closing`,
            },
          });
          return {
            success: false,
            skipped: true,
            reason: 'POSITION_NOT_ELIGIBLE',
            message: `Position ${tradeJob.position_id_to_close} is not eligible for closing`,
          };
        }
        
        // Verificar lock para webhook
        const isWebhookOrigin = !!tradeJob.webhook_event_id;
        if (isWebhookOrigin && targetPosition.lock_sell_by_webhook) {
          this.logger.error(`[EXECUTOR-SIM] Job ${tradeJobId} - Posição ${tradeJob.position_id_to_close} está bloqueada para vendas via webhook`);
          await this.prisma.tradeJob.update({
            where: { id: tradeJobId },
            data: {
              status: TradeJobStatus.SKIPPED,
              reason_code: 'WEBHOOK_LOCK',
              reason_message: 'Position is locked for webhook sells',
            },
          });
          return {
            success: false,
            skipped: true,
            reason: 'WEBHOOK_LOCK',
            message: 'Position is locked for webhook sells',
          };
        }
        
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} - Posição ${tradeJob.position_id_to_close} validada com sucesso, elegível para fechamento`);
      }

      // Calculate executed quantity and average price
      let executedQty = baseQty;
      let avgPrice: number;

      // Se for ordem com quote_amount, calcular base_quantity
      if (quoteAmount > 0 && baseQty === 0) {
        // Para ordens LIMIT, usar limitPrice para calcular quantidade se disponível
        if (tradeJob.order_type === 'LIMIT' && tradeJob.limit_price) {
          const limitPrice = tradeJob.limit_price.toNumber();
          executedQty = quoteAmount / limitPrice;
          this.logger.log(`[EXECUTOR-SIM] Calculando quantidade para ordem LIMIT: ${quoteAmount} / ${limitPrice} = ${executedQty}`);
        } else {
          if (!currentPrice) {
            throw new Error(`Preço atual não disponível para calcular quantidade`);
          }
          executedQty = quoteAmount / currentPrice;
          this.logger.log(`[EXECUTOR-SIM] Calculando quantidade para ordem MARKET: ${quoteAmount} / ${currentPrice} = ${executedQty}`);
        }
      }

      // If it's a LIMIT order, ALWAYS use limitPrice (não usar preço atual)
      if (tradeJob.order_type === 'LIMIT' && tradeJob.limit_price) {
        const limitPrice = tradeJob.limit_price.toNumber();
        
        // Para ordens LIMIT, sempre usar limitPrice como preço de execução
        // Em simulação, assumimos que a ordem pode ser executada se foi criada
        avgPrice = limitPrice;
        this.logger.log(`[EXECUTOR-SIM] ✅ Ordem LIMIT executada a preço ${limitPrice} (lado: ${tradeJob.side})`);
      } else if (tradeJob.order_type === 'MARKET') {
        // Para ordens MARKET, usar preço atual
        if (!currentPrice) {
          throw new Error(`Preço atual não disponível para ordem MARKET`);
        }
        avgPrice = currentPrice;
        this.logger.debug(`[EXECUTOR-SIM] Ordem MARKET executada a preço atual ${currentPrice}`);
      } else {
        // Fallback: usar currentPrice se disponível
        if (currentPrice) {
          avgPrice = currentPrice;
          this.logger.debug(`[EXECUTOR-SIM] Usando preço atual ${currentPrice} como fallback`);
        } else {
          throw new Error(`Preço não disponível para executar ordem`);
        }
      }

      if (executedQty === 0) {
        // Order not executed (sem quantidade)
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: {
            status: TradeJobStatus.FAILED,
            reason_code: 'ZERO_QUANTITY',
            reason_message: `Quantidade executada é zero`,
          },
        });
        this.logger.log(`[EXECUTOR-SIM] Trade job ${tradeJobId} marcado como FAILED (quantidade zero)`);
        return { success: false, message: 'Executed quantity is zero' };
      }

      // VALIDAÇÃO DE SEGURANÇA: Verificar lucro mínimo antes de executar venda
      if (tradeJob.side === 'SELL') {
        try {
          const openPosition = await this.prisma.tradePosition.findFirst({
            where: {
              exchange_account_id: tradeJob.exchange_account_id,
              symbol: tradeJob.symbol,
              trade_mode: tradeJob.trade_mode,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
            },
            orderBy: {
              created_at: 'asc',
            },
          });

          if (openPosition) {
            const positionService = new PositionService(this.prisma);
            const validationResult = await positionService.validateMinProfit(openPosition.id, avgPrice);

            if (!validationResult.valid) {
              this.logger.warn(`[EXECUTOR-SIM] ⚠️ Validação de lucro mínimo FALHOU: ${validationResult.reason}`);
              await this.prisma.tradeJob.update({
                where: { id: tradeJobId },
                data: {
                  status: TradeJobStatus.FAILED,
                  reason_code: 'MIN_PROFIT_NOT_MET',
                  reason_message: validationResult.reason,
                },
              });
              throw new Error(`Venda não permitida: ${validationResult.reason}`);
            } else {
              this.logger.log(`[EXECUTOR-SIM] ✅ Validação de lucro mínimo PASSOU: ${validationResult.reason}`);
            }
          }
        } catch (validationError: any) {
          if (validationError.message.includes('MIN_PROFIT_NOT_MET') || validationError.message.includes('Venda não permitida')) {
            throw validationError;
          }
          // Se for outro erro, apenas logar e continuar (não bloquear execução)
          this.logger.warn(`[EXECUTOR-SIM] Erro ao validar lucro mínimo (continuando): ${validationError.message}`);
        }
      }

      // Create simulated execution
      const cummQuoteQty = executedQty * avgPrice;
      
      // Calcular taxas simuladas (0.1% padrão)
      const DEFAULT_FEE_RATE = 0.001; // 0.1%
      let feeAmount: number | null = null;
      let feeCurrency: string | null = null;
      let feeRate: number | null = DEFAULT_FEE_RATE * 100; // 0.1%
      
      if (tradeJob.side === 'BUY') {
        // Para compra, taxa geralmente é em base asset ou quote asset
        // Vamos simular como quote asset (mais comum)
        const quoteAsset = getQuoteAsset(tradeJob.symbol);
        feeAmount = cummQuoteQty * DEFAULT_FEE_RATE;
        feeCurrency = quoteAsset;
      } else {
        // Para venda, taxa geralmente é em base asset
        const baseAsset = getBaseAsset(tradeJob.symbol);
        feeAmount = executedQty * DEFAULT_FEE_RATE;
        feeCurrency = baseAsset;
      }
      
      // ✅ BUG 3 FIX: NÃO ajustar quantidade executada para taxas em base asset
      // A exchange mantém a quantidade BRUTA (incluindo taxa), então devemos salvar a quantidade bruta
      // na execution e posição para que bata com o saldo na exchange
      let adjustedExecutedQty = executedQty; // Usar quantidade bruta (sem ajuste)
      
      // Ajustar cumm_quote_qty se taxa for em quote asset (SELL) - isso está correto
      let adjustedCummQuoteQty = cummQuoteQty;
      if (tradeJob.side === 'SELL' && feeAmount && feeCurrency) {
        const quoteAsset = getQuoteAsset(tradeJob.symbol);
        if (feeCurrency === quoteAsset) {
          adjustedCummQuoteQty = Math.max(0, cummQuoteQty - feeAmount);
        }
      }
      
      const execution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJobId,
          exchange_account_id: tradeJob.exchange_account_id,
          trade_mode: tradeJob.trade_mode,
          exchange: tradeJob.exchange_account.exchange,
          exchange_order_id: `SIM-${randomUUID()}`,
          client_order_id: `client-${tradeJobId}-${Date.now()}`,
          status_exchange: 'FILLED',
          executed_qty: adjustedExecutedQty,
          cumm_quote_qty: adjustedCummQuoteQty,
          avg_price: avgPrice,
          fee_amount: feeAmount || undefined,
          fee_currency: feeCurrency || undefined,
          fee_rate: feeRate || undefined,
          raw_response_json: {
            simulated: true,
            price: avgPrice,
            current_price: currentPrice,
            fee_amount: feeAmount,
            fee_currency: feeCurrency,
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
            adjustedExecutedQty,
            avgPrice,
            feeAmount || undefined,
            feeCurrency || undefined
          );
          this.logger.log(`[EXECUTOR-SIM] Posição de compra atualizada para job ${tradeJobId}`);
        } else {
          // Determinar origin baseado na posição vinculada ou posições elegíveis
          let sellOrigin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING' = 'WEBHOOK';
          
          // Se há position_id_to_close, buscar essa posição específica para determinar origin
          if (tradeJob.position_id_to_close) {
            const targetPosition = await this.prisma.tradePosition.findUnique({
              where: { id: tradeJob.position_id_to_close },
            });
            
            if (targetPosition) {
              this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} tem position_id_to_close=${tradeJob.position_id_to_close}, verificando flags dessa posição`);
              
              if (targetPosition.tp_triggered) {
                sellOrigin = 'TAKE_PROFIT';
                this.logger.log(`[EXECUTOR-SIM] Origin determinado como TAKE_PROFIT (posição ${targetPosition.id} vinculada tem tp_triggered=true)`);
              } else if (targetPosition.sl_triggered) {
                sellOrigin = 'STOP_LOSS';
                this.logger.log(`[EXECUTOR-SIM] Origin determinado como STOP_LOSS (posição ${targetPosition.id} vinculada tem sl_triggered=true)`);
              } else if (targetPosition.trailing_triggered) {
                sellOrigin = 'TRAILING';
                this.logger.log(`[EXECUTOR-SIM] Origin determinado como TRAILING (posição ${targetPosition.id} vinculada tem trailing_triggered=true)`);
              } else {
                // Se não tem flags, verificar webhook_event_id
                if (tradeJob.webhook_event_id) {
                  sellOrigin = 'WEBHOOK';
                  this.logger.log(`[EXECUTOR-SIM] Origin determinado como WEBHOOK (posição ${targetPosition.id} vinculada, trade job tem webhook_event_id)`);
                } else {
                  sellOrigin = 'MANUAL';
                  this.logger.log(`[EXECUTOR-SIM] Origin determinado como MANUAL (posição ${targetPosition.id} vinculada, sem webhook_event_id)`);
                }
              }
            } else {
              this.logger.warn(`[EXECUTOR-SIM] Job ${tradeJobId} tem position_id_to_close=${tradeJob.position_id_to_close} mas posição não encontrada, usando lógica padrão`);
              // Fallback para lógica padrão
              sellOrigin = tradeJob.webhook_event_id ? 'WEBHOOK' : 'MANUAL';
            }
          } else {
            // Buscar posições que serão fechadas antes de executar (lógica FIFO)
            const positionsBefore = await this.prisma.tradePosition.findMany({
              where: {
                exchange_account_id: tradeJob.exchange_account_id,
                trade_mode: tradeJob.trade_mode,
                symbol: tradeJob.symbol,
                status: 'OPEN',
                qty_remaining: { gt: 0 },
              },
            });

            if (positionsBefore.length > 0) {
              // Verificar flags na primeira posição (FIFO)
              const firstPosition = positionsBefore[0];
              
              if (firstPosition.tp_triggered) {
                sellOrigin = 'TAKE_PROFIT';
                this.logger.log(`[EXECUTOR-SIM] Origin determinado como TAKE_PROFIT (posição ${firstPosition.id} tem tp_triggered=true)`);
              } else if (firstPosition.sl_triggered) {
                sellOrigin = 'STOP_LOSS';
                this.logger.log(`[EXECUTOR-SIM] Origin determinado como STOP_LOSS (posição ${firstPosition.id} tem sl_triggered=true)`);
              } else if (firstPosition.trailing_triggered) {
                sellOrigin = 'TRAILING';
                this.logger.log(`[EXECUTOR-SIM] Origin determinado como TRAILING (posição ${firstPosition.id} tem trailing_triggered=true)`);
              } else {
                // Verificar se não há webhook_event_id no trade job
                if (!tradeJob.webhook_event_id) {
                  if (tradeJob.reason_code?.includes('TAKE_PROFIT') || tradeJob.reason_message?.includes('Take Profit')) {
                    sellOrigin = 'TAKE_PROFIT';
                  } else if (tradeJob.reason_code?.includes('STOP_LOSS') || tradeJob.reason_message?.includes('Stop Loss')) {
                    sellOrigin = 'STOP_LOSS';
                  } else {
                    sellOrigin = 'MANUAL';
                  }
                  this.logger.log(`[EXECUTOR-SIM] Origin determinado como ${sellOrigin} (sem webhook_event_id, reason_code: ${tradeJob.reason_code})`);
                } else {
                  sellOrigin = 'WEBHOOK';
                  this.logger.log(`[EXECUTOR-SIM] Origin determinado como WEBHOOK (trade job tem webhook_event_id)`);
                }
              }
            }
          }

          this.logger.log(`[EXECUTOR-SIM] Chamando onSellExecuted para job ${tradeJobId}: qty=${adjustedExecutedQty}, price=${avgPrice}, origin=${sellOrigin}, position_id_to_close=${tradeJob.position_id_to_close || 'N/A'}`);
          
          await positionService.onSellExecuted(
            tradeJobId,
            execution.id,
            adjustedExecutedQty,
            avgPrice,
            sellOrigin,
            feeAmount || undefined,
            feeCurrency || undefined
          );
          this.logger.log(`[EXECUTOR-SIM] Posição de venda atualizada para job ${tradeJobId} (origin: ${sellOrigin})`);
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

      // Update job status - verificar status atual antes de atualizar
      // onSellExecuted pode ter marcado como SKIPPED, FILLED ou PARTIALLY_FILLED
      const currentJob = await this.prisma.tradeJob.findUnique({
        where: { id: tradeJobId },
        select: { status: true },
      });

      // Se o job já foi marcado como SKIPPED por onSellExecuted (quando não há posições elegíveis), não sobrescrever
      if (currentJob?.status === TradeJobStatus.SKIPPED) {
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} já está como SKIPPED (marcado por onSellExecuted), não atualizando status`);
      }
      // Se o job já foi marcado como FILLED ou PARTIALLY_FILLED por onSellExecuted, manter esse status
      else if (currentJob?.status === TradeJobStatus.FILLED || currentJob?.status === TradeJobStatus.PARTIALLY_FILLED) {
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} já está como ${currentJob.status} (marcado por onSellExecuted), mantendo status`);
      }
      // Se o status ainda é EXECUTING ou outro status intermediário, atualizar para FILLED
      else {
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: { status: TradeJobStatus.FILLED },
        });
        this.logger.log(`[EXECUTOR-SIM] Job ${tradeJobId} atualizado para status: FILLED`);
      }

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

      // Lista de erros não recuperáveis (não adianta tentar de novo)
      const nonRecoverableErrors = [
        'INVALID_PRECISION',
        'INVALID_QUANTITY',
        'INVALID_SYMBOL',
        'INVALID_PRICE',
      ];

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

      // Se for erro não recuperável, retornar sem lançar (evita retry do BullMQ)
      if (nonRecoverableErrors.includes(reasonCode)) {
        this.logger.warn(`[EXECUTOR-SIM] Job ${tradeJobId} - Erro não recuperável (${reasonCode}), não será retentado`);
        return; // Retornar sem lançar erro
      }

      // Para erros recuperáveis, lançar para permitir retry do BullMQ
      throw error;
    }
  }
}

