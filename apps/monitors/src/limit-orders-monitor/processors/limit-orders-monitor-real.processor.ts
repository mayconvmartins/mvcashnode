import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus, TradeMode } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

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
    // Get all pending limit orders
    const limitOrders = await this.prisma.tradeJob.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: TradeJobStatus.PENDING_LIMIT,
        order_type: 'LIMIT',
      },
      include: {
        exchange_account: true,
        executions: {
          take: 1,
          orderBy: { id: 'desc' },
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
            }
          } catch (feeError: any) {
            console.warn(`[LIMIT-ORDERS-MONITOR] Erro ao extrair taxas: ${feeError.message}`);
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
            const quoteAsset = order.symbol.split('/')[1] || 'USDT';
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

