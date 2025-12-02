import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { BinanceSpotAdapter } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus, TradeMode } from '@mvcashnode/shared';
import { randomUUID } from 'crypto';

@Processor('limit-orders-monitor-sim')
export class LimitOrdersMonitorSimProcessor extends WorkerHost {
  constructor(private prisma: PrismaService) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
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
        const adapter = new BinanceSpotAdapter(
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

    return { ordersChecked: limitOrders.length, filled, canceled };
  }
}

