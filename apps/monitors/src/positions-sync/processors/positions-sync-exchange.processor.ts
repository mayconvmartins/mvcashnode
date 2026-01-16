import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService, PositionService } from '@mvcashnode/domain';
import { EncryptionService, normalizeSymbol, ensureSymbolFormat, isValidSymbol } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';
import { ConfigService } from '@nestjs/config';

// ✅ OTIMIZAÇÃO CPU: Concurrency 2 permite processar múltiplos ciclos em paralelo
@Processor('positions-sync-exchange', { concurrency: 2 })
export class PositionsSyncExchangeProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsSyncExchangeProcessor.name);
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
    const jobName = 'positions-sync-exchange';
    this.logger.log('[POSITIONS-SYNC-EXCHANGE] Iniciando sincronização completa com exchange...');

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

      this.logger.log(`[POSITIONS-SYNC-EXCHANGE] Encontradas ${realAccounts.length} conta(s) REAL ativa(s)`);

      const results = {
        accounts_processed: 0,
        orders_found: 0,
        orders_created: 0,
        orders_updated: 0,
        positions_created: 0,
        errors: [] as Array<{ account_id: number; error: string }>,
      };

      for (const account of realAccounts) {
        try {
          // Obter chaves da API
          const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
          const keys = await accountService.decryptApiKeys(account.id);

          if (!keys || !keys.apiKey || !keys.apiSecret) {
            this.logger.warn(`[POSITIONS-SYNC-EXCHANGE] Conta ${account.id} sem credenciais, pulando`);
            continue;
          }

          const adapter = AdapterFactory.createAdapter(
            account.exchange as ExchangeType,
            keys.apiKey,
            keys.apiSecret,
            { testnet: account.testnet }
          );

          // Buscar símbolos únicos das posições abertas e jobs recentes desta conta
          const recentSymbols = await this.prisma.tradeJob.findMany({
            where: {
              exchange_account_id: account.id,
              created_at: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
              },
            },
            select: {
              symbol: true,
            },
            distinct: ['symbol'],
          });

          const symbols = recentSymbols.map(j => j.symbol);
          if (symbols.length === 0) {
            this.logger.log(`[POSITIONS-SYNC-EXCHANGE] Conta ${account.id}: Nenhum símbolo recente encontrado, pulando`);
            continue;
          }

          // Buscar trades para cada símbolo
          const since = Date.now() - 24 * 60 * 60 * 1000;
          const allTrades: any[] = [];
          
          for (const symbol of symbols) {
            try {
              // A exchange (CCXT) geralmente espera formato BASE/QUOTE, enquanto no banco queremos BASEQUOTE (sem barra)
              const exchangeSymbol = ensureSymbolFormat(symbol);
              const trades = await adapter.fetchMyTrades(exchangeSymbol, since, 1000);
              allTrades.push(...trades);
            } catch (error: any) {
              this.logger.warn(`[POSITIONS-SYNC-EXCHANGE] Erro ao buscar trades para ${symbol}: ${error.message}`);
            }
          }

          this.logger.log(
            `[POSITIONS-SYNC-EXCHANGE] Conta ${account.id}: Encontrados ${allTrades.length} trade(s) nas últimas 24h para ${symbols.length} símbolo(s)`
          );

          // Agrupar trades por orderId
          const tradesByOrder = new Map<string, typeof allTrades>();
          for (const trade of allTrades) {
            const orderId = trade.order || trade.orderId || (trade.info && trade.info.orderId);
            if (orderId) {
              if (!tradesByOrder.has(orderId)) {
                tradesByOrder.set(orderId, []);
              }
              tradesByOrder.get(orderId)!.push(trade);
            }
          }

          results.orders_found += tradesByOrder.size;

          // Para cada ordem, verificar se existe no sistema
          for (const [orderId, trades] of tradesByOrder.entries()) {
            try {
              // Verificar se já existe execução com este exchange_order_id
              const existingExecution = await this.prisma.tradeExecution.findFirst({
                where: {
                  exchange_order_id: orderId,
                  exchange: account.exchange,
                  exchange_account_id: account.id,
                },
                include: {
                  trade_job: true,
                },
              });

              if (existingExecution) {
                // Já existe, verificar se precisa atualizar
                const totalQty = trades.reduce((sum, t) => sum + (t.amount || 0), 0);
                const totalCost = trades.reduce((sum, t) => sum + (t.cost || 0), 0);
                const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

                const currentQty = existingExecution.executed_qty.toNumber();
                const currentPrice = existingExecution.avg_price.toNumber();

                // Se houver diferença significativa, atualizar
                if (Math.abs(totalQty - currentQty) > 0.00000001 || Math.abs(avgPrice - currentPrice) > 0.00000001) {
                  await this.prisma.tradeExecution.update({
                    where: { id: existingExecution.id },
                    data: {
                      executed_qty: totalQty,
                      avg_price: avgPrice,
                      cumm_quote_qty: totalCost,
                    },
                  });
                  results.orders_updated++;
                  this.logger.log(
                    `[POSITIONS-SYNC-EXCHANGE] ✅ Execução ${existingExecution.id} atualizada: ` +
                    `qty ${currentQty} -> ${totalQty}, price ${currentPrice} -> ${avgPrice}`
                  );
                }
                continue;
              }

              // Não existe, criar nova execução e job se necessário
              // Extrair informações do primeiro trade
              const firstTrade = trades[0];
              const rawSymbol = firstTrade.symbol || firstTrade.info?.symbol;
              const side = firstTrade.side?.toUpperCase() || (firstTrade.info?.side?.toUpperCase());

              if (!rawSymbol || !side || (side !== 'BUY' && side !== 'SELL')) {
                this.logger.warn(
                  `[POSITIONS-SYNC-EXCHANGE] Trade com orderId ${orderId} sem símbolo ou lado válido, pulando`
                );
                continue;
              }

              // ✅ Normalizar símbolo antes de persistir (nunca gravar com "/")
              const normalizedSymbol = normalizeSymbol(String(rawSymbol));
              if (!isValidSymbol(normalizedSymbol)) {
                this.logger.warn(
                  `[POSITIONS-SYNC-EXCHANGE] Símbolo inválido ao normalizar: "${rawSymbol}" -> "${normalizedSymbol}", pulando orderId ${orderId}`
                );
                continue;
              }

              // ✅ BUG-011 FIX: Verificar se já existe job IMPORTED para essa ordem
              // Isso previne criação de jobs duplicados quando sync roda múltiplas vezes
              const existingImportedJob = await this.prisma.tradeJob.findFirst({
                where: {
                  exchange_account_id: account.id,
                  symbol: normalizedSymbol,
                  side: side as 'BUY' | 'SELL',
                  created_by: 'EXCHANGE_SYNC',
                  created_at: {
                    // Buscar jobs criados nas últimas 48h (2x o período de sync)
                    gte: new Date(Date.now() - 48 * 60 * 60 * 1000),
                  },
                },
                include: {
                  executions: {
                    where: {
                      exchange_order_id: orderId,
                    },
                    take: 1,
                  },
                },
              });

              if (existingImportedJob && existingImportedJob.executions.length > 0) {
                this.logger.log(
                  `[POSITIONS-SYNC-EXCHANGE] ⏭️ Job IMPORTED ${existingImportedJob.id} já existe para orderId ${orderId}, pulando`
                );
                continue;
              }

              const totalQty = trades.reduce((sum, t) => sum + (t.amount || 0), 0);
              const totalCost = trades.reduce((sum, t) => sum + (t.cost || 0), 0);
              const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

              // Extrair taxas
              const fees = adapter.extractFeesFromTrades(trades);

              // Criar job e execução
              await this.prisma.$transaction(async (tx) => {
                const tradeJob = await tx.tradeJob.create({
                  data: {
                    exchange_account_id: account.id,
                    trade_mode: 'REAL',
                    symbol: normalizedSymbol,
                    side: side as 'BUY' | 'SELL',
                    // ✅ CORREÇÃO CRÍTICA: Usar 'IMPORTED' em vez de 'MARKET' para evitar execução acidental
                    // 'IMPORTED' indica que este é um registro histórico importado, não uma ordem a ser executada
                    order_type: 'IMPORTED',
                    status: 'FILLED',
                    base_quantity: totalQty,
                    created_by: 'EXCHANGE_SYNC',
                    // ✅ Marca explícita: importado da exchange (registro histórico, nunca deve executar)
                    reason_code: 'EXCHANGE_SYNC_IMPORTED',
                    reason_message: `Importado via EXCHANGE_SYNC a partir do histórico de trades da corretora (orderId=${orderId}). Registro histórico - NÃO EXECUTAR.`,
                  },
                });

                const tradeExecution = await tx.tradeExecution.create({
                  data: {
                    trade_job_id: tradeJob.id,
                    exchange_account_id: account.id,
                    trade_mode: 'REAL',
                    exchange: account.exchange,
                    exchange_order_id: orderId,
                    client_order_id: `SYNC-${orderId}`,
                    status_exchange: 'FILLED',
                    executed_qty: totalQty,
                    cumm_quote_qty: totalCost,
                    avg_price: avgPrice,
                    fee_amount: fees.feeAmount > 0 ? fees.feeAmount : null,
                    fee_currency: fees.feeCurrency || null,
                    fee_rate: fees.feeAmount > 0 && totalCost > 0 ? (fees.feeAmount / totalCost) * 100 : null,
                  },
                });

                // Se for BUY, criar posição se não existir
                if (side === 'BUY') {
                  const existingPosition = await tx.tradePosition.findUnique({
                    where: {
                      trade_job_id_open: tradeJob.id,
                    },
                  });

                  if (!existingPosition) {
                    // ✅ OTIMIZAÇÃO CPU: Import movido para o topo do arquivo
                    // tx é compatível com PrismaClient para os métodos usados pelo PositionService
                    const positionService = new PositionService(tx as any);
                    await positionService.onBuyExecuted(
                      tradeJob.id,
                      tradeExecution.id,
                      totalQty,
                      avgPrice,
                      fees.feeAmount > 0 ? fees.feeAmount : undefined,
                      fees.feeCurrency || undefined
                    );
                    results.positions_created++;
                  }
                }

                results.orders_created++;
                this.logger.log(
                  `[POSITIONS-SYNC-EXCHANGE] ✅ Criado job ${tradeJob.id} e execução ${tradeExecution.id} para ordem ${orderId}`
                );
              });
            } catch (orderError: any) {
              this.logger.error(
                `[POSITIONS-SYNC-EXCHANGE] Erro ao processar ordem ${orderId}: ${orderError.message}`
              );
            }
          }

          results.accounts_processed++;
        } catch (accountError: any) {
          results.errors.push({
            account_id: account.id,
            error: accountError.message,
          });
          this.logger.error(
            `[POSITIONS-SYNC-EXCHANGE] Erro ao processar conta ${account.id}: ${accountError.message}`
          );
        }
      }

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `[POSITIONS-SYNC-EXCHANGE] ✅ Concluído: ${results.accounts_processed} conta(s) processada(s), ` +
        `${results.orders_found} ordem(ns) encontrada(s), ${results.orders_created} criada(s), ` +
        `${results.orders_updated} atualizada(s), ${results.positions_created} posição(ões) criada(s) (${durationMs}ms)`
      );

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        results
      );

      return results;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(
        `[POSITIONS-SYNC-EXCHANGE] ❌ Erro: ${errorMessage}`,
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

