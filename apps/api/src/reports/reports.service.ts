import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getPnLSummary(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date,
    exchangeAccountId?: number
  ) {
    const where: any = {
      exchange_account: {
        user_id: userId,
        ...(exchangeAccountId && { id: exchangeAccountId }),
      },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'CLOSED',
    };

    if (from || to) {
      where.closed_at = {};
      if (from) where.closed_at.gte = from;
      if (to) where.closed_at.lte = to;
    }

    const positions = await this.prisma.tradePosition.findMany({
      where,
      include: {
        exchange_account: true,
      },
    });

    const totalProfit = positions
      .filter((p) => p.realized_profit_usd.toNumber() > 0)
      .reduce((sum, p) => sum + p.realized_profit_usd.toNumber(), 0);

    const totalLoss = positions
      .filter((p) => p.realized_profit_usd.toNumber() < 0)
      .reduce((sum, p) => sum + Math.abs(p.realized_profit_usd.toNumber()), 0);

    const netPnL = totalProfit - totalLoss;
    const totalTrades = positions.length;
    const winningTrades = positions.filter((p) => p.realized_profit_usd.toNumber() > 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    return {
      totalProfit,
      totalLoss,
      netPnL,
      totalTrades,
      winningTrades,
      losingTrades: totalTrades - winningTrades,
      winRate: parseFloat(winRate.toFixed(2)),
    };
  }

  async getPnLBySymbol(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date
  ) {
    const where: any = {
      exchange_account: { user_id: userId },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'CLOSED',
    };

    if (from || to) {
      where.closed_at = {};
      if (from) where.closed_at.gte = from;
      if (to) where.closed_at.lte = to;
    }

    const positions = await this.prisma.tradePosition.findMany({
      where,
    });

    const bySymbol = positions.reduce((acc, pos) => {
      const symbol = pos.symbol;
      if (!acc[symbol]) {
        acc[symbol] = { symbol, pnl_usd: 0, trades: 0 };
      }
      acc[symbol].pnl_usd += pos.realized_profit_usd.toNumber();
      acc[symbol].trades += 1;
      return acc;
    }, {} as Record<string, { symbol: string; pnl_usd: number; trades: number }>);

    return Object.values(bySymbol);
  }

  async getPnLByDay(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date
  ) {
    const where: any = {
      exchange_account: { user_id: userId },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'CLOSED',
      closed_at: { not: null },
    };

    if (from || to) {
      where.closed_at = {};
      if (from) where.closed_at.gte = from;
      if (to) where.closed_at.lte = to;
    }

    const positions = await this.prisma.tradePosition.findMany({
      where,
    });

    const byDay = positions.reduce((acc, pos) => {
      if (!pos.closed_at) return acc;
      const date = pos.closed_at.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, pnl_usd: 0 };
      }
      acc[date].pnl_usd += pos.realized_profit_usd.toNumber();
      return acc;
    }, {} as Record<string, { date: string; pnl_usd: number }>);

    return Object.values(byDay).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  async getOpenPositionsSummary(userId: number, tradeMode?: TradeMode) {
    const where: any = {
      exchange_account: { user_id: userId },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'OPEN',
    };

    const positions = await this.prisma.tradePosition.findMany({
      where,
      include: {
        exchange_account: true,
      },
    });

    // Group by exchange_account_id and symbol
    const summary = positions.reduce((acc, pos) => {
      const key = `${pos.exchange_account_id}-${pos.symbol}`;
      if (!acc[key]) {
        acc[key] = {
          exchange_account_id: pos.exchange_account_id,
          symbol: pos.symbol,
          qty_total: 0,
          estimated_value_usd: 0,
          unrealized_pnl_usd: 0,
        };
      }
      acc[key].qty_total += pos.qty_remaining.toNumber();
      // Note: estimated_value_usd and unrealized_pnl_usd would require current price
      return acc;
    }, {} as Record<string, any>);

    return Object.values(summary);
  }

  async getVaultsSummary(userId: number, tradeMode?: TradeMode, from?: Date, to?: Date) {
    const where: any = {
      vault: {
        user_id: userId,
        ...(tradeMode && { trade_mode: tradeMode }),
      },
    };

    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = from;
      if (to) where.created_at.lte = to;
    }

    const transactions = await this.prisma.vaultTransaction.findMany({
      where,
      include: {
        vault: true,
      },
    });

    const byVault = transactions.reduce((acc, tx) => {
      const vaultId = tx.vault_id;
      if (!acc[vaultId]) {
        acc[vaultId] = {
          vault_id: vaultId,
          vault_name: tx.vault.name,
          assets: {},
        };
      }
      if (!acc[vaultId].assets[tx.asset]) {
        acc[vaultId].assets[tx.asset] = { asset: tx.asset, volume: 0 };
      }
      if (['DEPOSIT', 'SELL_RETURN'].includes(tx.type)) {
        acc[vaultId].assets[tx.asset].volume += tx.amount.toNumber();
      }
      return acc;
    }, {} as Record<number, any>);

    return Object.values(byVault);
  }

  async getWebhooksSummary(
    userId: number,
    webhookSourceId?: number,
    from?: Date,
    to?: Date
  ) {
    const where: any = {
      webhook_source: {
        owner_user_id: userId,
        ...(webhookSourceId && { id: webhookSourceId }),
      },
    };

    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = from;
      if (to) where.created_at.lte = to;
    }

    const events = await this.prisma.webhookEvent.findMany({
      where,
      include: {
        webhook_source: true,
      },
    });

    const totalEvents = events.length;
    const jobsCreated = events.filter((e) => e.status === 'JOB_CREATED').length;
    const skipped = events.filter((e) => e.status === 'SKIPPED').length;
    const failed = events.filter((e) => e.status === 'FAILED').length;

    return {
      totalEvents,
      jobsCreated,
      skipped,
      failed,
      successRate: totalEvents > 0 ? (jobsCreated / totalEvents) * 100 : 0,
    };
  }
}

