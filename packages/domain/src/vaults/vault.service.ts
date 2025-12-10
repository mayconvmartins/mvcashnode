import { PrismaClient, Prisma } from '@mvcashnode/db';
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

  /**
   * ✅ BUG-MED-005 FIX: Executar transação com retry para deadlocks
   * ✅ BUG-BAIXO-003 FIX: Usar tipagem correta Prisma.TransactionClient ao invés de any
   */
  private async executeTransactionWithDeadlockRetry<T>(
    transactionFn: (tx: Prisma.TransactionClient) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(transactionFn);
      } catch (error: any) {
        lastError = error;
        
        // Verificar se é erro de deadlock (P2034)
        if (error?.code === 'P2034' && attempt < maxRetries) {
          // Delay aleatório entre 50ms e 200ms para evitar conflitos
          const delay = 50 + Math.random() * 150;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        
        // Se não for deadlock ou esgotou tentativas, lançar erro
        throw error;
      }
    }
    
    throw lastError;
  }

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

  async getVaultById(vaultId: number, userId?: number): Promise<any> {
    const where: any = { id: vaultId };
    if (userId) where.user_id = userId;

    return this.prisma.vault.findFirst({
      where,
      include: {
        balances: true,
      },
    });
  }

  async getVaultsByUser(userId: number): Promise<any[]> {
    return this.prisma.vault.findMany({
      where: { user_id: userId },
      include: {
        balances: true,
      },
    });
  }

  async deposit(dto: DepositDto): Promise<void> {
    // ✅ BUG-MED-005 FIX: Usar retry para deadlocks
    await this.executeTransactionWithDeadlockRetry(async (tx: Prisma.TransactionClient) => {
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
    // ✅ BUG-MED-005 FIX: Usar retry para deadlocks
    await this.executeTransactionWithDeadlockRetry(async (tx: Prisma.TransactionClient) => {
      const balance = await tx.vaultBalance.findUnique({
        where: {
          vault_id_asset: {
            vault_id: dto.vaultId,
            asset: dto.asset,
          },
        },
      });

      // ✅ BUG-CRIT-001 FIX: Validar saldo disponível considerando reservas
      if (!balance) {
        throw new Error('Balance not found');
      }

      const totalBalance = balance.balance.toNumber();
      const reservedBalance = balance.reserved?.toNumber() || 0;
      const availableBalance = totalBalance - reservedBalance;

      if (availableBalance < dto.amount) {
        throw new Error(
          `Insufficient available balance (considering reservations). ` +
          `Total: ${totalBalance}, Reserved: ${reservedBalance}, Available: ${availableBalance}, Requested: ${dto.amount}`
        );
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
    // ✅ BUG-MED-005 FIX: Usar retry para deadlocks
    await this.executeTransactionWithDeadlockRetry(async (tx: Prisma.TransactionClient) => {
      // ✅ BUG-CRIT-002 FIX: Implementar row-level locking com FOR UPDATE
      // Usar $queryRaw para garantir lock pessimista e evitar race conditions
      const balances = await tx.$queryRaw<Array<{ balance: any; reserved: any }>>`
        SELECT balance, reserved 
        FROM vault_balances 
        WHERE vault_id = ${vaultId} AND asset = ${asset}
        FOR UPDATE
      `;

      if (!balances || balances.length === 0) {
        throw new Error('Balance not found for reservation');
      }

      const balance = balances[0];
      const totalBalance = typeof balance.balance === 'object' 
        ? balance.balance.toNumber() 
        : Number(balance.balance);
      const reservedBalance = balance.reserved 
        ? (typeof balance.reserved === 'object' 
          ? balance.reserved.toNumber() 
          : Number(balance.reserved))
        : 0;
      const availableBalance = totalBalance - reservedBalance;

      if (availableBalance < amount) {
        throw new Error(
          `Insufficient available balance for reservation. ` +
          `Total: ${totalBalance}, Reserved: ${reservedBalance}, Available: ${availableBalance}, Requested: ${amount}`
        );
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
    // ✅ BUG-MED-005 FIX: Usar retry para deadlocks
    await this.executeTransactionWithDeadlockRetry(async (tx: Prisma.TransactionClient) => {
      // ✅ BUG-ALTO-005 FIX: Validar que reserva existe e é suficiente antes de decrementar
      const balance = await tx.vaultBalance.findUnique({
        where: {
          vault_id_asset: {
            vault_id: vaultId,
            asset,
          },
        },
      });

      if (!balance) {
        throw new Error(`Balance not found for vault ${vaultId} and asset ${asset}`);
      }

      const reservedBalance = balance.reserved?.toNumber() || 0;
      if (reservedBalance < amount) {
        throw new Error(
          `Reservation not found or insufficient. ` +
          `Reserved: ${reservedBalance}, Requested: ${amount}`
        );
      }

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
    // ✅ BUG-MED-005 FIX: Usar retry para deadlocks
    await this.executeTransactionWithDeadlockRetry(async (tx: Prisma.TransactionClient) => {
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
    // ✅ BUG-MED-005 FIX: Usar retry para deadlocks
    await this.executeTransactionWithDeadlockRetry(async (tx: Prisma.TransactionClient) => {
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


