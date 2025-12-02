import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, PositionStatus, CloseReason } from '@mvcashnode/shared';

export interface PositionFill {
  executionId: number;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
}

export class PositionService {
  constructor(private prisma: PrismaClient) {}

  async onBuyExecuted(jobId: number, executionId: number, executedQty: number, avgPrice: number): Promise<number> {
    const job = await this.prisma.tradeJob.findUnique({
      where: { id: jobId },
      include: { exchange_account: true },
    });

    if (!job || job.side !== 'BUY') {
      throw new Error('Invalid buy job');
    }

    // Create new position
    const position = await this.prisma.tradePosition.create({
      data: {
        exchange_account_id: job.exchange_account_id,
        trade_mode: job.trade_mode,
        symbol: job.symbol,
        side: 'LONG',
        trade_job_id_open: jobId,
        qty_total: executedQty,
        qty_remaining: executedQty,
        price_open: avgPrice,
        status: PositionStatus.OPEN,
      },
    });

    // Create position fill
    await this.prisma.positionFill.create({
      data: {
        position_id: position.id,
        trade_execution_id: executionId,
        side: 'BUY',
        qty: executedQty,
        price: avgPrice,
      },
    });

    return position.id;
  }

  async onSellExecuted(
    jobId: number,
    executionId: number,
    executedQty: number,
    avgPrice: number,
    origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING'
  ): Promise<void> {
    const job = await this.prisma.tradeJob.findUnique({
      where: { id: jobId },
      include: { exchange_account: true },
    });

    if (!job || job.side !== 'SELL') {
      throw new Error('Invalid sell job');
    }

    // Get eligible positions (FIFO)
    const eligiblePositions = await this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: job.exchange_account_id,
        trade_mode: job.trade_mode,
        symbol: job.symbol,
        side: 'LONG',
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
        ...(origin === 'WEBHOOK' ? { lock_sell_by_webhook: false } : {}),
      },
      orderBy: { created_at: 'asc' },
    });

    if (eligiblePositions.length === 0) {
      await this.prisma.tradeJob.update({
        where: { id: jobId },
        data: {
          status: 'SKIPPED',
          reason_code: origin === 'WEBHOOK' ? 'WEBHOOK_LOCK' : 'NO_ELIGIBLE_POSITIONS',
          reason_message: 'No eligible positions found',
        },
      });
      return;
    }

    let remainingToSell = executedQty;

    for (const position of eligiblePositions) {
      if (remainingToSell <= 0) break;

      const qtyToClose = Math.min(position.qty_remaining.toNumber(), remainingToSell);
      const profitUsd = (avgPrice - position.price_open.toNumber()) * qtyToClose;

      const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
      const newRealizedProfit = position.realized_profit_usd.toNumber() + profitUsd;

      await this.prisma.tradePosition.update({
        where: { id: position.id },
        data: {
          qty_remaining: newQtyRemaining,
          realized_profit_usd: newRealizedProfit,
          status: newQtyRemaining === 0 ? PositionStatus.CLOSED : PositionStatus.OPEN,
          closed_at: newQtyRemaining === 0 ? new Date() : null,
          close_reason: newQtyRemaining === 0 ? this.getCloseReason(origin) : null,
        },
      });

      // Create position fill
      await this.prisma.positionFill.create({
        data: {
          position_id: position.id,
          trade_execution_id: executionId,
          side: 'SELL',
          qty: qtyToClose,
          price: avgPrice,
        },
      });

      remainingToSell -= qtyToClose;
    }

    if (remainingToSell > 0) {
      // Partial execution - update job
      await this.prisma.tradeJob.update({
        where: { id: jobId },
        data: {
          status: 'PARTIALLY_FILLED',
          reason_message: `Only ${executedQty - remainingToSell} executed, ${remainingToSell} remaining`,
        },
      });
    }
  }

  async getEligiblePositions(
    accountId: number,
    tradeMode: TradeMode,
    symbol: string,
    origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL'
  ): Promise<any[]> {
    return this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: accountId,
        trade_mode: tradeMode,
        symbol,
        side: 'LONG',
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
        ...(origin === 'WEBHOOK' ? { lock_sell_by_webhook: false } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateSLTP(positionId: number, slEnabled?: boolean, slPct?: number, tpEnabled?: boolean, tpPct?: number): Promise<any> {
    const updateData: any = {};
    if (slEnabled !== undefined) updateData.sl_enabled = slEnabled;
    if (slPct !== undefined) updateData.sl_pct = slPct;
    if (tpEnabled !== undefined) updateData.tp_enabled = tpEnabled;
    if (tpPct !== undefined) updateData.tp_pct = tpPct;

    return this.prisma.tradePosition.update({
      where: { id: positionId },
      data: updateData,
    });
  }

  async lockSellByWebhook(positionId: number, lock: boolean): Promise<any> {
    return this.prisma.tradePosition.update({
      where: { id: positionId },
      data: { lock_sell_by_webhook: lock },
    });
  }

  async closePosition(positionId: number, quantity?: number) {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
    });

    if (!position || position.status === PositionStatus.CLOSED) {
      throw new Error('Position not found or already closed');
    }

    const qtyToClose = quantity || position.qty_remaining.toNumber();
    if (qtyToClose > position.qty_remaining.toNumber()) {
      throw new Error('Quantity exceeds remaining');
    }

    // This would create a trade job for selling
    // Implementation depends on TradeJobService
    return { positionId, qtyToClose };
  }

  private getCloseReason(origin: string): CloseReason {
    switch (origin) {
      case 'STOP_LOSS':
        return CloseReason.STOP_LOSS;
      case 'TAKE_PROFIT':
        return CloseReason.TARGET_HIT;
      case 'WEBHOOK':
        return CloseReason.WEBHOOK_SELL;
      case 'MANUAL':
        return CloseReason.MANUAL;
      default:
        return CloseReason.MANUAL;
    }
  }
}

