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

@Processor('positions-sync-fees')
export class PositionsSyncFeesProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsSyncFeesProcessor.name);
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
    const jobName = 'positions-sync-fees';
    this.logger.log('[POSITIONS-SYNC-FEES] Iniciando sincronização de taxas com exchange...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Buscar execuções das últimas 24 horas que têm exchange_order_id
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const executions = await this.prisma.tradeExecution.findMany({
        where: {
          exchange_order_id: { not: null },
          created_at: { gte: oneDayAgo },
          trade_job: {
            exchange_account: {
              is_simulation: false,
              is_active: true,
            },
          },
        },
        include: {
          trade_job: {
            include: {
              exchange_account: {
                select: {
                  id: true,
                  exchange: true,
                  testnet: true,
                },
              },
            },
          },
        },
        take: 100, // Limitar a 100 por execução para não sobrecarregar
      });

      this.logger.log(`[POSITIONS-SYNC-FEES] Encontradas ${executions.length} execução(ões) para verificar`);

      let totalChecked = 0;
      let totalUpdated = 0;
      const discrepancies: Array<{
        execution_id: number;
        job_id: number;
        symbol: string;
        local_fee: number | null;
        exchange_fee: number;
        difference_pct: number;
      }> = [];

      // Agrupar por conta para otimizar
      const executionsByAccount = new Map<number, typeof executions>();
      for (const exec of executions) {
        const accountId = exec.exchange_account_id;
        if (!executionsByAccount.has(accountId)) {
          executionsByAccount.set(accountId, []);
        }
        executionsByAccount.get(accountId)!.push(exec);
      }

      for (const [accountId, accountExecutions] of executionsByAccount.entries()) {
        try {
          // Obter chaves da API
          const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
          const keys = await accountService.decryptApiKeys(accountId);

          if (!keys || !keys.apiKey || !keys.apiSecret) {
            this.logger.warn(`[POSITIONS-SYNC-FEES] Conta ${accountId} sem credenciais, pulando`);
            continue;
          }

          const account = accountExecutions[0].trade_job.exchange_account;
          const adapter = AdapterFactory.createAdapter(
            account.exchange as ExchangeType,
            keys.apiKey,
            keys.apiSecret,
            { testnet: account.testnet }
          );

          for (const execution of accountExecutions) {
            try {
              if (!execution.exchange_order_id) continue;

              totalChecked++;

              // Buscar trades reais da exchange
              const since = execution.created_at.getTime() - 60000; // 1 minuto antes
              const trades = await adapter.fetchMyTrades(
                execution.trade_job.symbol,
                since,
                100
              );

              // Filtrar trades que correspondem à ordem
              const orderTrades = trades.filter((t: any) => {
                return t.order === execution.exchange_order_id || 
                       t.orderId === execution.exchange_order_id ||
                       (t.info && (t.info.orderId === execution.exchange_order_id || t.info.orderListId === execution.exchange_order_id));
              });

              if (orderTrades.length === 0) {
                continue; // Não encontrou trades correspondentes
              }

              // Extrair taxas dos trades
              const fees = adapter.extractFeesFromTrades(orderTrades);
              
              if (fees.feeAmount === 0) {
                continue; // Sem taxas para comparar
              }

              const localFee = execution.fee_amount?.toNumber() || 0;
              const exchangeFee = fees.feeAmount;

              // Calcular diferença percentual
              const differencePct = exchangeFee > 0
                ? (Math.abs(localFee - exchangeFee) / exchangeFee) * 100
                : (localFee > 0 ? 100 : 0);

              // Se discrepância > 1%, registrar e atualizar
              if (differencePct > 1) {
                discrepancies.push({
                  execution_id: execution.id,
                  job_id: execution.trade_job_id,
                  symbol: execution.trade_job.symbol,
                  local_fee: localFee,
                  exchange_fee: exchangeFee,
                  difference_pct: differencePct,
                });

                // Atualizar taxa na execução
                await this.prisma.tradeExecution.update({
                  where: { id: execution.id },
                  data: {
                    fee_amount: exchangeFee,
                    fee_currency: fees.feeCurrency,
                    fee_rate: execution.cumm_quote_qty.toNumber() > 0
                      ? (exchangeFee / execution.cumm_quote_qty.toNumber()) * 100
                      : null,
                  },
                });

                totalUpdated++;
                this.logger.log(
                  `[POSITIONS-SYNC-FEES] ✅ Taxa atualizada: Execução ${execution.id} - ` +
                  `Local: ${localFee}, Exchange: ${exchangeFee}, Diferença: ${differencePct.toFixed(2)}%`
                );
              }
            } catch (execError: any) {
              this.logger.warn(
                `[POSITIONS-SYNC-FEES] Erro ao verificar execução ${execution.id}: ${execError.message}`
              );
            }
          }
        } catch (accountError: any) {
          this.logger.error(
            `[POSITIONS-SYNC-FEES] Erro ao processar conta ${accountId}: ${accountError.message}`
          );
        }
      }

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `[POSITIONS-SYNC-FEES] ✅ Concluído: ${totalChecked} execução(ões) verificada(s), ` +
        `${totalUpdated} taxa(s) atualizada(s), ${discrepancies.length} discrepância(s) detectada(s) (${durationMs}ms)`
      );

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        {
          total_checked: totalChecked,
          total_updated: totalUpdated,
          discrepancies: discrepancies.length,
        }
      );

      return {
        total_checked: totalChecked,
        total_updated: totalUpdated,
        discrepancies: discrepancies.slice(0, 50), // Limitar a 50
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(
        `[POSITIONS-SYNC-FEES] ❌ Erro: ${errorMessage}`,
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

