import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { EncryptionService, getQuoteAsset } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus, TradeMode } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';
import { releaseSellLock } from '../utils/sell-lock';

@Processor('limit-orders-monitor-real')
export class LimitOrdersMonitorRealProcessor extends WorkerHost {
  private readonly logger = new Logger(LimitOrdersMonitorRealProcessor.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'limit-orders-monitor-real';
    this.logger.log('[LIMIT-ORDERS-MONITOR-REAL] Iniciando monitoramento de ordens LIMIT...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
    // ✅ OTIMIZAÇÃO CPU: Select específico para buscar apenas campos necessários
    const limitOrders = await this.prisma.tradeJob.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: TradeJobStatus.PENDING_LIMIT,
        order_type: 'LIMIT',
      },
      select: {
        id: true,
        symbol: true,
        side: true,
        exchange_account_id: true,
        trade_mode: true,
        limit_order_expires_at: true,
        position_id_to_close: true,
        exchange_account: {
          select: {
            id: true,
            exchange: true,
            testnet: true,
          },
        },
        executions: {
          take: 1,
          orderBy: { id: 'desc' },
          select: {
            id: true,
            exchange_order_id: true,
            executed_qty: true,
            avg_price: true,
          },
        },
      },
    });

    const accountService = new (await import('@mvcashnode/domain')).ExchangeAccountService(
      this.prisma,
      this.encryptionService
    );
    const positionService = new PositionService(this.prisma);
    let filled = 0;
    let canceled = 0;

    for (const order of limitOrders) {
      try {
        // Check expiration
        if (order.limit_order_expires_at && order.limit_order_expires_at < new Date()) {
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: {
              status: TradeJobStatus.CANCELED,
              reason_code: 'EXPIRED',
            },
          });
          canceled++;
          continue;
        }

        // Get API keys
        const keys = await accountService.decryptApiKeys(order.exchange_account_id);
        if (!keys) continue;

        // ✅ Se for SELL e a posição alvo já fechou, verificar status da ordem na exchange ANTES de cancelar
        if (order.side === 'SELL' && order.position_id_to_close) {
          const pos = await this.prisma.tradePosition.findUnique({
            where: { id: order.position_id_to_close },
            select: { id: true, status: true, qty_remaining: true },
          });

          if (!pos || pos.status !== 'OPEN' || pos.qty_remaining.toNumber() <= 0) {
            const existingExecution = order.executions && order.executions.length > 0 ? order.executions[0] : null;
            const exchangeOrderId = existingExecution?.exchange_order_id;

            // ✅ CORREÇÃO CRÍTICA: Verificar status da ordem na exchange ANTES de decidir cancelar
            if (exchangeOrderId) {
              try {
                const adapter = AdapterFactory.createAdapter(
                  order.exchange_account.exchange as ExchangeType,
                  keys.apiKey,
                  keys.apiSecret,
                  { testnet: order.exchange_account.testnet }
                );
                
                // PRIMEIRO: Buscar status atual da ordem na exchange
                const exchangeOrder = await adapter.fetchOrder(exchangeOrderId, order.symbol);
                
                // Se a ordem JÁ FOI EXECUTADA na exchange, processar como FILLED (não cancelar!)
                if (exchangeOrder.status === 'FILLED' || exchangeOrder.status === 'closed') {
                  this.logger.warn(
                    `[LIMIT-ORDERS-MONITOR] ⚠️ Ordem ${order.id} (${exchangeOrderId}) já foi EXECUTADA na exchange ` +
                    `mesmo com posição ${order.position_id_to_close} fechada. Processando como FILLED...`
                  );
                  
                  // Extrair dados da execução
                  const executedQty = exchangeOrder.filled || exchangeOrder.amount || 0;
                  const avgPrice = exchangeOrder.average || exchangeOrder.price || 0;
                  let cummQuoteQty = exchangeOrder.cost || 0;
                  
                  // Extrair taxas
                  let feeAmount: number | null = null;
                  let feeCurrency: string | null = null;
                  let feeRate: number | null = null;
                  try {
                    const fees = adapter.extractFeesFromOrder(exchangeOrder, 'sell');
                    feeAmount = fees.feeAmount;
                    feeCurrency = fees.feeCurrency;
                    if (feeAmount && feeAmount > 0 && cummQuoteQty > 0) {
                      feeRate = (feeAmount / cummQuoteQty) * 100;
                    }
                    // Ajustar cumm_quote_qty se taxa for em quote asset
                    const quoteAsset = getQuoteAsset(order.symbol);
                    if (feeCurrency === quoteAsset && feeAmount) {
                      cummQuoteQty = Math.max(0, cummQuoteQty - feeAmount);
                    }
                  } catch (feeErr: any) {
                    this.logger.warn(`[LIMIT-ORDERS-MONITOR] Erro ao extrair taxas: ${feeErr.message}`);
                  }
                  
                  // Atualizar execution existente
                  if (existingExecution) {
                    await this.prisma.tradeExecution.update({
                      where: { id: existingExecution.id },
                      data: {
                        status_exchange: exchangeOrder.status,
                        executed_qty: executedQty,
                        cumm_quote_qty: cummQuoteQty,
                        avg_price: avgPrice,
                        fee_amount: feeAmount || undefined,
                        fee_currency: feeCurrency || undefined,
                        fee_rate: feeRate || undefined,
                        raw_response_json: JSON.parse(JSON.stringify(exchangeOrder)),
                      },
                    });
                  }
                  
                  // Marcar job como FILLED com reason de anomalia para auditoria
                  await this.prisma.tradeJob.update({
                    where: { id: order.id },
                    data: {
                      status: TradeJobStatus.FILLED,
                      reason_code: 'ANOMALY_EXECUTED_AFTER_POSITION_CLOSED',
                      reason_message: `Ordem executada na exchange após posição ${order.position_id_to_close} ser fechada. Qty=${executedQty}, Price=${avgPrice}`,
                    },
                  });
                  
                  // Liberar sell lock
                  await releaseSellLock(this.prisma, order.position_id_to_close, order.id);
                  
                  filled++;
                  continue;
                }
                
                // Se a ordem ainda está pendente na exchange, cancelar
                if (exchangeOrder.status === 'open' || exchangeOrder.status === 'NEW' || exchangeOrder.status === 'PENDING') {
                  try {
                    await adapter.cancelOrder(exchangeOrderId, order.symbol);
                    this.logger.warn(`[LIMIT-ORDERS-MONITOR] Ordem LIMIT SELL ${order.id} cancelada na exchange (${exchangeOrderId}) pois posição ${order.position_id_to_close} não está OPEN`);
                  } catch (cancelErr: any) {
                    // Se falhou ao cancelar, pode ser que a ordem foi executada entre o fetchOrder e o cancelOrder
                    // Verificar novamente
                    this.logger.error(`[LIMIT-ORDERS-MONITOR] Falha ao cancelar ordem ${exchangeOrderId}: ${cancelErr.message}`);
                    
                    try {
                      const recheckOrder = await adapter.fetchOrder(exchangeOrderId, order.symbol);
                      if (recheckOrder.status === 'FILLED' || recheckOrder.status === 'closed') {
                        this.logger.warn(`[LIMIT-ORDERS-MONITOR] Ordem ${order.id} foi executada durante tentativa de cancelamento. Processando como FILLED...`);
                        // Processar como FILLED (similar ao código acima)
                        await this.prisma.tradeJob.update({
                          where: { id: order.id },
                          data: {
                            status: TradeJobStatus.FILLED,
                            reason_code: 'ANOMALY_EXECUTED_DURING_CANCEL',
                            reason_message: `Ordem executada durante tentativa de cancelamento`,
                          },
                        });
                        await releaseSellLock(this.prisma, order.position_id_to_close, order.id);
                        filled++;
                        continue;
                      }
                    } catch (recheckErr: any) {
                      this.logger.error(`[LIMIT-ORDERS-MONITOR] Erro ao reverificar ordem: ${recheckErr.message}`);
                    }
                  }
                }
              } catch (fetchErr: any) {
                this.logger.error(`[LIMIT-ORDERS-MONITOR] Erro ao buscar ordem ${exchangeOrderId} na exchange: ${fetchErr.message}`);
                // Se não conseguiu verificar, não cancelar para evitar perda
                continue;
              }
            }

            // Marcar job como CANCELED (só chega aqui se a ordem foi cancelada com sucesso)
            await this.prisma.tradeJob.update({
              where: { id: order.id },
              data: {
                status: TradeJobStatus.CANCELED,
                reason_code: 'POSITION_CLOSED_CANCELLED',
                reason_message: `Cancelado: posição ${order.position_id_to_close} não está OPEN (ou sem qty)`,
              },
            });

            // Liberar sell lock (só remove se este job era o dono)
            if (order.position_id_to_close) {
              await releaseSellLock(this.prisma, order.position_id_to_close, order.id);
            }

            canceled++;
            continue;
          }
        }

        // Se não há execution ainda, significa que a ordem ainda não foi criada na exchange
        // Isso pode acontecer se o job foi criado mas não foi processado pelo executor ainda
        const existingExecution = order.executions && order.executions.length > 0 ? order.executions[0] : null;
        
        if (!existingExecution?.exchange_order_id) {
          // Ordem ainda não foi criada na exchange - aguardar processamento pelo executor
          // Por enquanto, apenas logar e continuar - o executor processará quando enfileirado
          console.log(`[LIMIT-MONITOR] Ordem LIMIT ${order.id} ainda não tem execution. Aguardando processamento pelo executor.`);
          continue;
        }

        // Create adapter
        const adapter = AdapterFactory.createAdapter(
          order.exchange_account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: order.exchange_account.testnet }
        );

        // Check order status
        const exchangeOrder = await adapter.fetchOrder(existingExecution.exchange_order_id, order.symbol);

        if (exchangeOrder.status === 'FILLED' || exchangeOrder.status === 'closed') {
          // Extrair taxas da ordem
          let feeAmount: number | null = null;
          let feeCurrency: string | null = null;
          let feeRate: number | null = null;
          
          try {
            const fees = adapter.extractFeesFromOrder(exchangeOrder, order.side.toLowerCase() as 'buy' | 'sell');
            feeAmount = fees.feeAmount;
            feeCurrency = fees.feeCurrency;
            
            const cummQuoteQty = exchangeOrder.cost || 0;
            
            if (feeAmount > 0 && cummQuoteQty > 0) {
              feeRate = (feeAmount / cummQuoteQty) * 100;
            } else if (feeAmount === 0 || !feeCurrency) {
              // ✅ TAXAS FIX: Se não encontrou taxa, tentar buscar ordem novamente após 2 segundos
              console.warn(`[LIMIT-ORDERS-MONITOR] Nenhuma taxa encontrada na ordem. Tentando buscar ordem novamente...`);
              
              try {
                // Aguardar 2 segundos para a exchange processar
                await new Promise((resolve) => setTimeout(resolve, 2000));
                
                // Buscar ordem novamente
                const refreshedOrder = await adapter.fetchOrder(existingExecution.exchange_order_id, order.symbol);
                console.log(`[LIMIT-ORDERS-MONITOR] Ordem buscada novamente, tentando extrair taxas...`);
                
                // Tentar extrair taxas novamente
                const refreshedFees = adapter.extractFeesFromOrder(refreshedOrder, order.side.toLowerCase() as 'buy' | 'sell');
                if (refreshedFees.feeAmount > 0 && refreshedFees.feeCurrency) {
                  feeAmount = refreshedFees.feeAmount;
                  feeCurrency = refreshedFees.feeCurrency;
                  const refreshedCummQuoteQty = refreshedOrder.cost || exchangeOrder.cost || 0;
                  if (refreshedCummQuoteQty > 0) {
                    feeRate = (feeAmount / refreshedCummQuoteQty) * 100;
                  }
                  console.log(`[LIMIT-ORDERS-MONITOR] ✅ Taxas encontradas após retry: ${feeAmount} ${feeCurrency}, taxa: ${feeRate?.toFixed(4)}%`);
                } else {
                  console.error(`[LIMIT-ORDERS-MONITOR] ❌ CRÍTICO: Ainda não foi possível obter taxas da exchange após retry. Continuando com taxa zero.`);
                  feeAmount = 0;
                  feeCurrency = '';
                }
              } catch (retryError: any) {
                console.error(`[LIMIT-ORDERS-MONITOR] ❌ Erro ao tentar buscar ordem novamente: ${retryError.message}`);
                feeAmount = 0;
                feeCurrency = '';
              }
            }
          } catch (feeError: any) {
            console.warn(`[LIMIT-ORDERS-MONITOR] Erro ao extrair taxas: ${feeError.message}`);
            feeAmount = 0;
            feeCurrency = '';
          }

          let executedQty = exchangeOrder.filled || exchangeOrder.amount || 0;
          let cummQuoteQty = exchangeOrder.cost || 0;
          const avgPrice = exchangeOrder.average || exchangeOrder.price || 0;

          // ✅ BUG 3 FIX: NÃO ajustar quantidade executada para taxas em base asset
          // A exchange mantém a quantidade BRUTA (incluindo taxa), então devemos salvar a quantidade bruta
          // na execution e posição para que bata com o saldo na exchange
          // As taxas são mantidas separadas nos campos fee_amount e fee_currency

          // Ajustar cumm_quote_qty se taxa for em quote asset (SELL) - isso está correto
          if (order.side === 'SELL' && feeAmount && feeCurrency) {
            const quoteAsset = getQuoteAsset(order.symbol);
            if (feeCurrency === quoteAsset) {
              cummQuoteQty = Math.max(0, cummQuoteQty - feeAmount);
            }
          }

          // ✅ BUG 2 FIX: ATUALIZAR execution existente em vez de criar nova
          // O executor já criou uma execution com exchange_order_id quando a ordem foi criada
          // Devemos atualizar essa execution com os dados finais da ordem preenchida
          let execution = existingExecution;
          
          if (execution) {
            // Atualizar execution existente
            execution = await this.prisma.tradeExecution.update({
              where: { id: execution.id },
              data: {
                status_exchange: exchangeOrder.status,
                executed_qty: executedQty,
                cumm_quote_qty: cummQuoteQty,
                avg_price: avgPrice,
                fee_amount: feeAmount || undefined,
                fee_currency: feeCurrency || undefined,
                fee_rate: feeRate || undefined,
                raw_response_json: JSON.parse(JSON.stringify(exchangeOrder)),
              },
            });
            this.logger.log(`[LIMIT-ORDERS-MONITOR] Execution ${execution.id} atualizada para ordem ${order.id}`);
          } else {
            // Fallback: criar nova execution se não existir (não deveria acontecer)
            this.logger.warn(`[LIMIT-ORDERS-MONITOR] Execution não encontrada para ordem ${order.id}, criando nova...`);
            execution = await this.prisma.tradeExecution.create({
              data: {
                trade_job_id: order.id,
                exchange_account_id: order.exchange_account_id,
                trade_mode: order.trade_mode,
                exchange: order.exchange_account.exchange,
                exchange_order_id: exchangeOrder.id,
                client_order_id: `client-${order.id}`,
                status_exchange: exchangeOrder.status,
                executed_qty: executedQty,
                cumm_quote_qty: cummQuoteQty,
                avg_price: avgPrice,
                fee_amount: feeAmount || undefined,
                fee_currency: feeCurrency || undefined,
                fee_rate: feeRate || undefined,
                raw_response_json: JSON.parse(JSON.stringify(exchangeOrder)),
              },
            });
          }

          // Update position
          if (order.side === 'BUY') {
            await positionService.onBuyExecuted(
              order.id,
              execution.id,
              execution.executed_qty.toNumber(),
              execution.avg_price.toNumber(),
              feeAmount || undefined,
              feeCurrency || undefined
            );
          } else {
            await positionService.onSellExecuted(
              order.id,
              execution.id,
              execution.executed_qty.toNumber(),
              execution.avg_price.toNumber(),
              'MANUAL',
              feeAmount || undefined,
              feeCurrency || undefined
            );
          }

          // Update job
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: { status: TradeJobStatus.FILLED },
          });

          filled++;
        } else if (exchangeOrder.status === 'CANCELED' || exchangeOrder.status === 'EXPIRED') {
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: {
              status: TradeJobStatus.CANCELED,
              reason_code: exchangeOrder.status,
            },
          });
          canceled++;
        }
      } catch (error) {
        console.error(`Error processing limit order ${order.id}:`, error);
      }
    }

    const result = { ordersChecked: limitOrders.length, filled, canceled };
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[LIMIT-ORDERS-MONITOR-REAL] Monitoramento concluído com sucesso. ` +
      `Ordens verificadas: ${limitOrders.length}, Preenchidas: ${filled}, Canceladas: ${canceled}, Duração: ${durationMs}ms`
    );

    // Registrar sucesso
    await this.cronExecutionService.recordExecution(
      jobName,
      CronExecutionStatus.SUCCESS,
      durationMs,
      result
    );

    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error?.message || 'Erro desconhecido';

    this.logger.error(
      `[LIMIT-ORDERS-MONITOR-REAL] Erro ao monitorar ordens LIMIT: ${errorMessage}`,
      error.stack
    );

    // Registrar falha
    await this.cronExecutionService.recordExecution(
      jobName,
      CronExecutionStatus.FAILED,
      durationMs,
      null,
      errorMessage
    );

    throw error;
  }
  }
}

