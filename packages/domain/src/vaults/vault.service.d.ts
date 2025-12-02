import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';
export interface CreateVaultDto {
    userId: number;
    name: string;
    description?: string;
    tradeMode: TradeMode;
}
export interface DepositDto {
    vaultId: number;
    asset: string;
    amount: number;
}
export interface WithdrawDto {
    vaultId: number;
    asset: string;
    amount: number;
}
export declare class VaultService {
    private prisma;
    constructor(prisma: PrismaClient);
    createVault(dto: CreateVaultDto): Promise<{
        id: number;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
        name: string;
        user_id: number;
        trade_mode: string;
        description: string | null;
    }>;
    getVaultById(vaultId: number, userId?: number): Promise<any>;
    getVaultsByUser(userId: number): Promise<any[]>;
    deposit(dto: DepositDto): Promise<void>;
    withdraw(dto: WithdrawDto): Promise<void>;
    reserveForBuy(vaultId: number, asset: string, amount: number, jobId: number): Promise<void>;
    confirmBuy(vaultId: number, asset: string, amount: number, jobId: number): Promise<void>;
    cancelBuy(vaultId: number, asset: string, amount: number, jobId: number): Promise<void>;
    creditOnSell(vaultId: number, asset: string, amount: number, jobId: number): Promise<void>;
}
//# sourceMappingURL=vault.service.d.ts.map