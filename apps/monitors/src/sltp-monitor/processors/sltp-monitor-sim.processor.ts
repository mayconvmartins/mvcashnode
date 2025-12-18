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
        // ✅ OTIMIZAÇÃO CPU: TTL aumentado para 35s
        await this.cacheService.set(cacheKey, currentPrice, { ttl: 35 });
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
          { tsg_enabled: true },
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
          { sg_triggered: true },
          { tsg_triggered: true },
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
            if (position.sg_triggered) {
              updateData.sg_triggered = false;
            }
            if (position.tsg_triggered) {
              updateData.tsg_triggered = false;
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
          let triggerType: 'SL' | 'TP' | 'TRAILING' | 'SG' | 'TSG' | null = null;

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
          // 1.5 Validar Condição de Stop Gain
          else if (position.sg_triggered && position.sg_enabled && position.sg_pct && position.sg_drop_pct && position.tp_pct) {
            const sgPct = position.sg_pct.toNumber();
            const sgDropPct = position.sg_drop_pct.toNumber();
            const tpPct = position.tp_pct.toNumber();
            const sellThreshold = sgPct - sgDropPct;
            
            // Verificar se SG ainda é válido (deve estar ativado e abaixo do threshold)
            if (!position.sg_activated) {
              // SG não foi ativado ainda, resetar flag
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sg_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag sg_triggered resetada para posição ${position.id}: ` +
                `SG não foi ativado ainda (requer PnL >= ${sgPct}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue;
            }
            
            // Se preço voltou acima do threshold, resetar flag
            if (pnlPct > sellThreshold) {
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sg_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag sg_triggered resetada para posição ${position.id}: ` +
                `preço voltou acima do threshold (${sellThreshold.toFixed(2)}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue;
            }
            
            // Se preço caiu muito abaixo (mais de 2x o threshold), resetar flag pois não é mais viável
            const minViableThreshold = sellThreshold - (sgDropPct * 2);
            if (pnlPct < minViableThreshold) {
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sg_triggered: false, sg_activated: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag sg_triggered resetada para posição ${position.id}: ` +
                `preço caiu muito abaixo do threshold viável (${minViableThreshold.toFixed(2)}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue;
            }
            
            shouldRetry = true;
            triggerType = 'SG';
            limitPrice = currentPrice * 0.999; // 0.1% abaixo do preço atual
          }
          // 1.6 Validar Condição de Trailing Stop Gain
          else if (position.tsg_triggered && position.tsg_enabled && position.tsg_activation_pct && position.tsg_drop_pct) {
            const tsgActivationPct = position.tsg_activation_pct.toNumber();
            const tsgDropPct = position.tsg_drop_pct.toNumber();
            
            // Verificar se TSG ainda é válido
            if (!position.tsg_activated) {
              // TSG não foi ativado ainda, resetar flag
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tsg_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag tsg_triggered resetada para posição ${position.id}: ` +
                `TSG não foi ativado ainda (requer PnL >= ${tsgActivationPct}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue;
            }
            
            // Verificar se ainda está na condição de venda (abaixo do pico - drop)
            const currentMax = position.tsg_max_pnl_pct?.toNumber() || tsgActivationPct;
            const sellThreshold = currentMax - tsgDropPct;
            
            // Se preço voltou acima do threshold, resetar flag
            if (pnlPct > sellThreshold) {
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tsg_triggered: false },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag tsg_triggered resetada para posição ${position.id}: ` +
                `preço voltou acima do threshold (${sellThreshold.toFixed(2)}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue;
            }
            
            // Se preço caiu muito abaixo (mais de 2x o drop), resetar flag pois não é mais viável
            const minViableThreshold = sellThreshold - (tsgDropPct * 2);
            if (pnlPct < minViableThreshold) {
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tsg_triggered: false, tsg_activated: false, tsg_max_pnl_pct: null },
              });
              this.logger.warn(
                `[SL-TP-MONITOR-SIM] Flag tsg_triggered resetada para posição ${position.id}: ` +
                `preço caiu muito abaixo do threshold viável (${minViableThreshold.toFixed(2)}%, atual: ${pnlPct.toFixed(2)}%)`
              );
              continue;
            }
            
            shouldRetry = true;
            triggerType = 'TSG';
            limitPrice = currentPrice * 0.999; // 0.1% abaixo do preço atual
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

    // ✅ OTIMIZAÇÃO CPU: Batch processing - agrupar posições por exchange
    // Agrupar por exchange para reutilizar adapters
    const positionsByExchange = new Map<string, typeof validPositions>();
    for (const position of validPositions) {
      const exchange = position.exchange_account.exchange;
      if (!positionsByExchange.has(exchange)) {
        positionsByExchange.set(exchange, []);
      }
      positionsByExchange.get(exchange)!.push(position);
    }

    // Processar cada grupo de posições por exchange com adapter reutilizado
    for (const [exchange, exchangePositions] of positionsByExchange.entries()) {
      try {
        // Criar adapter uma vez por exchange (simulation não precisa de API keys)
        const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);

        // Processar todas as posições desta exchange
        for (const position of exchangePositions) {
      try {

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
              // ✅ OTIMIZAÇÃO CPU: TTL aumentado para 35s
              await this.cacheService.set(cacheKey, currentPrice, { ttl: 35 });
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

        // === STOP GAIN - Lógica Corrigida ===
        // Funciona como trailing stop: ativa em sg_pct, vende se cair para (sg_pct - sg_drop_pct)
        if (position.tp_enabled && position.sg_enabled && 
            position.sg_pct && position.sg_drop_pct && position.tp_pct &&
            !position.tp_triggered) {
          
          // Se sg_triggered está true mas não há job válido, verificar se ainda é viável
          if (position.sg_triggered) {
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] },
              },
            });
            
            if (!existingJob) {
              // Não há job válido, verificar se ainda é viável vender
              const sgPct = position.sg_pct.toNumber();
              const sgDropPct = position.sg_drop_pct.toNumber();
              const sellThreshold = sgPct - sgDropPct;
              const minViableThreshold = sellThreshold - (sgDropPct * 2);
              
              // Se preço caiu muito abaixo ou voltou acima, resetar flags
              if (pnlPct > sellThreshold || pnlPct < minViableThreshold) {
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { 
                    sg_triggered: false,
                    ...(pnlPct < minViableThreshold ? { sg_activated: false } : {})
                  },
                });
                this.logger.warn(
                  `[SL-TP-MONITOR-SIM] Flag sg_triggered resetada para posição ${position.id}: ` +
                  `preço não está mais viável (${pnlPct.toFixed(2)}%, threshold: ${sellThreshold.toFixed(2)}%)`
                );
                continue;
              }
            }
            continue; // Já está triggered, não processar novamente
          }
          
          const sgPct = position.sg_pct.toNumber();
          const sgDropPct = position.sg_drop_pct.toNumber();
          const tpPct = position.tp_pct.toNumber();
          const sellThreshold = sgPct - sgDropPct; // Ex: 2% - 0.5% = 1.5%
          
          // Etapa 1: Ativar Stop Gain quando atingir threshold
          if (!position.sg_activated && pnlPct >= sgPct) {
            await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                sg_activated: false,
              },
              data: { sg_activated: true },
            });
            
            this.logger.log(
              `[SL-TP-MONITOR-SIM] 🎯 Stop Gain ATIVADO para posição ${position.id} (${position.symbol}) - ` +
              `Atingiu ${pnlPct.toFixed(2)}% (threshold: ${sgPct}%)`
            );
          }
          
          // Etapa 2: Verificar se deve vender (já ativado + caiu abaixo do threshold)
          if (position.sg_activated && pnlPct <= sellThreshold && pnlPct < tpPct) {
            // Lock otimista
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                sg_triggered: false,
              },
              data: { sg_triggered: true },
            });
            
            if (lockResult.count === 0) {
              this.logger.debug(`[SL-TP-MONITOR-SIM] Posição ${position.id} já processada (SG)`);
              continue;
            }
            
            // Verificar job existente
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING'] },
              },
            });
            
            if (existingJob) {
              this.logger.warn(`[SL-TP-MONITOR-SIM] Job ${existingJob.id} já existe para posição ${position.id}`);
              continue;
            }
            
            try {
              // REVALIDAÇÃO: Verificar novamente se o preço ainda está na condição de venda
              // (preço pode ter mudado entre o lock e agora)
              const currentPnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
              
              if (currentPnlPct > sellThreshold) {
                this.logger.debug(
                  `[SL-TP-MONITOR-SIM] Stop Gain cancelado - preço recuperou: ${currentPnlPct.toFixed(2)}% > ${sellThreshold.toFixed(2)}%`
                );
                // Reverter flag pois preço voltou a subir
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { sg_triggered: false },
                });
                continue;
              }
              
              // Calcular preço LIMIT (preço atual ou ligeiramente abaixo para garantir execução)
              const limitPrice = currentPrice * 0.999; // 0.1% abaixo
              
              // Stop Gain NÃO valida min_profit_pct pois já foi ativado em um lucro maior
              // e deve proteger os lucros obtidos mesmo que caiam abaixo do mínimo configurado
              
              // Criar job de venda
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
                createdBy: 'STOP_GAIN',
              });
              
              // Enfileirar
              await this.tradeExecutionQueue.add(
                'execute-trade',
                { tradeJobId: tradeJob.id },
                { jobId: `trade-job-${tradeJob.id}`, attempts: 3 }
              );
              
              this.logger.log(
                `[SL-TP-MONITOR-SIM] 🎯 Stop Gain VENDIDO - Posição ${position.id} (${position.symbol}), ` +
                `PnL atual: ${pnlPct.toFixed(2)}%, Threshold venda: ${sellThreshold.toFixed(2)}%, Job: ${tradeJob.id}`
              );
              
              triggered++;
            } catch (error: any) {
              this.logger.error(
                `[SL-TP-MONITOR-SIM] Erro ao criar job Stop Gain: ${error.message}`
              );
              
              // Reverter flag
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sg_triggered: false },
              });
            }
          }
        }

        // === TRAILING STOP GAIN ===
        // TSG é independente de TP - funciona sozinho
        if (position.tsg_enabled && 
            position.tsg_activation_pct && 
            position.tsg_drop_pct) {
          
          // Se tsg_triggered está true mas não há job válido, verificar se ainda é viável
          if (position.tsg_triggered) {
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] },
              },
            });
            
            if (!existingJob) {
              // Não há job válido, verificar se ainda é viável vender
              const tsgActivationPct = position.tsg_activation_pct.toNumber();
              const tsgDropPct = position.tsg_drop_pct.toNumber();
              const currentMax = position.tsg_max_pnl_pct?.toNumber() || tsgActivationPct;
              const sellThreshold = currentMax - tsgDropPct;
              const minViableThreshold = sellThreshold - (tsgDropPct * 2);
              
              // Se preço caiu muito abaixo ou voltou acima, resetar flags
              if (pnlPct > sellThreshold || pnlPct < minViableThreshold) {
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { 
                    tsg_triggered: false,
                    ...(pnlPct < minViableThreshold ? { tsg_activated: false, tsg_max_pnl_pct: null } : {})
                  },
                });
                this.logger.warn(
                  `[SL-TP-MONITOR-SIM] Flag tsg_triggered resetada para posição ${position.id}: ` +
                  `preço não está mais viável (${pnlPct.toFixed(2)}%, threshold: ${sellThreshold.toFixed(2)}%)`
                );
                continue;
              }
            }
            continue; // Já está triggered, não processar novamente
          }
          
          const tsgActivationPct = position.tsg_activation_pct.toNumber();
          const tsgDropPct = position.tsg_drop_pct.toNumber();
          
          // Etapa 1: Ativar TSG quando atingir threshold de ativação
          if (!position.tsg_activated && pnlPct >= tsgActivationPct) {
            await this.prisma.tradePosition.updateMany({
              where: { id: position.id, tsg_activated: false },
              data: { 
                tsg_activated: true,
                tsg_max_pnl_pct: pnlPct // Inicializar pico com lucro atual
              }
            });
            this.logger.log(
              `[SL-TP-MONITOR-SIM] [TSG] 🎯 ATIVADO para posição ${position.id} (${position.symbol}) - ` +
              `Lucro atingiu ${pnlPct.toFixed(2)}% (threshold: ${tsgActivationPct}%)`
            );
          }
          
          // Etapa 2: Atualizar pico máximo se lucro subiu (após ativação)
          if (position.tsg_activated) {
            const currentMax = position.tsg_max_pnl_pct?.toNumber() || tsgActivationPct;
            
            if (pnlPct > currentMax) {
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { tsg_max_pnl_pct: pnlPct }
              });
              this.logger.log(
                `[SL-TP-MONITOR-SIM] [TSG] 📈 NOVO PICO para posição ${position.id} (${position.symbol}) - ` +
                `${pnlPct.toFixed(2)}% (anterior: ${currentMax.toFixed(2)}%)`
              );
            }
            
            // Etapa 3: Verificar se deve vender (caiu X% do pico)
            const sellThreshold = currentMax - tsgDropPct;
            
            // Só vende se caiu abaixo do threshold
            if (pnlPct <= sellThreshold) {
              // Lock otimista para prevenir duplicatas
              const lockResult = await this.prisma.tradePosition.updateMany({
                where: { id: position.id, tsg_triggered: false },
                data: { tsg_triggered: true }
              });
              
              if (lockResult.count === 0) {
                // Outro processo já pegou o lock
                continue;
              }
              
              // Verificar se já existe job pendente
              const existingJob = await this.prisma.tradeJob.findFirst({
                where: {
                  position_id_to_close: position.id,
                  status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING'] }
                }
              });
              
              if (existingJob) {
                this.logger.warn(
                  `[SL-TP-MONITOR-SIM] [TSG] Job ${existingJob.id} (${existingJob.status}) já existe para posição ${position.id}`
                );
                continue;
              }
              
              try {
                // REVALIDAÇÃO: Verificar novamente se o preço ainda está na condição de venda
                const currentPnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
                
                if (currentPnlPct > sellThreshold) {
                  this.logger.debug(
                    `[SL-TP-MONITOR-SIM] [TSG] Cancelado - preço recuperou: ${currentPnlPct.toFixed(2)}% > ${sellThreshold.toFixed(2)}%`
                  );
                  // Reverter flag pois preço voltou a subir
                  await this.prisma.tradePosition.update({
                    where: { id: position.id },
                    data: { tsg_triggered: false }
                  });
                  continue;
                }
                
                // IMPORTANTE: Calcular preço LIMIT com pequeno spread para garantir execução
                const limitPrice = currentPrice * 0.999;
                
                this.logger.log(
                  `[SL-TP-MONITOR-SIM] [TSG] 💰 Criando ordem LIMIT de venda - Posição ${position.id} ` +
                  `Lucro atual: ${pnlPct.toFixed(2)}%, Pico: ${currentMax.toFixed(2)}%, ` +
                  `Threshold: ${sellThreshold.toFixed(2)}%, Preço: ${limitPrice}`
                );
                
                const tradeJob = await tradeJobService.createJob({
                  exchangeAccountId: position.exchange_account_id,
                  tradeMode: TradeMode.SIMULATION,
                  symbol: position.symbol,
                  side: 'SELL',
                  orderType: 'LIMIT', // ✅ SEMPRE LIMIT
                  baseQuantity: position.qty_remaining.toNumber(),
                  limitPrice, // ✅ Preço calculado com spread
                  positionIdToClose: position.id,
                  skipParameterValidation: true,
                  createdBy: 'TRAILING_STOP_GAIN'
                });
                
                this.logger.log(
                  `[SL-TP-MONITOR-SIM] [TSG] Job criado: ID=${tradeJob.id}, status=${tradeJob.status}, ` +
                  `symbol=${position.symbol}, side=SELL, orderType=LIMIT, ` +
                  `baseQuantity=${position.qty_remaining.toNumber()}, limitPrice=${limitPrice}`
                );
                
                // Enfileirar job para execução
                await this.tradeExecutionQueue.add(
                  'execute-trade', 
                  { tradeJobId: tradeJob.id },
                  {
                    jobId: `trade-job-${tradeJob.id}`,
                    attempts: 3,
                    removeOnComplete: true,
                    removeOnFail: { age: 3600 }
                  }
                );
                
                this.logger.log(
                  `[SL-TP-MONITOR-SIM] [TSG] ✅ Venda enfileirada - Job ${tradeJob.id} na fila trade-execution-sim`
                );
                
                triggered++;
              } catch (error: any) {
                this.logger.error(
                  `[SL-TP-MONITOR-SIM] [TSG] ❌ Erro ao criar job de venda para posição ${position.id}: ${error.message}`
                );
                
                // Reverter flag se falhou
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { tsg_triggered: false }
                });
                
                this.logger.warn(`[SL-TP-MONITOR-SIM] [TSG] Flag tsg_triggered revertida para posição ${position.id}`);
              }
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
        } // Fim do loop de posições da exchange
      } catch (exchangeError: any) {
        this.logger.error(`[SL-TP-MONITOR-SIM] Erro ao processar exchange ${exchange}: ${exchangeError.message}`);
      }
    } // Fim do loop de exchanges

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

