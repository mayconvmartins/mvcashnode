import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, TradeJobStatus } from '@mvcashnode/shared';

export interface CreateTradeJobDto {
  webhookEventId?: number;
  exchangeAccountId: number;
  tradeMode: TradeMode;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
  quoteAmount?: number;
  baseQuantity?: number;
  limitPrice?: number;
  vaultId?: number;
  limitOrderExpiresAt?: Date;
}

export class TradeJobService {
  constructor(private prisma: PrismaClient) {}

  async createJob(dto: CreateTradeJobDto) {
    return this.prisma.tradeJob.create({
      data: {
        webhook_event_id: dto.webhookEventId || null,
        exchange_account_id: dto.exchangeAccountId,
        trade_mode: dto.tradeMode,
        symbol: dto.symbol,
        side: dto.side,
        order_type: dto.orderType,
        quote_amount: dto.quoteAmount || null,
        base_quantity: dto.baseQuantity || null,
        limit_price: dto.limitPrice || null,
        vault_id: dto.vaultId || null,
        limit_order_expires_at: dto.limitOrderExpiresAt || null,
        status: TradeJobStatus.PENDING,
      },
    });
  }

  async updateJobStatus(jobId: number, status: TradeJobStatus, reasonCode?: string, reasonMessage?: string) {
    return this.prisma.tradeJob.update({
      where: { id: jobId },
      data: {
        status,
        reason_code: reasonCode || null,
        reason_message: reasonMessage || null,
      },
    });
  }

  async getJobsByStatus(status: TradeJobStatus, tradeMode?: TradeMode) {
    const where: any = { status };
    if (tradeMode) where.trade_mode = tradeMode;

    return this.prisma.tradeJob.findMany({
      where,
      include: {
        exchange_account: true,
        executions: true,
      },
    });
  }
}

