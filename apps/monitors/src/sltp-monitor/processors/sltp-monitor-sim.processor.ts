import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { TradeJobService, PositionService } from '@mvcashnode/domain';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, PositionStatus, TradeMode, CacheService } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('sl-tp-monitor-sim')
export class SLTPMonitorSimProcessor extends WorkerHost {
  private readonly logger = new Logger(SLTPMonitorSimProcessor.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('trade-execution-sim') private tradeExecutionQueue: Queue,
    private cronExecutionService: CronExecutionService,
    private cacheService: CacheService
  ) {
    super();
  }

  private async getCurrentPrice(
    symbol: string,
    exchange: string
  ): Promise<number | null> {
    // Verificar cache primeiro
    const cacheKey = `price:${exchange}:${symbol}`;
    const cachedPrice = await this.cacheService.get<number>(cacheKey);
    if (cachedPrice !== null && cachedPrice > 0) {
      return cachedPrice;
    }

    // Buscar da exchange (simulação não precisa de API keys)
    try {
      const adapter = AdapterFactory.createAdapter(
        exchange as ExchangeType
      );

      const ticker = await adapter.fetchTicker(symbol);
      const currentPrice = ticker.last;
      
      if (currentPrice && currentPrice > 0) {
        await this.cacheService.set(cacheKey, currentPrice, { ttl: 25 });
      }
      
      return currentPrice;
    } catch (error: any) {
      this.logger.warn(`[SL-TP-MONITOR-SIM] Erro ao buscar preço para ${symbol}: ${error.message}`);
      return null;
    }
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'sl-tp-monitor-sim';
    this.logger.log('[SL-TP-MONITOR-SIM] Iniciando monitoramento de SL/TP...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
    // Get all open positions with SL/TP enabled (SIMULATION)
    // IMPORTANTE: Monitor SL/TP deve processar APENAS posições abertas
    // Posições fechadas não devem ser monitoradas pois não faz sentido e pode causar problemas
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.SIMULATION,
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
        this.logger.warn(`[SL-TP-MONITOR-SIM] ⚠️ Posição ${position.id} com status ${position.status} encontrada - será ignorada`);
        return false;
      }
      if (position.qty_remaining.toNumber() <= 0) {
        this.logger.warn(`[SL-TP-MONITOR-SIM] ⚠️ Posição ${position.id} com qty_remaining <= 0 encontrada - será ignorada`);
        return false;
      }
      if (position.closed_at !== null) {
        this.logger.warn(`[SL-TP-MONITOR-SIM] ⚠️ Posição ${position.id} com closed_at não nulo encontrada - será ignorada`);
        return false;
      }
      return true;
    });

    if (validPositions.length !== positions.length) {
      this.logger.warn(`[SL-TP-MONITOR-SIM] ${positions.length - validPositions.length} posição(ões) inválida(s) filtrada(s)`);
    }

    const tradeJobService = new TradeJobService(this.prisma);
    const positionService = new PositionService(this.prisma);
    let triggered = 0;
    let retried = 0;

    // Primeiro, verificar posições com flags triggered mas sem job válido (retry)
    // IMPORTANTE: Apenas posições abertas devem ser verificadas
    const positionsWithTriggeredFlags = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.SIMULATION,
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
          // 1.5 Detectar Cancelamento Manual e Resetar Flags
          // Verificar se existe job cancelado recentemente (últimas 24h)
          const cancelledJob = await this.prisma.tradeJob.findFirst({
            where: {
              position_id_to_close: position.id,
              side: 'SELL',
              status: 'CANCELLED',
              created_at: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
              },
            },
            orderBy: {
              created_at: 'desc',
            },
          });

          if (cancelledJob) {
            // Resetar a flag correspondente ao tipo de trigger
            const updateData: any = {};
            
            if (position.sl_triggered) {
              updateData.sl_triggered = false;
            }
            if (position.tp_triggered) {
              updateData.tp_triggered = false;
            }
            if (position.trailing_triggered) {
              updateData.trailing_triggered = false;
            }
            
            if (Object.keys(updateData).length > 0) {
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: updateData,
              });
              
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flags resetadas para posição ${position.id}: ` +
                `job #${cancelledJob.id} foi cancelado manualmente em ${cancelledJob.updated_at}. ` +
                `Flags resetadas: ${Object.keys(updateData).join(', ')}`
              );
            }
            continue; // Não recriar job
          }

          // Buscar preço atual para validação
          const currentPrice = await this.getCurrentPrice(
            position.symbol,
            position.exchange_account.exchange
          );

          if (!currentPrice || currentPrice <= 0) {
            this.logger.warn(`[SL-TP-MONITOR-SIM] Não foi possível obter preço atual para posição ${position.id}, pulando retry`);
            continue;
          }

          const priceOpen = position.price_open.toNumber();
          const pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;

          // Não tem job válido, validar condições antes de tentar criar novamente
          let shouldRetry = false;
          let limitPrice = 0;
          let triggerType: 'SL' | 'TP' | 'TRAILING' | null = null;

          // 1.3 Validar Condição de Stop Loss
          if (position.sl_triggered && position.sl_enabled && position.sl_pct) {
            // Verificar se SL ainda é válido
            if (pnlPct > -position.sl_pct.toNumber()) {
              // Condição não mais atendida, resetar flag
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sl_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag sl_triggered resetada para posição ${position.id}: ` +
                `preço atual ${currentPrice} não atende mais SL (requer PnL <= -${position.sl_pct.toNumber()}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue; // Não criar job
            }
            shouldRetry = true;
            triggerType = 'SL';
            const slPct = position.sl_pct.toNumber();
            limitPrice = priceOpen * (1 - slPct / 100);
          }
          // 1.2 Validar Condição de Take Profit
          else if (position.tp_triggered && position.tp_enabled && position.tp_pct) {
            // Verificar se TP ainda é válido
            if (pnlPct < position.tp_pct.toNumber()) {
              // Condição não mais atendida, resetar flag
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tp_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag tp_triggered resetada para posição ${position.id}: ` +
                `preço atual ${currentPrice} não atende mais TP (requer PnL >= ${position.tp_pct.toNumber()}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue; // Não criar job
            }
            shouldRetry = true;
            triggerType = 'TP';
            const tpPct = position.tp_pct.toNumber();
            limitPrice = priceOpen * (1 + tpPct / 100);
          }
          // 1.4 Validar e Atualizar Trailing Stop
          else if (position.trailing_triggered && position.trailing_enabled && position.trailing_distance_pct) {
            // Atualizar trailing_max_price se preço subiu
            let trailingMaxPrice = position.trailing_max_price?.toNumber() || priceOpen;
            if (currentPrice > trailingMaxPrice) {
              trailingMaxPrice = currentPrice;
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { 
                  trailing_max_price: trailingMaxPrice,
                  trailing_triggered: false, // Resetar pois preço subiu novamente
                },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Trailing stop resetado para posição ${position.id}: ` +
                `preço subiu para ${currentPrice}, novo max: ${trailingMaxPrice}`
              );
              continue; // Não criar job
            }

            // Verificar se ainda está abaixo do trigger
            const trailingDistance = position.trailing_distance_pct.toNumber();
            const trailingTriggerPrice = trailingMaxPrice * (1 - trailingDistance / 100);
            if (currentPrice > trailingTriggerPrice) {
              // Não está mais na zona de trigger
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { trailing_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag trailing_triggered resetada para posição ${position.id}: ` +
                `preço ${currentPrice} acima do trigger ${trailingTriggerPrice}`
              );
              continue; // Não criar job
            }

            shouldRetry = true;
            triggerType = 'TRAILING';
            limitPrice = trailingTriggerPrice;
          }

          if (shouldRetry && limitPrice > 0) {
            this.logger.warn(`[SL-TP-MONITOR-SIM] Posição ${position.id} tem flag ${triggerType}_triggered=true mas sem job válido. Tentando criar novamente...`);
            
            try {
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.SIMULATION,
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
                attempts: 3,
              });

              this.logger.log(`[SL-TP-MONITOR-SIM] ${triggerType} - Job recriado: ID=${tradeJob.id} para posição ${position.id}`);
              retried++;
            } catch (retryError: any) {
              this.logger.error(`[SL-TP-MONITOR-SIM] Erro ao recriar job para posição ${position.id} (${triggerType}): ${retryError.message}`);
            }
          }
        }
      } catch (error: any) {
        this.logger.error(`[SL-TP-MONITOR-SIM] Erro ao verificar retry para posição ${position.id}: ${error.message}`);
      }
    }

    // Processar apenas posições válidas (abertas)
    for (const position of validPositions) {
      try {
        // Create read-only adapter (no API keys needed for simulation)
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );

        // Get current price - verificar cache primeiro
        const exchange = position.exchange_account.exchange;
        const cacheKey = `price:${exchange}:${position.symbol}`;
        let currentPrice: number | null = null;

        // Tentar buscar do cache primeiro
        const cachedPrice = await this.cacheService.get<number>(cacheKey);
        if (cachedPrice !== null && cachedPrice > 0) {
          currentPrice = cachedPrice;
          this.logger.debug(`[SL-TP-MONITOR-SIM] Preço de ${position.symbol} obtido do cache: ${currentPrice}`);
        } else {
          // Se não estiver no cache, buscar da exchange e adicionar ao cache
          try {
            const ticker = await adapter.fetchTicker(position.symbol);
            currentPrice = ticker.last;
            if (currentPrice && currentPrice > 0) {
              // Armazenar no cache com TTL de 25 segundos
              await this.cacheService.set(cacheKey, currentPrice, { ttl: 25 });
              this.logger.debug(`[SL-TP-MONITOR-SIM] Preço de ${position.symbol} obtido da exchange e armazenado no cache: ${currentPrice}`);
            }
          } catch (error: any) {
            this.logger.warn(`[SL-TP-MONITOR-SIM] Erro ao buscar preço para ${position.symbol} na ${exchange}: ${error.message}`);
            // Continuar para próxima posição se não conseguir buscar preço
            continue;
          }
        }

        if (!currentPrice || currentPrice <= 0) {
          this.logger.warn(`[SL-TP-MONITOR-SIM] Preço inválido para posição ${position.id}: ${currentPrice}`);
          continue;
        }
        const priceOpen = position.price_open.toNumber();
        const pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;

        // Check Stop Loss
        if (position.sl_enabled && position.sl_pct && pnlPct <= -position.sl_pct.toNumber()) {
          if (!position.sl_triggered) {
            // ✅ LOCK OTIMISTA: Tentar marcar sl_triggered = true atomicamente
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                sl_triggered: false, // ← Prevenir race conditions
              },
              data: { sl_triggered: true },
            });

            if (lockResult.count === 0) {
              this.logger.debug(`[SL-TP-MONITOR-SIM] Posição ${position.id} já foi processada por outra execução (SL)`);
              continue;
            }

            // Verificar se já existe job
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
                `[SL-TP-MONITOR-SIM] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}, flag já está marcada`
              );
              continue;
            }

            try {
              // Calcular preço LIMIT para Stop Loss: price_open * (1 - sl_pct / 100)
              const slPct = position.sl_pct.toNumber();
              const limitPrice = priceOpen * (1 - slPct / 100);
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.SIMULATION,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: position.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id,
                skipParameterValidation: true,
                createdBy: 'SLTP_MONITOR',
              });

              this.logger.log(`[SL-TP-MONITOR-SIM] Stop Loss - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 3,
              });

              this.logger.log(`[SL-TP-MONITOR-SIM] Stop Loss - Job ${tradeJob.id} enfileirado na fila trade-execution-sim`);
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-SIM] Erro ao criar job de Stop Loss para posição ${position.id}: ${error.message}`);
              // Reverter flag se falhou
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sl_triggered: false },
              });
              this.logger.warn(`[SL-TP-MONITOR-SIM] Flag sl_triggered revertida para posição ${position.id}`);
            }
          }
        }

        // Check Take Profit
        if (position.tp_enabled && position.tp_pct && pnlPct >= position.tp_pct.toNumber()) {
          if (!position.tp_triggered) {
            // ✅ LOCK OTIMISTA: Tentar marcar tp_triggered = true atomicamente
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                tp_triggered: false, // ← Prevenir race conditions
              },
              data: { tp_triggered: true },
            });

            if (lockResult.count === 0) {
              this.logger.debug(`[SL-TP-MONITOR-SIM] Posição ${position.id} já foi processada por outra execução (TP)`);
              continue;
            }

            // Verificar se já existe job
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
                `[SL-TP-MONITOR-SIM] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}, flag já está marcada`
              );
              continue;
            }

            try {
              // Calcular preço LIMIT para Take Profit: price_open * (1 + tp_pct / 100)
              const tpPct = position.tp_pct.toNumber();
              const limitPrice = priceOpen * (1 + tpPct / 100);
              
              // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
              const validationResult = await positionService.validateMinProfit(
                position.id,
                limitPrice
              );

              if (!validationResult.valid) {
                console.warn(`[SL-TP-MONITOR-SIM] ⚠️ Take Profit SKIPADO para posição ${position.id}: ${validationResult.reason}`);
                // Reverter flag pois não vamos criar o job
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { tp_triggered: false },
                });
                continue;
              }
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.SIMULATION,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: position.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id,
                skipParameterValidation: true,
                createdBy: 'SLTP_MONITOR',
              });

              this.logger.log(`[SL-TP-MONITOR-SIM] Take Profit - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 3,
              });

              this.logger.log(`[SL-TP-MONITOR-SIM] Take Profit - Job ${tradeJob.id} enfileirado na fila trade-execution-sim`);
              triggered++;
            } catch (error: any) {
              this.logger.error(`[SL-TP-MONITOR-SIM] Erro ao criar job de Take Profit para posição ${position.id}: ${error.message}`);
              // Reverter flag se falhou
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tp_triggered: false },
              });
              this.logger.warn(`[SL-TP-MONITOR-SIM] Flag tp_triggered revertida para posição ${position.id}`);
            }
          }
        }

        // Check Trailing Stop (similar to real)
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
            // Calcular preço LIMIT para Trailing Stop: usar trailingTriggerPrice
            const limitPrice = trailingTriggerPrice;
            
            // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
            // Usa o limitPrice calculado para validar
            const validationResult = await positionService.validateMinProfit(
              position.id,
              limitPrice // Passar o preço calculado para validação
            );

            if (!validationResult.valid) {
              console.warn(`[SL-TP-MONITOR-SIM] ⚠️ Trailing Stop SKIPADO para posição ${position.id}: ${validationResult.reason}`);
              // Não criar o job de venda
              continue;
            }
            
            const tradeJob = await tradeJobService.createJob({
              exchangeAccountId: position.exchange_account_id,
              tradeMode: TradeMode.SIMULATION,
              symbol: position.symbol,
              side: 'SELL',
              orderType: 'LIMIT',
              baseQuantity: position.qty_remaining.toNumber(),
              limitPrice,
              positionIdToClose: position.id, // Vincular posição específica
              skipParameterValidation: true,
            });

            this.logger.log(`[SL-TP-MONITOR-SIM] Trailing Stop - Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, symbol=${position.symbol}, side=SELL, orderType=LIMIT, baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`);

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

            this.logger.log(`[SL-TP-MONITOR-SIM] Trailing Stop - Job ${tradeJob.id} enfileirado na fila trade-execution-sim`);

            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { trailing_triggered: true },
            });
            triggered++;
          }
        }
      } catch (error) {
        console.error(`Error processing position ${position.id}:`, error);
      }
    }

    const result = { positionsChecked: positions.length, triggered, retried };
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[SL-TP-MONITOR-SIM] Monitoramento concluído com sucesso. ` +
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
      `[SL-TP-MONITOR-SIM] Erro ao monitorar SL/TP: ${errorMessage}`,
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

