import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import {
  PositionService,
  VaultService,
} from '@mvcashnode/domain';
import { BinanceSpotAdapter } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus } from '@mvcashnode/shared';
import { randomUUID } from 'crypto';

@Processor('trade-execution-sim')
export class TradeExecutionSimProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { tradeJobId } = job.data;

    const tradeJob = await this.prisma.tradeJob.findUnique({
      where: { id: tradeJobId },
      include: {
        exchange_account: true,
      },
    });

    if (!tradeJob || tradeJob.trade_mode !== 'SIMULATION') {
      throw new Error('Invalid trade job');
    }

    // Update status to EXECUTING
    await this.prisma.tradeJob.update({
      where: { id: tradeJobId },
      data: { status: TradeJobStatus.EXECUTING },
    });

    try {
      // For simulation, we need to get current price
      // Create read-only adapter (no API keys needed for simulation)
      const adapter = new BinanceSpotAdapter(
        tradeJob.exchange_account.exchange as ExchangeType
      );

      // Get current price
      const ticker = await adapter.fetchTicker(tradeJob.symbol);
      const currentPrice = ticker.last;

      // Calculate executed quantity and average price
      let executedQty = tradeJob.base_quantity?.toNumber() || 0;
      let avgPrice = currentPrice;

      // If it's a LIMIT order, check if price was reached
      if (tradeJob.order_type === 'LIMIT' && tradeJob.limit_price) {
        const limitPrice = tradeJob.limit_price.toNumber();
        if (tradeJob.side === 'BUY' && currentPrice > limitPrice) {
          // Limit not reached for buy
          executedQty = 0;
        } else if (tradeJob.side === 'SELL' && currentPrice < limitPrice) {
          // Limit not reached for sell
          executedQty = 0;
        } else {
          avgPrice = limitPrice;
        }
      }

      if (executedQty === 0) {
        // Order not executed
        await this.prisma.tradeJob.update({
          where: { id: tradeJobId },
          data: { status: TradeJobStatus.PENDING_LIMIT },
        });
        return { success: false, message: 'Limit order not reached' };
      }

      // Create simulated execution
      const execution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJobId,
          exchange_account_id: tradeJob.exchange_account_id,
          trade_mode: tradeJob.trade_mode,
          exchange: tradeJob.exchange_account.exchange,
          exchange_order_id: `SIM-${randomUUID()}`,
          client_order_id: `client-${tradeJobId}`,
          status_exchange: 'FILLED',
          executed_qty: executedQty,
          cumm_quote_qty: executedQty * avgPrice,
          avg_price: avgPrice,
          raw_response_json: {
            simulated: true,
            price: avgPrice,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Update position
      const positionService = new PositionService(this.prisma);
      if (tradeJob.side === 'BUY') {
        await positionService.onBuyExecuted(
          tradeJobId,
          execution.id,
          execution.executed_qty.toNumber(),
          execution.avg_price.toNumber()
        );
      } else {
        await positionService.onSellExecuted(
          tradeJobId,
          execution.id,
          execution.executed_qty.toNumber(),
          execution.avg_price.toNumber(),
          'WEBHOOK'
        );
      }

      // Update vault if applicable
      if (tradeJob.vault_id) {
        const vaultService = new VaultService(this.prisma);
        if (tradeJob.side === 'BUY') {
          await vaultService.confirmBuy(
            tradeJob.vault_id,
            'USDT',
            execution.cumm_quote_qty.toNumber(),
            tradeJobId
          );
        } else {
          await vaultService.creditOnSell(
            tradeJob.vault_id,
            'USDT',
            execution.cumm_quote_qty.toNumber(),
            tradeJobId
          );
        }
      }

      // Update job status
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: { status: TradeJobStatus.FILLED },
      });

      return { success: true, executionId: execution.id };
    } catch (error: any) {
      // Update job status to FAILED
      await this.prisma.tradeJob.update({
        where: { id: tradeJobId },
        data: {
          status: TradeJobStatus.FAILED,
          reason_code: 'EXECUTION_ERROR',
          reason_message: error.message,
        },
      });

      throw error;
    }
  }
}

