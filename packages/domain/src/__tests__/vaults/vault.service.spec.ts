import { VaultService } from '../../vaults/vault.service';
import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, VaultTransactionType } from '@mvcashnode/shared';

describe('VaultService', () => {
  let vaultService: VaultService;
  let prisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prisma = {
      vault: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      vaultBalance: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vaultTransaction: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    vaultService = new VaultService(prisma);
  });

  describe('deposit', () => {
    it('should deposit to existing balance', async () => {
      const existingBalance = {
        id: 1,
        vault_id: 1,
        asset: 'USDT',
        balance: { toNumber: () => 1000 },
        reserved: { toNumber: () => 0 },
      };

      prisma.vaultBalance.findUnique = jest.fn().mockResolvedValue(existingBalance);
      prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      });

      await vaultService.deposit({
        vaultId: 1,
        asset: 'USDT',
        amount: 500,
      });

      expect(prisma.vaultBalance.update).toHaveBeenCalled();
      expect(prisma.vaultTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: VaultTransactionType.DEPOSIT,
          amount: 500,
        }),
      });
    });
  });

  describe('withdraw', () => {
    it('should throw error if insufficient balance', async () => {
      const existingBalance = {
        id: 1,
        vault_id: 1,
        asset: 'USDT',
        balance: { toNumber: () => 100 },
        reserved: { toNumber: () => 0 },
      };

      prisma.vaultBalance.findUnique = jest.fn().mockResolvedValue(existingBalance);
      prisma.$transaction = jest.fn().mockImplementation(async (callback) => {
        return callback(prisma);
      });

      await expect(
        vaultService.withdraw({
          vaultId: 1,
          asset: 'USDT',
          amount: 500,
        })
      ).rejects.toThrow('Insufficient balance');
    });
  });
});

