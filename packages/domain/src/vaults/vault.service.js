"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultService = void 0;
const shared_1 = require("@mvcashnode/shared");
class VaultService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createVault(dto) {
        return this.prisma.vault.create({
            data: {
                user_id: dto.userId,
                name: dto.name,
                description: dto.description,
                trade_mode: dto.tradeMode,
            },
        });
    }
    async getVaultById(vaultId, userId) {
        const where = { id: vaultId };
        if (userId)
            where.user_id = userId;
        return this.prisma.vault.findFirst({
            where,
            include: {
                balances: true,
            },
        });
    }
    async getVaultsByUser(userId) {
        return this.prisma.vault.findMany({
            where: { user_id: userId },
            include: {
                balances: true,
            },
        });
    }
    async deposit(dto) {
        await this.prisma.$transaction(async (tx) => {
            const balance = await tx.vaultBalance.findUnique({
                where: {
                    vault_id_asset: {
                        vault_id: dto.vaultId,
                        asset: dto.asset,
                    },
                },
            });
            if (balance) {
                await tx.vaultBalance.update({
                    where: {
                        vault_id_asset: {
                            vault_id: dto.vaultId,
                            asset: dto.asset,
                        },
                    },
                    data: {
                        balance: {
                            increment: dto.amount,
                        },
                    },
                });
            }
            else {
                await tx.vaultBalance.create({
                    data: {
                        vault_id: dto.vaultId,
                        asset: dto.asset,
                        balance: dto.amount,
                    },
                });
            }
            await tx.vaultTransaction.create({
                data: {
                    vault_id: dto.vaultId,
                    type: shared_1.VaultTransactionType.DEPOSIT,
                    asset: dto.asset,
                    amount: dto.amount,
                },
            });
        });
    }
    async withdraw(dto) {
        await this.prisma.$transaction(async (tx) => {
            const balance = await tx.vaultBalance.findUnique({
                where: {
                    vault_id_asset: {
                        vault_id: dto.vaultId,
                        asset: dto.asset,
                    },
                },
            });
            if (!balance || balance.balance.toNumber() < dto.amount) {
                throw new Error('Insufficient balance');
            }
            await tx.vaultBalance.update({
                where: {
                    vault_id_asset: {
                        vault_id: dto.vaultId,
                        asset: dto.asset,
                    },
                },
                data: {
                    balance: {
                        decrement: dto.amount,
                    },
                },
            });
            await tx.vaultTransaction.create({
                data: {
                    vault_id: dto.vaultId,
                    type: shared_1.VaultTransactionType.WITHDRAWAL,
                    asset: dto.asset,
                    amount: dto.amount,
                },
            });
        });
    }
    async reserveForBuy(vaultId, asset, amount, jobId) {
        await this.prisma.$transaction(async (tx) => {
            const balance = await tx.vaultBalance.findUnique({
                where: {
                    vault_id_asset: {
                        vault_id: vaultId,
                        asset,
                    },
                },
            });
            if (!balance || balance.balance.toNumber() < amount) {
                throw new Error('Insufficient balance for reservation');
            }
            await tx.vaultBalance.update({
                where: {
                    vault_id_asset: {
                        vault_id: vaultId,
                        asset,
                    },
                },
                data: {
                    balance: {
                        decrement: amount,
                    },
                    reserved: {
                        increment: amount,
                    },
                },
            });
            await tx.vaultTransaction.create({
                data: {
                    vault_id: vaultId,
                    type: shared_1.VaultTransactionType.BUY_RESERVE,
                    asset,
                    amount,
                    trade_job_id: jobId,
                },
            });
        });
    }
    async confirmBuy(vaultId, asset, amount, jobId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.vaultBalance.update({
                where: {
                    vault_id_asset: {
                        vault_id: vaultId,
                        asset,
                    },
                },
                data: {
                    reserved: {
                        decrement: amount,
                    },
                },
            });
            await tx.vaultTransaction.create({
                data: {
                    vault_id: vaultId,
                    type: shared_1.VaultTransactionType.BUY_CONFIRM,
                    asset,
                    amount,
                    trade_job_id: jobId,
                },
            });
        });
    }
    async cancelBuy(vaultId, asset, amount, jobId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.vaultBalance.update({
                where: {
                    vault_id_asset: {
                        vault_id: vaultId,
                        asset,
                    },
                },
                data: {
                    balance: {
                        increment: amount,
                    },
                    reserved: {
                        decrement: amount,
                    },
                },
            });
            await tx.vaultTransaction.create({
                data: {
                    vault_id: vaultId,
                    type: shared_1.VaultTransactionType.BUY_CANCEL,
                    asset,
                    amount,
                    trade_job_id: jobId,
                },
            });
        });
    }
    async creditOnSell(vaultId, asset, amount, jobId) {
        await this.prisma.$transaction(async (tx) => {
            const balance = await tx.vaultBalance.findUnique({
                where: {
                    vault_id_asset: {
                        vault_id: vaultId,
                        asset,
                    },
                },
            });
            if (balance) {
                await tx.vaultBalance.update({
                    where: {
                        vault_id_asset: {
                            vault_id: vaultId,
                            asset,
                        },
                    },
                    data: {
                        balance: {
                            increment: amount,
                        },
                    },
                });
            }
            else {
                await tx.vaultBalance.create({
                    data: {
                        vault_id: vaultId,
                        asset,
                        balance: amount,
                    },
                });
            }
            await tx.vaultTransaction.create({
                data: {
                    vault_id: vaultId,
                    type: shared_1.VaultTransactionType.SELL_RETURN,
                    asset,
                    amount,
                    trade_job_id: jobId,
                },
            });
        });
    }
}
exports.VaultService = VaultService;
//# sourceMappingURL=vault.service.js.map