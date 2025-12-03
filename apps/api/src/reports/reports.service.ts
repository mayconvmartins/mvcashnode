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
    console.log(`[ReportsService] getPnLSummary chamado: userId=${userId}, tradeMode=${tradeMode}, from=${from}, to=${to}, exchangeAccountId=${exchangeAccountId}`);
    
    // Buscar IDs das exchange accounts do usuário
    const userAccounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map((acc) => acc.id);

    if (accountIds.length === 0) {
      console.log(`[ReportsService] Nenhuma conta encontrada para o usuário ${userId}`);
      return {
        totalProfit: 0,
        totalLoss: 0,
        netPnL: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        dailyPnL: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        openPositionsCount: 0,
        hasData: false,
      };
    }

    // Filtrar por conta específica se fornecida
    const finalAccountIds = exchangeAccountId && accountIds.includes(exchangeAccountId)
      ? [exchangeAccountId]
      : accountIds;

    // Buscar posições fechadas
    const whereClosed: any = {
      exchange_account_id: { in: finalAccountIds },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'CLOSED',
    };

    if (from || to) {
      whereClosed.closed_at = {};
      if (from) whereClosed.closed_at.gte = from;
      if (to) whereClosed.closed_at.lte = to;
    }

    // Buscar posições fechadas e calcular dailyPnL em paralelo
    const [closedPositions, dailyPnLAggregate] = await Promise.all([
      this.prisma.tradePosition.findMany({
        where: whereClosed,
        select: {
          id: true,
          realized_profit_usd: true,
          closed_at: true,
        },
      }),
      // Calcular PnL do dia usando agregação
      (async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const dailyAggregate = await this.prisma.tradePosition.aggregate({
          where: {
            ...whereClosed,
            closed_at: {
              gte: today,
              lt: tomorrow,
            },
          },
          _sum: {
            realized_profit_usd: true,
          },
        });
        
        return dailyAggregate._sum.realized_profit_usd?.toNumber() || 0;
      })(),
    ]);

    console.log(`[ReportsService] Posições fechadas encontradas: ${closedPositions.length}`);

    // Buscar posições abertas
    const whereOpen: any = {
      exchange_account_id: { in: finalAccountIds },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'OPEN',
    };

    const openPositions = await this.prisma.tradePosition.findMany({
      where: whereOpen,
      select: {
        id: true,
        symbol: true,
        price_open: true,
        qty_remaining: true,
        exchange_account: {
          select: {
            id: true,
            exchange: true,
            testnet: true,
          },
        },
      },
    });

    console.log(`[ReportsService] Posições abertas encontradas: ${openPositions.length}`);

    // Calcular PnL realizado usando agregações do Prisma (mais eficiente)
    const [aggregatedData, winningCount] = await Promise.all([
      this.prisma.tradePosition.aggregate({
        where: whereClosed,
        _sum: {
          realized_profit_usd: true,
        },
        _count: {
          id: true,
        },
      }),
      this.prisma.tradePosition.count({
        where: {
          ...whereClosed,
          realized_profit_usd: { gt: 0 },
        },
      }),
    ]);

    // Calcular profit e loss usando agregações separadas (mais eficiente)
    const [profitAggregate, lossAggregate] = await Promise.all([
      this.prisma.tradePosition.aggregate({
        where: {
          ...whereClosed,
          realized_profit_usd: { gt: 0 },
        },
        _sum: {
          realized_profit_usd: true,
        },
      }),
      this.prisma.tradePosition.aggregate({
        where: {
          ...whereClosed,
          realized_profit_usd: { lt: 0 },
        },
        _sum: {
          realized_profit_usd: true,
        },
      }),
    ]);

    const totalProfit = profitAggregate._sum.realized_profit_usd?.toNumber() || 0;
    const totalLoss = Math.abs(lossAggregate._sum.realized_profit_usd?.toNumber() || 0);
    const realizedPnL = totalProfit - totalLoss;
    const totalTrades = aggregatedData._count.id;
    const winningTrades = winningCount;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Calcular PnL não realizado (posições abertas) - PARALELIZADO
    let totalUnrealizedPnL = 0;

    if (openPositions.length > 0) {
      // Agrupar posições por exchange para reutilizar adapters
      const positionsByExchange = new Map<string, typeof openPositions>();
      for (const position of openPositions) {
        const exchangeKey = `${position.exchange_account.exchange}_${position.exchange_account.testnet}`;
        if (!positionsByExchange.has(exchangeKey)) {
          positionsByExchange.set(exchangeKey, []);
        }
        positionsByExchange.get(exchangeKey)!.push(position);
      }

      // Processar todas as exchanges em paralelo
      const unrealizedPnLPromises = Array.from(positionsByExchange.entries()).map(
        async ([exchangeKey, positions]) => {
          const [exchange, testnetStr] = exchangeKey.split('_');
          const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);
          let exchangeUnrealizedPnL = 0;

          // Buscar todos os tickers em paralelo para esta exchange
          const tickerPromises = positions.map(async (position) => {
            try {
              const ticker = await adapter.fetchTicker(position.symbol);
              const currentPrice = ticker.last;

              if (currentPrice && currentPrice > 0) {
                const priceOpen = position.price_open.toNumber();
                const qtyRemaining = position.qty_remaining.toNumber();
                return (currentPrice - priceOpen) * qtyRemaining;
              }
              return 0;
            } catch (error: any) {
              console.warn(`[ReportsService] Erro ao buscar preço atual para posição ${position.id}: ${error.message}`);
              return 0;
            }
          });

          const positionPnLs = await Promise.all(tickerPromises);
          exchangeUnrealizedPnL = positionPnLs.reduce((sum, pnl) => sum + pnl, 0);
          return exchangeUnrealizedPnL;
        }
      );

      const exchangePnLs = await Promise.all(unrealizedPnLPromises);
      totalUnrealizedPnL = exchangePnLs.reduce((sum, pnl) => sum + pnl, 0);
    }

    const unrealizedPnL = totalUnrealizedPnL;

    // dailyPnL já foi calculado em paralelo acima (já é o resultado, não uma Promise)
    const dailyPnL = dailyPnLAggregate;

    // PnL total (realizado + não realizado)
    const netPnL = realizedPnL + unrealizedPnL;

    const result = {
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

    console.log(`[ReportsService] Resultado getPnLSummary:`, JSON.stringify(result, null, 2));
    return result;
  }

  async getPnLBySymbol(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date
  ) {
    console.log(`[ReportsService] getPnLBySymbol chamado: userId=${userId}, tradeMode=${tradeMode}, from=${from}, to=${to}`);
    
    // Buscar IDs das exchange accounts do usuário
    const userAccounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map((acc) => acc.id);

    if (accountIds.length === 0) {
      console.log(`[ReportsService] Nenhuma conta encontrada para o usuário ${userId}`);
      return [];
    }

    const where: any = {
      exchange_account_id: { in: accountIds },
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

    console.log(`[ReportsService] Posições encontradas para bySymbol: ${positions.length}`);

    const bySymbol = positions.reduce((acc, pos) => {
      const symbol = pos.symbol;
      if (!acc[symbol]) {
        acc[symbol] = { symbol, pnl_usd: 0, trades: 0 };
      }
      acc[symbol].pnl_usd += pos.realized_profit_usd.toNumber();
      acc[symbol].trades += 1;
      return acc;
    }, {} as Record<string, { symbol: string; pnl_usd: number; trades: number }>);

    const result = Object.values(bySymbol);
    console.log(`[ReportsService] Resultado getPnLBySymbol:`, JSON.stringify(result, null, 2));
    return result;
  }

  async getPnLByDay(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date
  ) {
    console.log(`[ReportsService] getPnLByDay chamado: userId=${userId}, tradeMode=${tradeMode}, from=${from}, to=${to}`);
    
    // Buscar IDs das exchange accounts do usuário
    const userAccounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map((acc) => acc.id);

    if (accountIds.length === 0) {
      console.log(`[ReportsService] Nenhuma conta encontrada para o usuário ${userId}`);
      return [];
    }

    const where: any = {
      exchange_account_id: { in: accountIds },
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

    console.log(`[ReportsService] Posições encontradas para byDay: ${positions.length}`);

    const byDay = positions.reduce((acc, pos) => {
      if (!pos.closed_at) return acc;
      const date = pos.closed_at.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, pnl_usd: 0 };
      }
      acc[date].pnl_usd += pos.realized_profit_usd.toNumber();
      return acc;
    }, {} as Record<string, { date: string; pnl_usd: number }>);

    const result = Object.values(byDay).sort((a: any, b: any) => a.date.localeCompare(b.date));
    console.log(`[ReportsService] Resultado getPnLByDay:`, JSON.stringify(result, null, 2));
    return result;
  }

  async getOpenPositionsSummary(userId: number, tradeMode?: TradeMode) {
    // Buscar IDs das exchange accounts do usuário
    const userAccounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map((acc) => acc.id);

    if (accountIds.length === 0) {
      return {
        totalPositions: 0,
        totalUnrealizedPnL: 0,
        totalInvested: 0,
        bySymbol: [],
      };
    }

    const where: any = {
      exchange_account_id: { in: accountIds },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'OPEN',
    };

    const positions = await this.prisma.tradePosition.findMany({
      where,
      select: {
        id: true,
        symbol: true,
        price_open: true,
        qty_total: true,
        qty_remaining: true,
        exchange_account: {
          select: {
            id: true,
            exchange: true,
            testnet: true,
          },
        },
      },
    });

    let totalUnrealizedPnL = 0;
    let totalInvested = 0;
    const bySymbol: Record<string, { symbol: string; count: number; unrealizedPnL: number; invested: number }> = {};

    // Calcular valor investido primeiro (não precisa de API)
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
    }

    // Calcular PnL não realizado - PARALELIZADO e agrupado por exchange
    if (positions.length > 0) {
      // Agrupar posições por exchange para reutilizar adapters
      const positionsByExchange = new Map<string, typeof positions>();
      for (const position of positions) {
        const exchangeKey = `${position.exchange_account.exchange}_${position.exchange_account.testnet}`;
        if (!positionsByExchange.has(exchangeKey)) {
          positionsByExchange.set(exchangeKey, []);
        }
        positionsByExchange.get(exchangeKey)!.push(position);
      }

      // Processar todas as exchanges em paralelo
      const unrealizedPnLPromises = Array.from(positionsByExchange.entries()).map(
        async ([exchangeKey, exchangePositions]) => {
          const [exchange] = exchangeKey.split('_');
          const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);
          const exchangeResults: Array<{ symbol: string; unrealizedPnL: number }> = [];

          // Buscar todos os tickers em paralelo para esta exchange
          const tickerPromises = exchangePositions.map(async (position) => {
            try {
              const ticker = await adapter.fetchTicker(position.symbol);
              const currentPrice = ticker.last;

              if (currentPrice && currentPrice > 0) {
                const priceOpen = position.price_open.toNumber();
                const qtyRemaining = position.qty_remaining.toNumber();
                const positionUnrealizedPnL = (currentPrice - priceOpen) * qtyRemaining;
                return {
                  symbol: position.symbol,
                  unrealizedPnL: positionUnrealizedPnL,
                };
              }
              return { symbol: position.symbol, unrealizedPnL: 0 };
            } catch (error: any) {
              console.warn(`[ReportsService] Erro ao buscar preço atual para posição ${position.id}: ${error.message}`);
              return { symbol: position.symbol, unrealizedPnL: 0 };
            }
          });

          const results = await Promise.all(tickerPromises);
          exchangeResults.push(...results);
          return exchangeResults;
        }
      );

      const allResults = await Promise.all(unrealizedPnLPromises);
      
      // Consolidar resultados
      for (const results of allResults) {
        for (const result of results) {
          totalUnrealizedPnL += result.unrealizedPnL;
          if (bySymbol[result.symbol]) {
            bySymbol[result.symbol].unrealizedPnL += result.unrealizedPnL;
          }
        }
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

  async getStrategyPerformance(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date,
    webhookSourceId?: number
  ) {
    // Buscar IDs das exchange accounts do usuário
    const userAccounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map((acc) => acc.id);

    if (accountIds.length === 0) {
      return [];
    }

    const where: any = {
      exchange_account_id: { in: accountIds },
      ...(tradeMode && { trade_mode: tradeMode }),
      status: 'CLOSED',
      closed_at: { not: null },
    };

    if (from || to) {
      where.closed_at = {};
      if (from) where.closed_at.gte = from;
      if (to) where.closed_at.lte = to;
    }

    // Se webhookSourceId for fornecido, buscar os webhook_event_ids primeiro
    let webhookEventIds: number[] | undefined = undefined;
    if (webhookSourceId) {
      const webhookEvents = await this.prisma.webhookEvent.findMany({
        where: {
          webhook_source_id: webhookSourceId,
        },
        select: {
          id: true,
        },
      });
      webhookEventIds = webhookEvents.map(e => e.id);
      if (webhookEventIds.length === 0) {
        return []; // Se não há eventos, não há posições
      }
    }

    const positions = await this.prisma.tradePosition.findMany({
      where: {
        ...where,
        ...(webhookEventIds && {
          open_job: {
            webhook_event_id: {
              in: webhookEventIds,
            },
          },
        }),
      },
      include: {
        open_job: {
          select: {
            reason_code: true,
            order_type: true,
            side: true,
            webhook_event_id: true,
          },
        },
      },
    });

    // Agrupar por estratégia (webhook source ou reason_code ou combinação de order_type + side)
    const byStrategy: Record<string, {
      strategy: string;
      pnl: number;
      trades: number;
      wins: number;
      avgPnL: number;
      totalVolume: number;
    }> = {};

    // Buscar webhook sources para mapear
    const webhookSourceMap: Record<number, string> = {};
    if (webhookSourceId) {
      const webhookSource = await this.prisma.webhookSource.findUnique({
        where: { id: webhookSourceId },
        select: { id: true, label: true },
      });
      if (webhookSource) {
        // Buscar todos os eventos deste source
        const events = await this.prisma.webhookEvent.findMany({
          where: { webhook_source_id: webhookSourceId },
          select: { id: true },
        });
        events.forEach(e => {
          webhookSourceMap[e.id] = webhookSource.label;
        });
      }
    } else {
      // Buscar todos os webhook events das posições e mapear
      const eventIds = positions
        .map(p => p.open_job?.webhook_event_id)
        .filter((id): id is number => id !== null && id !== undefined);
      
      if (eventIds.length > 0) {
        const uniqueEventIds = [...new Set(eventIds)];
        const events = await this.prisma.webhookEvent.findMany({
          where: { id: { in: uniqueEventIds } },
          include: {
            webhook_source: {
              select: {
                id: true,
                label: true,
              },
            },
          },
        });
        events.forEach(e => {
          if (e.webhook_source) {
            webhookSourceMap[e.id] = e.webhook_source.label;
          }
        });
      }
    }

    for (const pos of positions) {
      // Priorizar webhook source como estratégia
      let strategy = 'UNKNOWN';
      if (pos.open_job?.webhook_event_id && webhookSourceMap[pos.open_job.webhook_event_id]) {
        strategy = webhookSourceMap[pos.open_job.webhook_event_id];
      } else if (pos.open_job?.reason_code) {
        strategy = pos.open_job.reason_code;
      } else if (pos.open_job?.order_type && pos.open_job?.side) {
        strategy = `${pos.open_job.order_type}_${pos.open_job.side}`;
      }
      
      if (!byStrategy[strategy]) {
        byStrategy[strategy] = {
          strategy,
          pnl: 0,
          trades: 0,
          wins: 0,
          avgPnL: 0,
          totalVolume: 0,
        };
      }

      const pnl = pos.realized_profit_usd.toNumber();
      byStrategy[strategy].pnl += pnl;
      byStrategy[strategy].trades += 1;
      byStrategy[strategy].totalVolume += pos.qty_total.toNumber() * pos.price_open.toNumber();
      if (pnl > 0) {
        byStrategy[strategy].wins += 1;
      }
    }

    // Calcular média e win rate
    const result = Object.values(byStrategy).map(strat => ({
      ...strat,
      avgPnL: strat.trades > 0 ? strat.pnl / strat.trades : 0,
      winRate: strat.trades > 0 ? (strat.wins / strat.trades) * 100 : 0,
    }));

    return result.sort((a, b) => b.pnl - a.pnl);
  }

  async getSharpeRatio(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date
  ) {
    // Buscar dados diários de PnL
    const byDay = await this.getPnLByDay(userId, tradeMode, from, to);

    if (byDay.length === 0) {
      return {
        sharpeRatio: 0,
        returns: [],
        avgReturn: 0,
        stdDev: 0,
        riskFreeRate: 0,
      };
    }

    // Calcular retornos diários
    const returns = byDay.map(day => day.pnl_usd || 0);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calcular desvio padrão
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Taxa livre de risco (assumindo 0% para simplificar, pode ser configurável)
    const riskFreeRate = 0;
    const excessReturn = avgReturn - riskFreeRate;

    // Sharpe Ratio = (Retorno médio - Taxa livre de risco) / Desvio padrão
    const sharpeRatio = stdDev > 0 ? excessReturn / stdDev : 0;

    return {
      sharpeRatio: parseFloat(sharpeRatio.toFixed(4)),
      avgReturn: parseFloat(avgReturn.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      riskFreeRate,
      returns: returns.map((r, idx) => ({
        date: byDay[idx].date,
        return: r,
      })),
    };
  }

  async getSymbolCorrelation(
    userId: number,
    tradeMode?: TradeMode,
    from?: Date,
    to?: Date
  ) {
    // Buscar IDs das exchange accounts do usuário
    const userAccounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: userId },
      select: { id: true },
    });

    const accountIds = userAccounts.map((acc) => acc.id);

    if (accountIds.length === 0) {
      return [];
    }

    const where: any = {
      exchange_account_id: { in: accountIds },
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

    console.log(`[ReportsService] getSymbolCorrelation: ${positions.length} posições encontradas`);

    // Agrupar por símbolo e data
    const bySymbolDate: Record<string, Record<string, number>> = {};

    for (const pos of positions) {
      if (!pos.closed_at) continue;
      const date = pos.closed_at.toISOString().split('T')[0];
      const symbol = pos.symbol;

      if (!bySymbolDate[symbol]) {
        bySymbolDate[symbol] = {};
      }
      if (!bySymbolDate[symbol][date]) {
        bySymbolDate[symbol][date] = 0;
      }
      bySymbolDate[symbol][date] += pos.realized_profit_usd.toNumber();
    }

    console.log(`[ReportsService] Símbolos encontrados: ${Object.keys(bySymbolDate).length}`);

    // Calcular correlação entre pares de símbolos
    const symbols = Object.keys(bySymbolDate);
    const correlations: Array<{
      symbol1: string;
      symbol2: string;
      correlation: number;
    }> = [];

    // Precisa de pelo menos 2 símbolos para calcular correlação
    if (symbols.length < 2) {
      console.log(`[ReportsService] Menos de 2 símbolos encontrados, retornando array vazio`);
      return [];
    }

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const sym1 = symbols[i];
        const sym2 = symbols[j];
        
        // Coletar todas as datas únicas de ambos os símbolos
        const dates1 = Object.keys(bySymbolDate[sym1]);
        const dates2 = Object.keys(bySymbolDate[sym2]);
        const allDates = new Set([...dates1, ...dates2]);
        const allDatesArray = Array.from(allDates).sort();

        if (allDatesArray.length < 2) {
          continue; // Precisa de pelo menos 2 datas
        }

        // Criar arrays de retornos para todas as datas
        const returns1 = allDatesArray.map(d => bySymbolDate[sym1][d] || 0);
        const returns2 = allDatesArray.map(d => bySymbolDate[sym2][d] || 0);

        // Filtrar apenas datas onde pelo menos um símbolo teve atividade
        const activeDates: number[] = [];
        for (let k = 0; k < allDatesArray.length; k++) {
          if (returns1[k] !== 0 || returns2[k] !== 0) {
            activeDates.push(k);
          }
        }

        if (activeDates.length < 2) {
          continue; // Precisa de pelo menos 2 pontos com atividade
        }

        const activeReturns1 = activeDates.map(idx => returns1[idx]);
        const activeReturns2 = activeDates.map(idx => returns2[idx]);

        const avg1 = activeReturns1.reduce((sum, r) => sum + r, 0) / activeReturns1.length;
        const avg2 = activeReturns2.reduce((sum, r) => sum + r, 0) / activeReturns2.length;

        const covariance = activeReturns1.reduce((sum, r1, idx) => {
          return sum + (r1 - avg1) * (activeReturns2[idx] - avg2);
        }, 0) / activeReturns1.length;

        const stdDev1 = Math.sqrt(
          activeReturns1.reduce((sum, r) => sum + Math.pow(r - avg1, 2), 0) / activeReturns1.length
        );
        const stdDev2 = Math.sqrt(
          activeReturns2.reduce((sum, r) => sum + Math.pow(r - avg2, 2), 0) / activeReturns2.length
        );

        const correlation = (stdDev1 > 0 && stdDev2 > 0) 
          ? covariance / (stdDev1 * stdDev2)
          : 0;

        // Só adicionar se a correlação for válida (não NaN)
        if (!isNaN(correlation) && isFinite(correlation)) {
          correlations.push({
            symbol1: sym1,
            symbol2: sym2,
            correlation: parseFloat(correlation.toFixed(4)),
          });
        }
      }
    }

    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }
}

