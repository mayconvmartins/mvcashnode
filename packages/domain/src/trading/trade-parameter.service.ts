import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';

export interface CreateTradeParameterDto {
  userId: number;
  exchangeAccountId: number;
  symbol: string;
  side: 'BUY' | 'SELL' | 'BOTH';
  quoteAmountFixed?: number;
  quoteAmountPctBalance?: number;
  maxOrdersPerHour?: number;
  minIntervalSec?: number;
  orderTypeDefault?: string;
  slippageBps?: number;
  defaultSlEnabled?: boolean;
  defaultSlPct?: number;
  defaultTpEnabled?: boolean;
  defaultTpPct?: number;
  trailingStopEnabled?: boolean;
  trailingDistancePct?: number;
  vaultId?: number;
}

export class TradeParameterService {
  constructor(private prisma: PrismaClient) {}

  async createParameter(dto: CreateTradeParameterDto): Promise<any> {
    return this.prisma.tradeParameter.create({
      data: {
        user_id: dto.userId,
        exchange_account_id: dto.exchangeAccountId,
        symbol: dto.symbol,
        side: dto.side,
        quote_amount_fixed: dto.quoteAmountFixed || null,
        quote_amount_pct_balance: dto.quoteAmountPctBalance || null,
        max_orders_per_hour: dto.maxOrdersPerHour || null,
        min_interval_sec: dto.minIntervalSec || null,
        order_type_default: dto.orderTypeDefault || 'MARKET',
        slippage_bps: dto.slippageBps || 0,
        default_sl_enabled: dto.defaultSlEnabled || false,
        default_sl_pct: dto.defaultSlPct || null,
        default_tp_enabled: dto.defaultTpEnabled || false,
        default_tp_pct: dto.defaultTpPct || null,
        trailing_stop_enabled: dto.trailingStopEnabled || false,
        trailing_distance_pct: dto.trailingDistancePct || null,
        vault_id: dto.vaultId || null,
      },
    });
  }

  async computeQuoteAmount(
    accountId: number,
    symbol: string,
    side: 'BUY' | 'SELL',
    tradeMode: TradeMode
  ): Promise<number> {
    const parameter = await this.prisma.tradeParameter.findFirst({
      where: {
        exchange_account_id: accountId,
        symbol,
        side: { in: [side, 'BOTH'] },
      },
    });

    if (!parameter) {
      throw new Error('Trade parameter not found');
    }

    if (parameter.quote_amount_fixed) {
      return parameter.quote_amount_fixed.toNumber();
    }

    if (parameter.quote_amount_pct_balance) {
      const balance = await this.prisma.accountBalanceCache.findUnique({
        where: {
          exchange_account_id_trade_mode_asset: {
            exchange_account_id: accountId,
            trade_mode: tradeMode,
            asset: 'USDT',
          },
        },
      });

      if (!balance) {
        throw new Error('Balance not found');
      }

      const available = balance.free.toNumber();
      return (available * parameter.quote_amount_pct_balance.toNumber()) / 100;
    }

    throw new Error('No quote amount configuration found');
  }

  async canOpenNewOrder(accountId: number, symbol: string, side: 'BUY' | 'SELL'): Promise<boolean> {
    const parameter = await this.prisma.tradeParameter.findFirst({
      where: {
        exchange_account_id: accountId,
        symbol,
        side: { in: [side, 'BOTH'] },
      },
    });

    if (!parameter) {
      return true; // No restrictions if no parameter
    }

    // Check max orders per hour
    if (parameter.max_orders_per_hour) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentJobs = await this.prisma.tradeJob.count({
        where: {
          exchange_account_id: accountId,
          symbol,
          side,
          created_at: { gte: oneHourAgo },
        },
      });

      if (recentJobs >= parameter.max_orders_per_hour) {
        return false;
      }
    }

    // Check min interval
    if (parameter.min_interval_sec) {
      const minIntervalAgo = new Date(Date.now() - parameter.min_interval_sec * 1000);
      const recentJob = await this.prisma.tradeJob.findFirst({
        where: {
          exchange_account_id: accountId,
          symbol,
          side,
          created_at: { gte: minIntervalAgo },
        },
        orderBy: { created_at: 'desc' },
      });

      if (recentJob) {
        return false;
      }
    }

    return true;
  }
}

