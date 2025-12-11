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
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
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

    const tradeJobService = new TradeJobService(this.prisma);
    const positionService = new PositionService(this.prisma);
    let triggered = 0;
    let retried = 0;

    // Primeiro, verificar posições com flags triggered mas sem job válido (retry)
    const positionsWithTriggeredFlags = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
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
            status: { in: ['PENDING', 'EXECUTING', 'PARTIALLY_FILLED'] },
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

    for (const position of positions) {
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
            // ✅ NOVO: Verificar se já existe job PENDING/EXECUTING para essa posição
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
                `[SL-TP-MONITOR-REAL] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}, pulando criação de novo job de SL`
              );
              continue; // Pular esta posição
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

              // Só marcar flag como true se job foi criado e enfileirado com sucesso
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sl_triggered: true },
              });
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao criar job de Stop Loss para posição ${position.id}: ${error.message}`);
              // Não marcar flag se houver erro - permitirá tentar novamente no próximo ciclo
            }
          }
        }

        // Check Take Profit
        if (position.tp_enabled && position.tp_pct && pnlPct >= position.tp_pct.toNumber()) {
          if (!position.tp_triggered) {
            // ✅ NOVO: Verificar se já existe job PENDING/EXECUTING para essa posição
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
                `[SL-TP-MONITOR-REAL] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}, pulando criação de novo job de TP`
              );
              continue; // Pular esta posição
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

              this.logger.log(`[SL-TP-MONITOR-REAL] Take Profit - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

              // Enfileirar job para execução
              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 1,
              });

              this.logger.log(`[SL-TP-MONITOR-REAL] Take Profit - Job ${tradeJob.id} enfileirado na fila trade-execution-real`);

              // Só marcar flag como true se job foi criado e enfileirado com sucesso
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tp_triggered: true },
              });
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao criar job de Take Profit para posição ${position.id}: ${error.message}`);
              // Não marcar flag se houver erro - permitirá tentar novamente no próximo ciclo
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

