"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeJobService = void 0;
const shared_1 = require("@mvcashnode/shared");
class TradeJobService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createJob(dto) {
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
                status: shared_1.TradeJobStatus.PENDING,
            },
        });
    }
    async updateJobStatus(jobId, status, reasonCode, reasonMessage) {
        return this.prisma.tradeJob.update({
            where: { id: jobId },
            data: {
                status,
                reason_code: reasonCode || null,
                reason_message: reasonMessage || null,
            },
        });
    }
    async getJobsByStatus(status, tradeMode) {
        const where = { status };
        if (tradeMode)
            where.trade_mode = tradeMode;
        return this.prisma.tradeJob.findMany({
            where,
            include: {
                exchange_account: true,
                executions: true,
            },
        });
    }
}
exports.TradeJobService = TradeJobService;
//# sourceMappingURL=trade-job.service.js.map