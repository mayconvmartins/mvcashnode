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
export declare class TradeJobService {
    private prisma;
    constructor(prisma: PrismaClient);
    createJob(dto: CreateTradeJobDto): Promise<any>;
    updateJobStatus(jobId: number, status: TradeJobStatus, reasonCode?: string, reasonMessage?: string): Promise<any>;
    getJobsByStatus(status: TradeJobStatus, tradeMode?: TradeMode): Promise<any[]>;
}
//# sourceMappingURL=trade-job.service.d.ts.map