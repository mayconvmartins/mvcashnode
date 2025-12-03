import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { TradeMode, ExchangeType } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';

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
    // Buscar posições fechadas
    const whereClosed: any = {
      exchange_account: {
        user_id: userId,
        ...(exchangeAccountId && { id: exchangeAccountId }),
      },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'CLOSED',
    };

    if (from || to) {
      whereClosed.closed_at = {};
      if (from) whereClosed.closed_at.gte = from;
      if (to) whereClosed.closed_at.lte = to;
    }

    const closedPositions = await this.prisma.tradePosition.findMany({
      where: whereClosed,
      include: {
        exchange_account: true,
      },
    });

    // Buscar posições abertas
    const whereOpen: any = {
      exchange_account: {
        user_id: userId,
        ...(exchangeAccountId && { id: exchangeAccountId }),
      },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'OPEN',
    };

    const openPositions = await this.prisma.tradePosition.findMany({
      where: whereOpen,
      include: {
        exchange_account: true,
      },
    });

    // Calcular PnL realizado (posições fechadas)
    const totalProfit = closedPositions
      .filter((p) => p.realized_profit_usd.toNumber() > 0)
      .reduce((sum, p) => sum + p.realized_profit_usd.toNumber(), 0);

    const totalLoss = closedPositions
      .filter((p) => p.realized_profit_usd.toNumber() < 0)
      .reduce((sum, p) => sum + Math.abs(p.realized_profit_usd.toNumber()), 0);

    const realizedPnL = totalProfit - totalLoss;
    const totalTrades = closedPositions.length;
    const winningTrades = closedPositions.filter((p) => p.realized_profit_usd.toNumber() > 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Calcular PnL não realizado (posições abertas)
    let unrealizedPnL = 0;
    let totalUnrealizedPnL = 0;

    for (const position of openPositions) {
      try {
        // Criar adapter read-only (sem API keys necessárias para buscar preço)
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );
        
        const ticker = await adapter.fetchTicker(position.symbol);
        const currentPrice = ticker.last;

        if (currentPrice && currentPrice > 0) {
          const priceOpen = position.price_open.toNumber();
          const qtyRemaining = position.qty_remaining.toNumber();
          
          // PnL não realizado para esta posição
          const positionUnrealizedPnL = (currentPrice - priceOpen) * qtyRemaining;
          totalUnrealizedPnL += positionUnrealizedPnL;
        }
      } catch (error: any) {
        // Se falhar ao buscar preço, continuar sem essa posição
        console.warn(`[ReportsService] Erro ao buscar preço atual para posição ${position.id}: ${error.message}`);
      }
    }

    unrealizedPnL = totalUnrealizedPnL;

    // Calcular PnL do dia (posições fechadas hoje)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayClosedPositions = closedPositions.filter((p) => {
      if (!p.closed_at) return false;
      const closedDate = new Date(p.closed_at);
      return closedDate >= today && closedDate < tomorrow;
    });

    const dailyPnL = todayClosedPositions.reduce(
      (sum, p) => sum + p.realized_profit_usd.toNumber(),
      0
    );

    // PnL total (realizado + não realizado)
    const netPnL = realizedPnL + unrealizedPnL;

    return {
      totalProfit,
      totalLoss,
      netPnL,
      realizedPnL,
      unrealizedPnL,
      dailyPnL,
      totalTrades,
      winningTrades,
      losingTrades: totalTrades - winningTrades,
      winRate: parseFloat(winRate.toFixed(2)),
      openPositionsCount: openPositions.length,
      hasData: closedPositions.length > 0 || openPositions.length > 0,
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

    let totalUnrealizedPnL = 0;
    let totalInvested = 0;
    const bySymbol: Record<string, { symbol: string; count: number; unrealizedPnL: number; invested: number }> = {};

    // Calcular métricas para cada posição
    for (const position of positions) {
      const symbol = position.symbol;
      
      // Inicializar contador por símbolo
      if (!bySymbol[symbol]) {
        bySymbol[symbol] = {
          symbol,
          count: 0,
          unrealizedPnL: 0,
          invested: 0,
        };
      }
      bySymbol[symbol].count += 1;

      // Calcular valor investido
      const qtyTotal = position.qty_total.toNumber();
      const priceOpen = position.price_open.toNumber();
      const invested = qtyTotal * priceOpen;
      totalInvested += invested;
      bySymbol[symbol].invested += invested;

      // Buscar preço atual e calcular PnL não realizado
      try {
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );
        
        const ticker = await adapter.fetchTicker(position.symbol);
        const currentPrice = ticker.last;

        if (currentPrice && currentPrice > 0) {
          const qtyRemaining = position.qty_remaining.toNumber();
          
          // PnL não realizado para esta posição
          const positionUnrealizedPnL = (currentPrice - priceOpen) * qtyRemaining;
          totalUnrealizedPnL += positionUnrealizedPnL;
          bySymbol[symbol].unrealizedPnL += positionUnrealizedPnL;
        }
      } catch (error: any) {
        // Se falhar ao buscar preço, continuar sem essa posição
        console.warn(`[ReportsService] Erro ao buscar preço atual para posição ${position.id}: ${error.message}`);
      }
    }

    return {
      totalPositions: positions.length,
      totalUnrealizedPnL,
      totalInvested,
      bySymbol: Object.values(bySymbol),
    };
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

