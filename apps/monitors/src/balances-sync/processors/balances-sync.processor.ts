import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService, NtpService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeMode } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('balances-sync-real')
export class BalancesSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BalancesSyncProcessor.name);
  private ntpService: NtpService | null = null;

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private cronExecutionService: CronExecutionService
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
    const startTime = Date.now();
    const jobName = 'balances-sync-real';
    this.logger.log('[BALANCES-SYNC-REAL] Iniciando sincronização de saldos...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Sincronizar NTP antes de processar (garantir offset atualizado)
      // Isso garante que o timestamp usado nas requisições está correto
      if (this.ntpService) {
        await this.ntpService.sync();
        const ntpInfo = this.ntpService.getInfo();
        this.logger.log(`[BALANCES-SYNC-REAL] NTP sincronizado - Offset: ${ntpInfo.offset}ms`);
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

        // ✅ CORREÇÃO: Remover ativos que não existem mais na exchange (saldo zerado)
        // A Binance não retorna ativos com saldo 0, então precisamos deletar do cache
        const existingCache = await this.prisma.accountBalanceCache.findMany({
          where: { exchange_account_id: account.id, trade_mode: TradeMode.REAL },
          select: { asset: true },
        });

        const assetsFromExchange = new Set(Object.keys(balances));
        const assetsToDelete = existingCache
          .filter(c => !assetsFromExchange.has(c.asset))
          .map(c => c.asset);

        if (assetsToDelete.length > 0) {
          await this.prisma.accountBalanceCache.deleteMany({
            where: {
              exchange_account_id: account.id,
              trade_mode: TradeMode.REAL,
              asset: { in: assetsToDelete },
            },
          });
          this.logger.log(`[BALANCES-SYNC-REAL] Conta ${account.id}: Removidos ${assetsToDelete.length} ativos zerados: ${assetsToDelete.join(', ')}`);
        }

        await accountService.syncBalance(account.id, TradeMode.REAL, balances);
        synced++;
      } catch (error) {
        console.error(`Error syncing balance for account ${account.id}:`, error);
      }
    }

    const result = { accountsChecked: accounts.length, synced };
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[BALANCES-SYNC-REAL] Sincronização concluída com sucesso. ` +
      `Contas verificadas: ${accounts.length}, Sincronizadas: ${synced}, Duração: ${durationMs}ms`
    );

    // Registrar sucesso
    await this.cronExecutionService.recordExecution(
      jobName,
      CronExecutionStatus.SUCCESS,
      durationMs,
      result
    );

    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error?.message || 'Erro desconhecido';

    this.logger.error(
      `[BALANCES-SYNC-REAL] Erro ao sincronizar saldos: ${errorMessage}`,
      error.stack
    );

    // Registrar falha
    await this.cronExecutionService.recordExecution(
      jobName,
      CronExecutionStatus.FAILED,
      durationMs,
      null,
      errorMessage
    );

    throw error;
  }
  }
}

