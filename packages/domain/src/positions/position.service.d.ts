import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';
export interface PositionFill {
    executionId: number;
    side: 'BUY' | 'SELL';
    qty: number;
    price: number;
}
export declare class PositionService {
    private prisma;
    constructor(prisma: PrismaClient);
    onBuyExecuted(jobId: number, executionId: number, executedQty: number, avgPrice: number): Promise<number>;
    onSellExecuted(jobId: number, executionId: number, executedQty: number, avgPrice: number, origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING'): Promise<void>;
    getEligiblePositions(accountId: number, tradeMode: TradeMode, symbol: string, origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL'): Promise<any[]>;
    updateSLTP(positionId: number, slEnabled?: boolean, slPct?: number, tpEnabled?: boolean, tpPct?: number): Promise<any>;
    lockSellByWebhook(positionId: number, lock: boolean): Promise<any>;
    closePosition(positionId: number, quantity?: number): Promise<{
        positionId: number;
        qtyToClose: number;
    }>;
    private getCloseReason;
}
//# sourceMappingURL=position.service.d.ts.map