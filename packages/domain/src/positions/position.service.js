"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionService = void 0;
const shared_1 = require("@mvcashnode/shared");
class PositionService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async onBuyExecuted(jobId, executionId, executedQty, avgPrice) {
        const job = await this.prisma.tradeJob.findUnique({
            where: { id: jobId },
            include: { exchange_account: true },
        });
        if (!job || job.side !== 'BUY') {
            throw new Error('Invalid buy job');
        }
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
                status: shared_1.PositionStatus.OPEN,
            },
        });
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
    async onSellExecuted(jobId, executionId, executedQty, avgPrice, origin) {
        const job = await this.prisma.tradeJob.findUnique({
            where: { id: jobId },
            include: { exchange_account: true },
        });
        if (!job || job.side !== 'SELL') {
            throw new Error('Invalid sell job');
        }
        const eligiblePositions = await this.prisma.tradePosition.findMany({
            where: {
                exchange_account_id: job.exchange_account_id,
                trade_mode: job.trade_mode,
                symbol: job.symbol,
                side: 'LONG',
                status: shared_1.PositionStatus.OPEN,
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
            if (remainingToSell <= 0)
                break;
            const qtyToClose = Math.min(position.qty_remaining.toNumber(), remainingToSell);
            const profitUsd = (avgPrice - position.price_open.toNumber()) * qtyToClose;
            const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
            const newRealizedProfit = position.realized_profit_usd.toNumber() + profitUsd;
            await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: {
                    qty_remaining: newQtyRemaining,
                    realized_profit_usd: newRealizedProfit,
                    status: newQtyRemaining === 0 ? shared_1.PositionStatus.CLOSED : shared_1.PositionStatus.OPEN,
                    closed_at: newQtyRemaining === 0 ? new Date() : null,
                    close_reason: newQtyRemaining === 0 ? this.getCloseReason(origin) : null,
                },
            });
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
            await this.prisma.tradeJob.update({
                where: { id: jobId },
                data: {
                    status: 'PARTIALLY_FILLED',
                    reason_message: `Only ${executedQty - remainingToSell} executed, ${remainingToSell} remaining`,
                },
            });
        }
    }
    async getEligiblePositions(accountId, tradeMode, symbol, origin) {
        return this.prisma.tradePosition.findMany({
            where: {
                exchange_account_id: accountId,
                trade_mode: tradeMode,
                symbol,
                side: 'LONG',
                status: shared_1.PositionStatus.OPEN,
                qty_remaining: { gt: 0 },
                ...(origin === 'WEBHOOK' ? { lock_sell_by_webhook: false } : {}),
            },
            orderBy: { created_at: 'asc' },
        });
    }
    async updateSLTP(positionId, slEnabled, slPct, tpEnabled, tpPct) {
        const updateData = {};
        if (slEnabled !== undefined)
            updateData.sl_enabled = slEnabled;
        if (slPct !== undefined)
            updateData.sl_pct = slPct;
        if (tpEnabled !== undefined)
            updateData.tp_enabled = tpEnabled;
        if (tpPct !== undefined)
            updateData.tp_pct = tpPct;
        return this.prisma.tradePosition.update({
            where: { id: positionId },
            data: updateData,
        });
    }
    async lockSellByWebhook(positionId, lock) {
        return this.prisma.tradePosition.update({
            where: { id: positionId },
            data: { lock_sell_by_webhook: lock },
        });
    }
    async closePosition(positionId, quantity) {
        const position = await this.prisma.tradePosition.findUnique({
            where: { id: positionId },
        });
        if (!position || position.status === shared_1.PositionStatus.CLOSED) {
            throw new Error('Position not found or already closed');
        }
        const qtyToClose = quantity || position.qty_remaining.toNumber();
        if (qtyToClose > position.qty_remaining.toNumber()) {
            throw new Error('Quantity exceeds remaining');
        }
        return { positionId, qtyToClose };
    }
    getCloseReason(origin) {
        switch (origin) {
            case 'STOP_LOSS':
                return shared_1.CloseReason.STOP_LOSS;
            case 'TAKE_PROFIT':
                return shared_1.CloseReason.TARGET_HIT;
            case 'WEBHOOK':
                return shared_1.CloseReason.WEBHOOK_SELL;
            case 'MANUAL':
                return shared_1.CloseReason.MANUAL;
            default:
                return shared_1.CloseReason.MANUAL;
        }
    }
}
exports.PositionService = PositionService;
//# sourceMappingURL=position.service.js.map