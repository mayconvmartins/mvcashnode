import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { ExchangeType, TradeMode } from '@mvcashnode/shared';
export interface CreateExchangeAccountDto {
    userId: number;
    exchange: ExchangeType;
    label: string;
    isSimulation: boolean;
    apiKey?: string;
    apiSecret?: string;
    proxyUrl?: string;
    testnet?: boolean;
    initialBalances?: Record<string, number>;
}
export declare class ExchangeAccountService {
    private prisma;
    private encryptionService;
    constructor(prisma: PrismaClient, encryptionService: EncryptionService);
    createAccount(dto: CreateExchangeAccountDto): Promise<any>;
    getAccountById(accountId: number, userId?: number): Promise<any>;
    getAccountsByUser(userId: number): Promise<any[]>;
    updateAccount(accountId: number, userId: number, updates: Partial<CreateExchangeAccountDto>): Promise<any>;
    deleteAccount(accountId: number, userId: number): Promise<any>;
    decryptApiKeys(accountId: number): Promise<{
        apiKey: string;
        apiSecret: string;
    } | null>;
    syncBalance(accountId: number, tradeMode: TradeMode, balances: Record<string, {
        free: number;
        locked: number;
    }>): Promise<void>;
}
//# sourceMappingURL=exchange-account.service.d.ts.map