import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus, TradeMode } from '@mvcashnode/shared';
import { randomUUID } from 'crypto';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('limit-orders-monitor-sim')
export class LimitOrdersMonitorSimProcessor extends WorkerHost {
  private readonly logger = new Logger(LimitOrdersMonitorSimProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'limit-orders-monitor-sim';
    this.logger.log('[LIMIT-ORDERS-MONITOR-SIM] Iniciando monitoramento de ordens LIMIT...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
    // Get all pending limit orders (SIMULATION)
    const limitOrders = await this.prisma.tradeJob.findMany({
      where: {
        trade_mode: TradeMode.SIMULATION,
        status: TradeJobStatus.PENDING_LIMIT,
        order_type: 'LIMIT',
      },
      include: {
        exchange_account: true,
      },
    });

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

        // Create read-only adapter
        const adapter = AdapterFactory.createAdapter(
          order.exchange_account.exchange as ExchangeType
        );

        // Get current price
        const ticker = await adapter.fetchTicker(order.symbol);
        const currentPrice = ticker.last;
        const limitPrice = order.limit_price?.toNumber() || 0;

        // Check if limit was reached
        let shouldFill = false;
        if (order.side === 'BUY' && currentPrice <= limitPrice) {
          shouldFill = true;
        } else if (order.side === 'SELL' && currentPrice >= limitPrice) {
          shouldFill = true;
        }

        if (shouldFill) {
          // Create simulated execution
          const execution = await this.prisma.tradeExecution.create({
            data: {
              trade_job_id: order.id,
              exchange_account_id: order.exchange_account_id,
              trade_mode: order.trade_mode,
              exchange: order.exchange_account.exchange,
              exchange_order_id: `SIM-${randomUUID()}`,
              client_order_id: `client-${order.id}`,
              status_exchange: 'FILLED',
              executed_qty: order.base_quantity?.toNumber() || 0,
              cumm_quote_qty: (order.base_quantity?.toNumber() || 0) * limitPrice,
              avg_price: limitPrice,
              raw_response_json: {
                simulated: true,
                price: limitPrice,
                timestamp: new Date().toISOString(),
              },
            },
          });

          // Update position
          if (order.side === 'BUY') {
            await positionService.onBuyExecuted(
              order.id,
              execution.id,
              execution.executed_qty.toNumber(),
              execution.avg_price.toNumber()
            );
          } else {
            await positionService.onSellExecuted(
              order.id,
              execution.id,
              execution.executed_qty.toNumber(),
              execution.avg_price.toNumber(),
              'MANUAL'
            );
          }

          // Update job
          await this.prisma.tradeJob.update({
            where: { id: order.id },
            data: { status: TradeJobStatus.FILLED },
          });

          filled++;
        }
      } catch (error) {
        console.error(`Error processing limit order ${order.id}:`, error);
      }
    }

    const result = { ordersChecked: limitOrders.length, filled, canceled };
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[LIMIT-ORDERS-MONITOR-SIM] Monitoramento concluído com sucesso. ` +
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
      `[LIMIT-ORDERS-MONITOR-SIM] Erro ao monitorar ordens LIMIT: ${errorMessage}`,
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

