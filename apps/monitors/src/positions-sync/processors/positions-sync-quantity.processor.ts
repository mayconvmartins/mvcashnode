import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';
import { ConfigService } from '@nestjs/config';

// ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos ciclos em paralelo
@Processor('positions-sync-quantity', { concurrency: 2 })
export class PositionsSyncQuantityProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsSyncQuantityProcessor.name);
  private encryptionService: EncryptionService;

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService,
    private configService: ConfigService
  ) {
    super();
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key || key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
    }
    this.encryptionService = new EncryptionService(key);
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'positions-sync-quantity';
    this.logger.log('[POSITIONS-SYNC-QUANTITY] Iniciando sincronização de quantidades com exchange...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Buscar todas as contas REAL ativas
      const realAccounts = await this.prisma.exchangeAccount.findMany({
        where: {
          is_simulation: false,
          is_active: true,
        },
        select: {
          id: true,
          exchange: true,
          testnet: true,
        },
      });

      this.logger.log(`[POSITIONS-SYNC-QUANTITY] Encontradas ${realAccounts.length} conta(s) REAL ativa(s)`);

      let totalChecked = 0;
      let totalDiscrepancies = 0;
      const discrepancies: Array<{
        position_id: number;
        account_id: number;
        symbol: string;
        local_qty: number;
        exchange_qty: number;
        difference: number;
        difference_pct: number;
      }> = [];

      for (const account of realAccounts) {
        try {
          // Buscar posições abertas desta conta
          const openPositions = await this.prisma.tradePosition.findMany({
            where: {
              exchange_account_id: account.id,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
            },
            select: {
              id: true,
              symbol: true,
              qty_remaining: true,
            },
          });

          if (openPositions.length === 0) {
            continue;
          }

          // Obter chaves da API
          const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
          const keys = await accountService.decryptApiKeys(account.id);

          if (!keys || !keys.apiKey || !keys.apiSecret) {
            this.logger.warn(`[POSITIONS-SYNC-QUANTITY] Conta ${account.id} sem credenciais, pulando`);
            continue;
          }

          // Criar adapter
          const adapter = AdapterFactory.createAdapter(
            account.exchange as ExchangeType,
            keys.apiKey,
            keys.apiSecret,
            { testnet: account.testnet }
          );

          // Agrupar posições por símbolo para otimizar buscas
          const positionsBySymbol = new Map<string, typeof openPositions>();
          for (const pos of openPositions) {
            if (!positionsBySymbol.has(pos.symbol)) {
              positionsBySymbol.set(pos.symbol, []);
            }
            positionsBySymbol.get(pos.symbol)!.push(pos);
          }

          // Para cada símbolo, buscar saldo na exchange
          for (const [symbol, positions] of positionsBySymbol.entries()) {
            try {
              // Obter base asset do símbolo
              const baseAsset = symbol.split('/')[0];

              // Buscar saldo na exchange
              const balances = await adapter.fetchBalance();
              const exchangeBalance = balances.free[baseAsset] || 0;

              // Comparar com posições locais
              const localTotalQty = positions.reduce((sum, pos) => sum + pos.qty_remaining.toNumber(), 0);

              totalChecked += positions.length;

              // Calcular diferença
              const difference = Math.abs(localTotalQty - exchangeBalance);
              const differencePct = exchangeBalance > 0 
                ? (difference / exchangeBalance) * 100 
                : (localTotalQty > 0 ? 100 : 0);

              // Se discrepância > 0.1%, registrar
              if (differencePct > 0.1) {
                totalDiscrepancies += positions.length;
                
                for (const pos of positions) {
                  const posQty = pos.qty_remaining.toNumber();
                  // Estimar quantidade na exchange proporcionalmente
                  const estimatedExchangeQty = exchangeBalance > 0 && localTotalQty > 0
                    ? (posQty / localTotalQty) * exchangeBalance
                    : 0;

                  discrepancies.push({
                    position_id: pos.id,
                    account_id: account.id,
                    symbol: symbol,
                    local_qty: posQty,
                    exchange_qty: estimatedExchangeQty,
                    difference: Math.abs(posQty - estimatedExchangeQty),
                    difference_pct: estimatedExchangeQty > 0
                      ? (Math.abs(posQty - estimatedExchangeQty) / estimatedExchangeQty) * 100
                      : (posQty > 0 ? 100 : 0),
                  });

                  this.logger.warn(
                    `[POSITIONS-SYNC-QUANTITY] ⚠️ Discrepância detectada: Posição ${pos.id} (${symbol}) - ` +
                    `Local: ${posQty}, Exchange estimado: ${estimatedExchangeQty.toFixed(8)}, ` +
                    `Diferença: ${differencePct.toFixed(2)}%`
                  );
                }
              }
            } catch (symbolError: any) {
              this.logger.error(
                `[POSITIONS-SYNC-QUANTITY] Erro ao verificar símbolo ${symbol} na conta ${account.id}: ${symbolError.message}`
              );
            }
          }
        } catch (accountError: any) {
          this.logger.error(
            `[POSITIONS-SYNC-QUANTITY] Erro ao processar conta ${account.id}: ${accountError.message}`
          );
        }
      }

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `[POSITIONS-SYNC-QUANTITY] ✅ Concluído: ${totalChecked} posição(ões) verificada(s), ` +
        `${totalDiscrepancies} discrepância(s) detectada(s) (${durationMs}ms)`
      );

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        {
          total_checked: totalChecked,
          total_discrepancies: totalDiscrepancies,
          discrepancies: discrepancies.length,
        }
      );

      return {
        total_checked: totalChecked,
        total_discrepancies: totalDiscrepancies,
        discrepancies: discrepancies.slice(0, 100), // Limitar a 100 para não sobrecarregar
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(
        `[POSITIONS-SYNC-QUANTITY] ❌ Erro: ${errorMessage}`,
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

