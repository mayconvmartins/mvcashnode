import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { TradeJobService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { BinanceSpotAdapter } from '@mvcashnode/exchange';
import { ExchangeType, PositionStatus, TradeMode } from '@mvcashnode/shared';

@Processor('sl-tp-monitor-real')
export class SLTPMonitorRealProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    @InjectQueue('trade-execution-real') private tradeExecutionQueue: Queue
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    // Get all open positions with SL/TP enabled
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.REAL,
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
        // Get API keys for read-only price check
        const accountService = new (await import('@mvcashnode/domain')).ExchangeAccountService(
          this.prisma,
          this.encryptionService
        );
        const keys = await accountService.decryptApiKeys(position.exchange_account_id);

        if (!keys) continue;

        // Create read-only adapter
        const adapter = new BinanceSpotAdapter(
          position.exchange_account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: position.exchange_account.testnet }
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
              tradeMode: TradeMode.REAL,
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
              tradeMode: TradeMode.REAL,
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

        // Check Trailing Stop
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
              tradeMode: TradeMode.REAL,
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

