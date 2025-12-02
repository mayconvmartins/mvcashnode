"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeExecutionService = void 0;
class TradeExecutionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createExecution(dto) {
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
    async updateExecution(executionId, updates) {
        const updateData = {};
        if (updates.statusExchange)
            updateData.status_exchange = updates.statusExchange;
        if (updates.executedQty !== undefined)
            updateData.executed_qty = updates.executedQty;
        if (updates.avgPrice !== undefined)
            updateData.avg_price = updates.avgPrice;
        return this.prisma.tradeExecution.update({
            where: { id: executionId },
            data: updateData,
        });
    }
}
exports.TradeExecutionService = TradeExecutionService;
//# sourceMappingURL=trade-execution.service.js.map