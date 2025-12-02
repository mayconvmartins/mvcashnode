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
export declare class TradeParameterService {
    private prisma;
    constructor(prisma: PrismaClient);
    createParameter(dto: CreateTradeParameterDto): Promise<any>;
    computeQuoteAmount(accountId: number, symbol: string, side: 'BUY' | 'SELL', tradeMode: TradeMode): Promise<number>;
    canOpenNewOrder(accountId: number, symbol: string, side: 'BUY' | 'SELL'): Promise<boolean>;
}
//# sourceMappingURL=trade-parameter.service.d.ts.map