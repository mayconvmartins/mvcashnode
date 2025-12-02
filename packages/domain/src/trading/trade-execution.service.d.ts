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
export declare class TradeExecutionService {
    private prisma;
    constructor(prisma: PrismaClient);
    createExecution(dto: CreateTradeExecutionDto): Promise<any>;
    updateExecution(executionId: number, updates: Partial<CreateTradeExecutionDto>): Promise<any>;
}
//# sourceMappingURL=trade-execution.service.d.ts.map