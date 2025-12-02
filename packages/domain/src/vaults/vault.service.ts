import { PrismaClient } from '@mvcashnode/db';
import { VaultTransactionType, TradeMode } from '@mvcashnode/shared';

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

export class VaultService {
  constructor(private prisma: PrismaClient) {}

  async createVault(dto: CreateVaultDto) {
    return this.prisma.vault.create({
      data: {
        user_id: dto.userId,
        name: dto.name,
        description: dto.description,
        trade_mode: dto.tradeMode,
      },
    });
  }

  async getVaultById(vaultId: number, userId?: number) {
    const where: any = { id: vaultId };
    if (userId) where.user_id = userId;

    return this.prisma.vault.findFirst({
      where,
      include: {
        balances: true,
      },
    });
  }

  async getVaultsByUser(userId: number) {
    return this.prisma.vault.findMany({
      where: { user_id: userId },
      include: {
        balances: true,
      },
    });
  }

  async deposit(dto: DepositDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Lock the balance row
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
      } else {
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
          type: VaultTransactionType.DEPOSIT,
          asset: dto.asset,
          amount: dto.amount,
        },
      });
    });
  }

  async withdraw(dto: WithdrawDto): Promise<void> {
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
          type: VaultTransactionType.WITHDRAWAL,
          asset: dto.asset,
          amount: dto.amount,
        },
      });
    });
  }

  async reserveForBuy(vaultId: number, asset: string, amount: number, jobId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE to lock the row
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
          type: VaultTransactionType.BUY_RESERVE,
          asset,
          amount,
          trade_job_id: jobId,
        },
      });
    });
  }

  async confirmBuy(vaultId: number, asset: string, amount: number, jobId: number): Promise<void> {
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
          type: VaultTransactionType.BUY_CONFIRM,
          asset,
          amount,
          trade_job_id: jobId,
        },
      });
    });
  }

  async cancelBuy(vaultId: number, asset: string, amount: number, jobId: number): Promise<void> {
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
          type: VaultTransactionType.BUY_CANCEL,
          asset,
          amount,
          trade_job_id: jobId,
        },
      });
    });
  }

  async creditOnSell(vaultId: number, asset: string, amount: number, jobId: number): Promise<void> {
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
      } else {
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
          type: VaultTransactionType.SELL_RETURN,
          asset,
          amount,
          trade_job_id: jobId,
        },
      });
    });
  }
}


