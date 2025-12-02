import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService, NtpService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeMode } from '@mvcashnode/shared';

@Processor('balances-sync-real')
export class BalancesSyncProcessor extends WorkerHost {
  private ntpService: NtpService | null = null;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
    // Inicializar NTP service (mesmo método usado no main.ts)
    this.initializeNtpService();
  }

  private initializeNtpService() {
    // Verificar se NTP está habilitado
    const ntpEnabled = process.env.NTP_ENABLED === 'true';
    if (ntpEnabled) {
      const ntpServer = process.env.NTP_SERVER || 'pool.ntp.org';
      const ntpSyncInterval = parseInt(process.env.NTP_SYNC_INTERVAL || '3600000');
      
      this.ntpService = new NtpService(ntpServer, ntpSyncInterval, ntpEnabled);
      
      // Garantir que AdapterFactory está usando o NTP service
      AdapterFactory.setNtpService(this.ntpService);
      console.log('[BalancesSync] NTP Service inicializado');
    }
  }

  async process(_job: Job<any>): Promise<any> {
    // Sincronizar NTP antes de processar (garantir offset atualizado)
    // Isso garante que o timestamp usado nas requisições está correto
    if (this.ntpService) {
      await this.ntpService.sync();
      const ntpInfo = this.ntpService.getInfo();
      console.log(`[BalancesSync] NTP sincronizado - Offset: ${ntpInfo.offset}ms`);
      
      // Garantir que AdapterFactory está usando o NTP service atualizado
      AdapterFactory.setNtpService(this.ntpService);
    }

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

        // Garantir que NTP está configurado antes de criar adapter
        if (this.ntpService) {
          AdapterFactory.setNtpService(this.ntpService);
        }

        // Create adapter
        const adapter = AdapterFactory.createAdapter(
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

