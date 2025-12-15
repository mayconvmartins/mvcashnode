import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { TradeJobService, PositionService } from '@mvcashnode/domain';
import { EncryptionService, CacheService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, PositionStatus, TradeMode } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('sl-tp-monitor-real')
export class SLTPMonitorRealProcessor extends WorkerHost {
  private readonly logger = new Logger(SLTPMonitorRealProcessor.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    @InjectQueue('trade-execution-real') private readonly tradeExecutionQueue: Queue,
    private cronExecutionService: CronExecutionService,
    private cacheService: CacheService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'sl-tp-monitor-real';
    this.logger.log('[SL-TP-MONITOR-REAL] Iniciando monitoramento de SL/TP...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
    // Get all open positions with SL/TP enabled
    // IMPORTANTE: Monitor SL/TP deve processar APENAS posições abertas
    // Posições fechadas não devem ser monitoradas pois não faz sentido e pode causar problemas
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: PositionStatus.OPEN, // Apenas posições abertas
        qty_remaining: { gt: 0 }, // Apenas posições com quantidade restante
        closed_at: null, // Garantir que não há data de fechamento (camada extra de segurança)
        OR: [
          { sl_enabled: true },
          { tp_enabled: true },
          { trailing_enabled: true },
        ],
      },
      include: {
        exchange_account: true,
      },
    });

    // Validação de segurança: garantir que apenas posições abertas sejam processadas
    const validPositions = positions.filter((position) => {
      if (position.status !== PositionStatus.OPEN) {
        this.logger.warn(`[SL-TP-MONITOR-REAL] ⚠️ Posição ${position.id} com status ${position.status} encontrada - será ignorada`);
        return false;
      }
      if (position.qty_remaining.toNumber() <= 0) {
        this.logger.warn(`[SL-TP-MONITOR-REAL] ⚠️ Posição ${position.id} com qty_remaining <= 0 encontrada - será ignorada`);
        return false;
      }
      if (position.closed_at !== null) {
        this.logger.warn(`[SL-TP-MONITOR-REAL] ⚠️ Posição ${position.id} com closed_at não nulo encontrada - será ignorada`);
        return false;
      }
      return true;
    });

    if (validPositions.length !== positions.length) {
      this.logger.warn(`[SL-TP-MONITOR-REAL] ${positions.length - validPositions.length} posição(ões) inválida(s) filtrada(s)`);
    }

    const tradeJobService = new TradeJobService(this.prisma);
    const positionService = new PositionService(this.prisma);
    let triggered = 0;
    let retried = 0;

    // Primeiro, verificar posições com flags triggered mas sem job válido (retry)
    // IMPORTANTE: Apenas posições abertas devem ser verificadas
    const positionsWithTriggeredFlags = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: PositionStatus.OPEN, // Apenas posições abertas
        qty_remaining: { gt: 0 }, // Apenas posições com quantidade restante
        closed_at: null, // Garantir que não há data de fechamento
        OR: [
          { sl_triggered: true },
          { tp_triggered: true },
          { trailing_triggered: true },
        ],
      },
      include: {
        exchange_account: true,
        close_jobs: {
          where: {
            side: 'SELL',
            status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] },
          },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    // Tentar criar jobs para posições com flags triggered mas sem job válido
    for (const position of positionsWithTriggeredFlags) {
      try {
        // Verificar se já existe um job válido (PENDING, EXECUTING ou PARTIALLY_FILLED)
        const hasValidJob = position.close_jobs.length > 0;
        
        if (!hasValidJob) {
          // Não tem job válido, tentar criar novamente
          let shouldRetry = false;
          let limitPrice = 0;
          let triggerType: 'SL' | 'TP' | 'TRAILING' | null = null;

          if (position.sl_triggered && position.sl_enabled && position.sl_pct) {
            shouldRetry = true;
            triggerType = 'SL';
            const slPct = position.sl_pct.toNumber();
            limitPrice = position.price_open.toNumber() * (1 - slPct / 100);
          } else if (position.tp_triggered && position.tp_enabled && position.tp_pct) {
            shouldRetry = true;
            triggerType = 'TP';
            const tpPct = position.tp_pct.toNumber();
            limitPrice = position.price_open.toNumber() * (1 + tpPct / 100);
          } else if (position.trailing_triggered && position.trailing_enabled && position.trailing_distance_pct && position.trailing_max_price) {
            shouldRetry = true;
            triggerType = 'TRAILING';
            const trailingDistance = position.trailing_distance_pct.toNumber();
            limitPrice = position.trailing_max_price.toNumber() * (1 - trailingDistance / 100);
          }

          if (shouldRetry && limitPrice > 0) {
            this.logger.warn(`[SL-TP-MONITOR-REAL] Posição ${position.id} tem flag ${triggerType}_triggered=true mas sem job válido. Tentando criar novamente...`);
            
            try {
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: position.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id,
                skipParameterValidation: true,
                createdBy: 'SLTP_MONITOR',
              });

              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 1,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] ${triggerType} - Job recriado: ID=${tradeJob.id} para posição ${position.id}`);
              retried++;
            } catch (retryError: any) {
              this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao recriar job para posição ${position.id} (${triggerType}): ${retryError.message}`);
            }
          }
        }
      } catch (error: any) {
        this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao verificar retry para posição ${position.id}: ${error.message}`);
      }
    }

    // Processar apenas posições válidas (abertas)
    for (const position of validPositions) {
      try {
        // Get API keys for read-only price check
        const accountService = new (await import('@mvcashnode/domain')).ExchangeAccountService(
          this.prisma,
          this.encryptionService
        );
        const keys = await accountService.decryptApiKeys(position.exchange_account_id);

        if (!keys) continue;

        // Create read-only adapter
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: position.exchange_account.testnet }
        );

        // Get current price - verificar cache primeiro
        const exchange = position.exchange_account.exchange;
        const cacheKey = `price:${exchange}:${position.symbol}`;
        let currentPrice: number | null = null;

        // Tentar buscar do cache primeiro
        const cachedPrice = await this.cacheService.get<number>(cacheKey);
        if (cachedPrice !== null && cachedPrice > 0) {
          currentPrice = cachedPrice;
          this.logger.debug(`[SL-TP-MONITOR-REAL] Preço de ${position.symbol} obtido do cache: ${currentPrice}`);
        } else {
          // Se não estiver no cache, buscar da exchange e adicionar ao cache
          try {
            const ticker = await adapter.fetchTicker(position.symbol);
            currentPrice = ticker.last;
            if (currentPrice && currentPrice > 0) {
              // Armazenar no cache com TTL de 25 segundos
              await this.cacheService.set(cacheKey, currentPrice, { ttl: 25 });
              this.logger.debug(`[SL-TP-MONITOR-REAL] Preço de ${position.symbol} obtido da exchange e armazenado no cache: ${currentPrice}`);
            }
          } catch (error: any) {
            this.logger.warn(`[SL-TP-MONITOR-REAL] Erro ao buscar preço para ${position.symbol} na ${exchange}: ${error.message}`);
            // Continuar para próxima posição se não conseguir buscar preço
            continue;
          }
        }

        if (!currentPrice || currentPrice <= 0) {
          this.logger.warn(`[SL-TP-MONITOR-REAL] Preço inválido para posição ${position.id}: ${currentPrice}`);
          continue;
        }
        const priceOpen = position.price_open.toNumber();
        const pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;

        // Check Stop Loss
        if (position.sl_enabled && position.sl_pct && pnlPct <= -position.sl_pct.toNumber()) {
          if (!position.sl_triggered) {
            // ✅ LOCK OTIMISTA: Tentar marcar sl_triggered = true atomicamente
            // Só marca se ainda estiver false, prevenindo race conditions
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                sl_triggered: false, // ← Condição crítica para prevenir duplicatas
              },
              data: { sl_triggered: true },
            });

            if (lockResult.count === 0) {
              // Outra execução já marcou, pular esta posição
              this.logger.debug(`[SL-TP-MONITOR-REAL] Posição ${position.id} já foi processada por outra execução (SL)`);
              continue;
            }

            // ✅ Conseguimos o lock! Agora verificar se já existe job
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                status: {
                  in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING'],
                },
              },
              select: { id: true, status: true },
            });

            if (existingJob) {
              this.logger.warn(
                `[SL-TP-MONITOR-REAL] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}, flag já está marcada`
              );
              continue; // Flag já está marcada, não reverter
            }

            try {
              // Calcular preço LIMIT para Stop Loss: price_open * (1 - sl_pct / 100)
              const slPct = position.sl_pct.toNumber();
              const limitPrice = priceOpen * (1 - slPct / 100);
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: position.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id, // Vincular posição específica
                skipParameterValidation: true,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Stop Loss - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

              // Enfileirar job para execução
              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 1,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Stop Loss - Job ${tradeJob.id} enfileirado na fila trade-execution-real`);
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao criar job de Stop Loss para posição ${position.id}: ${error.message}`);
              // ✅ Reverter flag se falhou ao criar/enfileirar job
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sl_triggered: false },
              });
              this.logger.warn(`[SL-TP-MONITOR-REAL] Flag sl_triggered revertida para posição ${position.id}`);
            }
          }
        }

        // Check Take Profit
        if (position.tp_enabled && position.tp_pct && pnlPct >= position.tp_pct.toNumber()) {
          if (!position.tp_triggered) {
            // ✅ LOCK OTIMISTA: Tentar marcar tp_triggered = true atomicamente
            // Só marca se ainda estiver false, prevenindo race conditions
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                tp_triggered: false, // ← Condição crítica para prevenir duplicatas
              },
              data: { tp_triggered: true },
            });

            if (lockResult.count === 0) {
              // Outra execução já marcou, pular esta posição
              this.logger.debug(`[SL-TP-MONITOR-REAL] Posição ${position.id} já foi processada por outra execução (TP)`);
              continue;
            }

            // ✅ Conseguimos o lock! Agora verificar se já existe job
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                status: {
                  in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING'],
                },
              },
              select: { id: true, status: true },
            });

            if (existingJob) {
              this.logger.warn(
                `[SL-TP-MONITOR-REAL] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}, flag já está marcada`
              );
              continue; // Flag já está marcada, não reverter
            }

            try {
              // Calcular preço LIMIT para Take Profit: price_open * (1 + tp_pct / 100)
              const tpPct = position.tp_pct.toNumber();
              const limitPrice = priceOpen * (1 + tpPct / 100);
              
              // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
              // Usa o limitPrice calculado para validação
              const validationResult = await positionService.validateMinProfit(
                position.id,
                limitPrice // Passar o preço calculado para validação
              );

              if (!validationResult.valid) {
                console.warn(`[SL-TP-MONITOR-REAL] ⚠️ Take Profit SKIPADO para posição ${position.id}: ${validationResult.reason}`);
                // Reverter flag pois não vamos criar o job
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { tp_triggered: false },
                });
                continue;
              }
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: position.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id, // Vincular posição específica
                skipParameterValidation: true,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Take Profit - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

              // Enfileirar job para execução
              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 1,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Take Profit - Job ${tradeJob.id} enfileirado na fila trade-execution-real`);
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao criar job de Take Profit para posição ${position.id}: ${error.message}`);
              // ✅ Reverter flag se falhou ao criar/enfileirar job
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tp_triggered: false },
              });
              this.logger.warn(`[SL-TP-MONITOR-REAL] Flag tp_triggered revertida para posição ${position.id}`);
            }
          }
        }

        // Check Trailing Stop
        if (position.trailing_enabled && position.trailing_distance_pct) {
          let trailingMaxPrice = position.trailing_max_price?.toNumber() || priceOpen;

          if (currentPrice > trailingMaxPrice) {
            trailingMaxPrice = currentPrice;
            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { trailing_max_price: trailingMaxPrice },
            });
          }

          const trailingDistance = position.trailing_distance_pct.toNumber();
          const trailingTriggerPrice = trailingMaxPrice * (1 - trailingDistance / 100);

          if (currentPrice <= trailingTriggerPrice && !position.trailing_triggered) {
            try {
              // Calcular preço LIMIT para Trailing Stop: usar trailingTriggerPrice
              const limitPrice = trailingTriggerPrice;
              
              // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
              // Usa o limitPrice calculado para validar
              const validationResult = await positionService.validateMinProfit(
                position.id,
                limitPrice // Passar o preço calculado para validação
              );

              if (!validationResult.valid) {
                console.warn(`[SL-TP-MONITOR-REAL] ⚠️ Trailing Stop SKIPADO para posição ${position.id}: ${validationResult.reason}`);
                // Não criar o job de venda
                continue;
              }
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: position.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id, // Vincular posição específica
                skipParameterValidation: true,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Trailing Stop - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

              // Enfileirar job para execução
              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 1,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Trailing Stop - Job ${tradeJob.id} enfileirado na fila trade-execution-real`);

              // Só marcar flag como true se job foi criado e enfileirado com sucesso
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { trailing_triggered: true },
              });
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao criar job de Trailing Stop para posição ${position.id}: ${error.message}`);
              // Não marcar flag se houver erro - permitirá tentar novamente no próximo ciclo
            }
          }
        }
      } catch (error) {
        console.error(`Error processing position ${position.id}:`, error);
      }
    }

    const result = { positionsChecked: positions.length, triggered, retried };
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[SL-TP-MONITOR-REAL] Monitoramento concluído com sucesso. ` +
      `Posições verificadas: ${positions.length}, Triggers acionados: ${triggered}, Jobs recriados: ${retried}, Duração: ${durationMs}ms`
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
      `[SL-TP-MONITOR-REAL] Erro ao monitorar SL/TP: ${errorMessage}`,
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

