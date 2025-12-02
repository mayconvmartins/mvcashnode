import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { TradeJobService } from '@mvcashnode/domain';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, PositionStatus, TradeMode } from '@mvcashnode/shared';

@Processor('sl-tp-monitor-sim')
export class SLTPMonitorSimProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('trade-execution-sim') private tradeExecutionQueue: Queue
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    // Get all open positions with SL/TP enabled (SIMULATION)
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.SIMULATION,
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
        OR: [
          { sl_enabled: true },
          { tp_enabled: true },
          { trailing_enabled: true },
        ],
      },
      include: {
        exchange_account: true,
      },
    });

    const tradeJobService = new TradeJobService(this.prisma);
    let triggered = 0;

    for (const position of positions) {
      try {
        // Create read-only adapter (no API keys needed for simulation)
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );

        // Get current price
        const ticker = await adapter.fetchTicker(position.symbol);
        const currentPrice = ticker.last;
        const priceOpen = position.price_open.toNumber();
        const pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;

        // Check Stop Loss
        if (position.sl_enabled && position.sl_pct && pnlPct <= -position.sl_pct.toNumber()) {
          if (!position.sl_triggered) {
            const tradeJob = await tradeJobService.createJob({
              exchangeAccountId: position.exchange_account_id,
              tradeMode: TradeMode.SIMULATION,
              symbol: position.symbol,
              side: 'SELL',
              orderType: 'MARKET',
              baseQuantity: position.qty_remaining.toNumber(),
              skipParameterValidation: true,
            });

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { sl_triggered: true },
            });
            triggered++;
          }
        }

        // Check Take Profit
        if (position.tp_enabled && position.tp_pct && pnlPct >= position.tp_pct.toNumber()) {
          if (!position.tp_triggered) {
            const tradeJob = await tradeJobService.createJob({
              exchangeAccountId: position.exchange_account_id,
              tradeMode: TradeMode.SIMULATION,
              symbol: position.symbol,
              side: 'SELL',
              orderType: 'MARKET',
              baseQuantity: position.qty_remaining.toNumber(),
              skipParameterValidation: true,
            });

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { tp_triggered: true },
            });
            triggered++;
          }
        }

        // Check Trailing Stop (similar to real)
        if (position.trailing_enabled && position.trailing_distance_pct) {
          let trailingMaxPrice = position.trailing_max_price?.toNumber() || priceOpen;

          if (currentPrice > trailingMaxPrice) {
            trailingMaxPrice = currentPrice;
            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { trailing_max_price: trailingMaxPrice },
            });
          }

          const trailingDistance = position.trailing_distance_pct.toNumber();
          const trailingTriggerPrice = trailingMaxPrice * (1 - trailingDistance / 100);

          if (currentPrice <= trailingTriggerPrice && !position.trailing_triggered) {
            const tradeJob = await tradeJobService.createJob({
              exchangeAccountId: position.exchange_account_id,
              tradeMode: TradeMode.SIMULATION,
              symbol: position.symbol,
              side: 'SELL',
              orderType: 'MARKET',
              baseQuantity: position.qty_remaining.toNumber(),
              skipParameterValidation: true,
            });

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { trailing_triggered: true },
            });
            triggered++;
          }
        }
      } catch (error) {
        console.error(`Error processing position ${position.id}:`, error);
      }
    }

    return { positionsChecked: positions.length, triggered };
  }
}

