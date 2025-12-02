import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { BinanceSpotAdapter } from '@mvcashnode/exchange';
import { ExchangeType, TradeMode } from '@mvcashnode/shared';

@Processor('balances-sync-real', {
  repeat: {
    pattern: '0 */5 * * * *', // Every 5 minutes
  },
})
export class BalancesSyncProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    // Get all active real accounts
    const accounts = await this.prisma.exchangeAccount.findMany({
      where: {
        is_simulation: false,
        is_active: true,
      },
    });

    const accountService = new ExchangeAccountService(
      this.prisma,
      this.encryptionService
    );
    let synced = 0;

    for (const account of accounts) {
      try {
        // Get API keys
        const keys = await accountService.decryptApiKeys(account.id);
        if (!keys) continue;

        // Create adapter
        const adapter = new BinanceSpotAdapter(
          account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: account.testnet }
        );

        // Fetch balance
        const balance = await adapter.fetchBalance();

        // Sync to cache
        const balances: Record<string, { free: number; locked: number }> = {};
        for (const [asset, amount] of Object.entries(balance.free || {})) {
          balances[asset] = {
            free: amount,
            locked: balance.used?.[asset] || 0,
          };
        }

        await accountService.syncBalance(account.id, TradeMode.REAL, balances);
        synced++;
      } catch (error) {
        console.error(`Error syncing balance for account ${account.id}:`, error);
      }
    }

    return { accountsChecked: accounts.length, synced };
  }
}

