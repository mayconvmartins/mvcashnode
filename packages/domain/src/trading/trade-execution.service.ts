import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';

export interface CreateTradeExecutionDto {
  tradeJobId: number;
  exchangeAccountId: number;
  tradeMode: TradeMode;
  exchange: string;
  exchangeOrderId?: string;
  clientOrderId: string;
  statusExchange: string;
  executedQty: number;
  cummQuoteQty: number;
  avgPrice: number;
  fillsJson?: any;
  rawResponseJson?: any;
}

export class TradeExecutionService {
  constructor(private prisma: PrismaClient) {}

  async createExecution(dto: CreateTradeExecutionDto) {
    return this.prisma.tradeExecution.create({
      data: {
        trade_job_id: dto.tradeJobId,
        exchange_account_id: dto.exchangeAccountId,
        trade_mode: dto.tradeMode,
        exchange: dto.exchange,
        exchange_order_id: dto.exchangeOrderId || null,
        client_order_id: dto.clientOrderId,
        status_exchange: dto.statusExchange,
        executed_qty: dto.executedQty,
        cumm_quote_qty: dto.cummQuoteQty,
        avg_price: dto.avgPrice,
        fills_json: dto.fillsJson ? JSON.parse(JSON.stringify(dto.fillsJson)) : null,
        raw_response_json: dto.rawResponseJson ? JSON.parse(JSON.stringify(dto.rawResponseJson)) : null,
      },
    });
  }

  async updateExecution(executionId: number, updates: Partial<CreateTradeExecutionDto>) {
    const updateData: any = {};
    if (updates.statusExchange) updateData.status_exchange = updates.statusExchange;
    if (updates.executedQty !== undefined) updateData.executed_qty = updates.executedQty;
    if (updates.avgPrice !== undefined) updateData.avg_price = updates.avgPrice;

    return this.prisma.tradeExecution.update({
      where: { id: executionId },
      data: updateData,
    });
  }
}

