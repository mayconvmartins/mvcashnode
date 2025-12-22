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

  // ✅ REMOVIDO: Método getCurrentPrice não é mais necessário após remoção da seção de retry

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'sl-tp-monitor-real';
    this.logger.log('[SL-TP-MONITOR-REAL] Iniciando monitoramento de SL/TP...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
    // ✅ OTIMIZAÇÃO CPU: Select específico para buscar apenas campos necessários
    // IMPORTANTE: Monitor SL/TP deve processar APENAS posições abertas
    // Posições fechadas não devem ser monitoradas pois não faz sentido e pode causar problemas
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.REAL,
        status: PositionStatus.OPEN, // Apenas posições abertas
        qty_remaining: { gt: 0 }, // Apenas posições com quantidade restante
        closed_at: null, // Garantir que não há data de fechamento (camada extra de segurança)
        is_residue_position: false, // Ignorar posições de resíduo consolidadas
        OR: [
          { sl_enabled: true },
          { tp_enabled: true },
          { trailing_enabled: true },
          { tsg_enabled: true },
        ],
      },
      select: {
        id: true,
        symbol: true,
        exchange_account_id: true,
        status: true,
        qty_remaining: true,
        closed_at: true,
        price_open: true,
        sl_enabled: true,
        sl_pct: true,
        sl_triggered: true,
        tp_enabled: true,
        tp_pct: true,
        tp_triggered: true,
        sg_enabled: true,
        sg_pct: true,
        sg_drop_pct: true,
        sg_activated: true,
        sg_triggered: true,
        tsg_enabled: true,
        tsg_activation_pct: true,
        tsg_drop_pct: true,
        tsg_activated: true,
        tsg_max_pnl_pct: true,
        tsg_triggered: true,
        trailing_enabled: true,
        trailing_distance_pct: true,
        trailing_max_price: true,
        trailing_triggered: true,
        exchange_account: {
          select: {
            id: true,
            exchange: true,
            testnet: true,
          },
        },
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

    // ✅ REMOVIDO: Seção de retry que poderia criar ordens duplicadas na Binance
    // Se uma posição tem flag triggered mas não tem job válido, o monitor principal
    // irá detectar e criar o job no próximo ciclo, evitando duplicatas

    // ✅ OTIMIZAÇÃO CPU: Batch processing - agrupar posições por exchange
    // Isso reduz criação de adapters e permite paralelização
    const accountService = new (await import('@mvcashnode/domain')).ExchangeAccountService(
      this.prisma,
      this.encryptionService
    );

    // Agrupar posições por exchange_account_id para reutilizar adapters
    const positionsByAccount = new Map<number, typeof validPositions>();
    for (const position of validPositions) {
      const accountId = position.exchange_account_id;
      if (!positionsByAccount.has(accountId)) {
        positionsByAccount.set(accountId, []);
      }
      positionsByAccount.get(accountId)!.push(position);
    }

    // Processar cada grupo de posições (por account) com adapter reutilizado
    for (const [accountId, accountPositions] of positionsByAccount.entries()) {
      try {
        // Buscar keys uma vez por account
        const keys = await accountService.decryptApiKeys(accountId);
        if (!keys) continue;

        const firstPosition = accountPositions[0];
        // Criar adapter uma vez por exchange account
        const adapter = AdapterFactory.createAdapter(
          firstPosition.exchange_account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: firstPosition.exchange_account.testnet }
        );

        // Processar todas as posições deste account
        for (const position of accountPositions) {
      try {

        // Get current price - verificar cache primeiro
        const exchange = position.exchange_account.exchange;
        const cacheKey = `price:${exchange}:${position.symbol}`;
        let currentPrice: number | null = null;

        // Tentar buscar do cache primeiro
        const cachedPrice = await this.cacheService.get<number>(cacheKey);
        if (cachedPrice !== null && cachedPrice > 0) {
          currentPrice = cachedPrice;
          // ✅ OTIMIZAÇÃO CPU: Debug log removido (economiza I/O)
        } else {
          // Se não estiver no cache, buscar da exchange e adicionar ao cache
          try {
            const ticker = await adapter.fetchTicker(position.symbol);
            currentPrice = ticker.last;
            if (currentPrice && currentPrice > 0) {
              // ✅ OTIMIZAÇÃO CPU: TTL aumentado para 35s
              await this.cacheService.set(cacheKey, currentPrice, { ttl: 35 });
              // ✅ OTIMIZAÇÃO CPU: Debug log removido (economiza I/O)
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
            // ========== ETAPA 1: Verificar job existente ANTES do lock ==========
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { 
                  in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] // ← INCLUIR PARTIALLY_FILLED
                }
              },
              select: { id: true, status: true, order_type: true, base_quantity: true }
            });

            if (existingJob) {
              this.logger.warn(
                `[MONITOR] [DUPLICATE-PREVENTION] Job ${existingJob.id} (${existingJob.status}, ${existingJob.order_type}) ` +
                `já existe para posição ${position.id}, pulando criação. ` +
                `Quantidade: ${existingJob.base_quantity}`
              );
              continue; // ← NÃO fazer lock nem criar job
            }

            // ========== ETAPA 2: Revalidar posição ANTES do lock ==========
            const freshPosition = await this.prisma.tradePosition.findUnique({
              where: { id: position.id },
              select: { 
                qty_remaining: true, 
                status: true,
                symbol: true 
              }
            });

            if (!freshPosition || 
                freshPosition.status !== 'OPEN' || 
                freshPosition.qty_remaining.toNumber() <= 0) {
              this.logger.warn(
                `[MONITOR] [POSITION-VALIDATION] Posição ${position.id} não elegível: ` +
                `status=${freshPosition?.status}, qty=${freshPosition?.qty_remaining.toNumber()}`
              );
              continue;
            }

            // Validar quantidade mínima (evitar tentar vender resíduos)
            const minQtyUSD = 5; // $5 USD mínimo
            const estimatedValueUSD = freshPosition.qty_remaining.toNumber() * currentPrice;
            if (estimatedValueUSD < minQtyUSD) {
              this.logger.warn(
                `[MONITOR] [RESIDUE-SKIP] Posição ${position.id} tem resíduo muito pequeno: ` +
                `${freshPosition.qty_remaining.toNumber()} ${freshPosition.symbol} (~$${estimatedValueUSD.toFixed(2)}). ` +
                `Pulando venda (mínimo: $${minQtyUSD})`
              );
              continue;
            }

            // ========== ETAPA 3: Lock otimista com condições restritas ==========
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: { 
                id: position.id, 
                sl_triggered: false,
                status: 'OPEN',
                qty_remaining: { gt: 0 }
              },
              data: { sl_triggered: true }
            });

            if (lockResult.count === 0) {
              this.logger.warn(
                `[MONITOR] [LOCK-FAILED] Lock falhou para posição ${position.id} ` +
                `(outra execução ou posição mudou)`
              );
              continue;
            }

            // ========== ETAPA 4: Double-check jobs após lock ==========
            const doubleCheckJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] }
              },
              select: { id: true, status: true }
            });

            if (doubleCheckJob) {
              // Reverter lock
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sl_triggered: false }
              });
              this.logger.warn(
                `[MONITOR] [RACE-DETECTED] Job ${doubleCheckJob.id} criado por outro processo ` +
                `durante lock, FLAG REVERTIDA`
              );
              continue;
            }

            // ========== ETAPA 5: Criar job com quantidade validada ==========
            try {
              // Calcular preço LIMIT para Stop Loss
              const limitPrice = currentPrice * 0.999; // 0.1% abaixo do preço atual
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT', // ← SEMPRE LIMIT
                baseQuantity: freshPosition.qty_remaining.toNumber(), // ← Usar qty validada
                limitPrice, // ← OBRIGATÓRIO para LIMIT
                positionIdToClose: position.id, // ← OBRIGATÓRIO
                skipParameterValidation: true,
              });

              this.logger.log(
                `[MONITOR] [JOB-CREATED] STOP_LOSS job criado: ` +
                `ID=${tradeJob.id}, symbol=${position.symbol}, ` +
                `qty=${freshPosition.qty_remaining.toNumber()}, limitPrice=${limitPrice}`
              );

              // Enfileirar job para execução
              await this.tradeExecutionQueue.add(
                'execute-trade',
                { tradeJobId: tradeJob.id },
                {
                  jobId: `trade-job-${tradeJob.id}`,
                  attempts: 1,
                  removeOnComplete: true,
                  removeOnFail: { age: 3600 }
                }
              );

              triggered++;
            } catch (error: any) {
              this.logger.error(
                `[MONITOR] [JOB-CREATION-FAILED] Erro ao criar job para posição ${position.id}: ${error.message}`
              );
              
              // Reverter lock se falhar
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sl_triggered: false }
              });
              
              this.logger.warn(`[MONITOR] [LOCK-REVERTED] Flag sl_triggered revertida para posição ${position.id}`);
            }
          }
        }

        // === TAKE PROFIT - VERIFICAR PRIMEIRO (funciona como teto máximo, mesmo com TSG ativo) ===
        // Quando TP e TSG estão ativos juntos, o TP funciona como "lucro máximo garantido"
        // Se o preço atingir TP% antes do TSG acionar, vende imediatamente
        if (position.tp_enabled && position.tp_pct && !position.tp_triggered) {
          const tpPct = position.tp_pct.toNumber();
          
          if (pnlPct >= tpPct) {
            // ========== ETAPA 1: Verificar job existente ANTES do lock ==========
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { 
                  in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED']
                }
              },
              select: { id: true, status: true, order_type: true, base_quantity: true }
            });

            if (existingJob) {
              this.logger.warn(
                `[MONITOR] [DUPLICATE-PREVENTION] Job ${existingJob.id} (${existingJob.status}, ${existingJob.order_type}) ` +
                `já existe para posição ${position.id}, pulando criação. ` +
                `Quantidade: ${existingJob.base_quantity}`
              );
            } else {
              // ========== ETAPA 2: Revalidar posição ANTES do lock ==========
              const freshPosition = await this.prisma.tradePosition.findUnique({
                where: { id: position.id },
                select: { 
                  qty_remaining: true, 
                  status: true,
                  symbol: true 
                }
              });

              if (freshPosition && 
                  freshPosition.status === 'OPEN' && 
                  freshPosition.qty_remaining.toNumber() > 0) {
                
                // Validar quantidade mínima (evitar tentar vender resíduos)
                const minQtyUSD = 5; // $5 USD mínimo
                const estimatedValueUSD = freshPosition.qty_remaining.toNumber() * currentPrice;
                
                if (estimatedValueUSD >= minQtyUSD) {
                  // ========== ETAPA 3: Lock otimista com condições restritas ==========
                  const lockResult = await this.prisma.tradePosition.updateMany({
                    where: {
                      id: position.id,
                      tp_triggered: false,
                      status: 'OPEN',
                      qty_remaining: { gt: 0 }
                    },
                    data: { tp_triggered: true },
                  });

                  if (lockResult.count > 0) {
                    // ========== ETAPA 4: Double-check jobs após lock ==========
                    const doubleCheckJob = await this.prisma.tradeJob.findFirst({
                      where: {
                        position_id_to_close: position.id,
                        side: 'SELL',
                        status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] }
                      },
                      select: { id: true, status: true }
                    });

                    if (doubleCheckJob) {
                      // Reverter lock
                      await this.prisma.tradePosition.update({
                        where: { id: position.id },
                        data: { tp_triggered: false }
                      });
                      this.logger.warn(
                        `[MONITOR] [RACE-DETECTED] Job ${doubleCheckJob.id} criado por outro processo ` +
                        `durante lock, FLAG REVERTIDA`
                      );
                    } else {
                      // ========== ETAPA 5: Criar job com quantidade validada ==========
                      try {
                        const limitPrice = priceOpen * (1 + tpPct / 100);
                        
                        // VALIDAÇÃO DE LUCRO MÍNIMO
                        const validationResult = await positionService.validateMinProfit(
                          position.id,
                          limitPrice
                        );

                        if (!validationResult.valid) {
                          this.logger.warn(`[SL-TP-MONITOR-REAL] ⚠️ Take Profit SKIPADO para posição ${position.id}: ${validationResult.reason}`);
                          await this.prisma.tradePosition.update({
                            where: { id: position.id },
                            data: { tp_triggered: false },
                          });
                        } else {
                          const tradeJob = await tradeJobService.createJob({
                            exchangeAccountId: position.exchange_account_id,
                            tradeMode: TradeMode.REAL,
                            symbol: position.symbol,
                            side: 'SELL',
                            orderType: 'LIMIT',
                            baseQuantity: freshPosition.qty_remaining.toNumber(),
                            limitPrice,
                            positionIdToClose: position.id,
                            skipParameterValidation: true,
                            createdBy: 'TAKE_PROFIT',
                          });

                          this.logger.log(
                            `[MONITOR] [JOB-CREATED] TAKE_PROFIT job criado (teto máximo): ` +
                            `ID=${tradeJob.id}, symbol=${position.symbol}, ` +
                            `qty=${freshPosition.qty_remaining.toNumber()}, limitPrice=${limitPrice}, ` +
                            `TSG_ativo=${position.tsg_enabled}`
                          );

                          await this.tradeExecutionQueue.add(
                            'execute-trade',
                            { tradeJobId: tradeJob.id },
                            {
                              jobId: `trade-job-${tradeJob.id}`,
                              attempts: 1,
                              removeOnComplete: true,
                              removeOnFail: { age: 3600 }
                            }
                          );

                          triggered++;
                          continue; // TP acionado, pular outras verificações para esta posição
                        }
                      } catch (error: any) {
                        this.logger.error(
                          `[MONITOR] [JOB-CREATION-FAILED] Erro ao criar job TP para posição ${position.id}: ${error.message}`
                        );
                        
                        await this.prisma.tradePosition.update({
                          where: { id: position.id },
                          data: { tp_triggered: false }
                        });
                        
                        this.logger.warn(`[MONITOR] [LOCK-REVERTED] Flag tp_triggered revertida para posição ${position.id}`);
                      }
                    }
                  }
                } else {
                  this.logger.warn(
                    `[MONITOR] [RESIDUE-SKIP] Posição ${position.id} tem resíduo muito pequeno para TP: ` +
                    `${freshPosition.qty_remaining.toNumber()} ${freshPosition.symbol} (~$${estimatedValueUSD.toFixed(2)})`
                  );
                }
              }
            }
          }
        }

        // === STOP GAIN - Lógica Corrigida ===
        // SG só funciona quando TSG NÃO está ativo (TSG tem prioridade sobre SG)
        // Funciona como trailing stop: ativa em sg_pct, vende se cair para (sg_pct - sg_drop_pct)
        if (position.tp_enabled && position.sg_enabled && !position.tsg_enabled &&
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
                  `[SL-TP-MONITOR-REAL] Flag sg_triggered resetada para posição ${position.id}: ` +
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
              `[SL-TP-MONITOR-REAL] 🎯 Stop Gain ATIVADO para posição ${position.id} (${position.symbol}) - ` +
              `Atingiu ${pnlPct.toFixed(2)}% (threshold: ${sgPct}%)`
            );
          }
          
          // Etapa 2: Verificar se deve vender (já ativado + caiu abaixo do threshold)
          if (position.sg_activated && pnlPct <= sellThreshold && pnlPct < tpPct) {
            // ========== ETAPA 1: Verificar job existente ANTES do lock ==========
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { 
                  in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED']
                }
              },
              select: { id: true, status: true, order_type: true, base_quantity: true }
            });

            if (existingJob) {
              this.logger.warn(
                `[MONITOR] [DUPLICATE-PREVENTION] Job ${existingJob.id} (${existingJob.status}, ${existingJob.order_type}) ` +
                `já existe para posição ${position.id}, pulando criação. ` +
                `Quantidade: ${existingJob.base_quantity}`
              );
              continue;
            }

            // ========== ETAPA 2: Revalidar posição ANTES do lock ==========
            const freshPosition = await this.prisma.tradePosition.findUnique({
              where: { id: position.id },
              select: { 
                qty_remaining: true, 
                status: true,
                symbol: true 
              }
            });

            if (!freshPosition || 
                freshPosition.status !== 'OPEN' || 
                freshPosition.qty_remaining.toNumber() <= 0) {
              this.logger.warn(
                `[MONITOR] [POSITION-VALIDATION] Posição ${position.id} não elegível: ` +
                `status=${freshPosition?.status}, qty=${freshPosition?.qty_remaining.toNumber()}`
              );
              continue;
            }

            // Validar quantidade mínima (evitar tentar vender resíduos)
            const minQtyUSD = 5; // $5 USD mínimo
            const estimatedValueUSD = freshPosition.qty_remaining.toNumber() * currentPrice;
            if (estimatedValueUSD < minQtyUSD) {
              this.logger.warn(
                `[MONITOR] [RESIDUE-SKIP] Posição ${position.id} tem resíduo muito pequeno: ` +
                `${freshPosition.qty_remaining.toNumber()} ${freshPosition.symbol} (~$${estimatedValueUSD.toFixed(2)}). ` +
                `Pulando venda (mínimo: $${minQtyUSD})`
              );
              continue;
            }

            // ========== ETAPA 3: Lock otimista com condições restritas ==========
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                sg_triggered: false,
                status: 'OPEN',
                qty_remaining: { gt: 0 }
              },
              data: { sg_triggered: true },
            });
            
            if (lockResult.count === 0) {
              this.logger.warn(
                `[MONITOR] [LOCK-FAILED] Lock falhou para posição ${position.id} ` +
                `(outra execução ou posição mudou)`
              );
              continue;
            }

            // ========== ETAPA 4: Double-check jobs após lock ==========
            const doubleCheckJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] }
              },
              select: { id: true, status: true }
            });

            if (doubleCheckJob) {
              // Reverter lock
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sg_triggered: false }
              });
              this.logger.warn(
                `[MONITOR] [RACE-DETECTED] Job ${doubleCheckJob.id} criado por outro processo ` +
                `durante lock, FLAG REVERTIDA`
              );
              continue;
            }

            // ========== ETAPA 5: Criar job com quantidade validada ==========
            try {
              const limitPrice = currentPrice * 0.999; // 0.1% abaixo do preço atual
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: freshPosition.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id,
                skipParameterValidation: true,
                createdBy: 'STOP_GAIN',
              });

              this.logger.log(
                `[MONITOR] [JOB-CREATED] STOP_GAIN job criado: ` +
                `ID=${tradeJob.id}, symbol=${position.symbol}, ` +
                `qty=${freshPosition.qty_remaining.toNumber()}, limitPrice=${limitPrice}`
              );

              await this.tradeExecutionQueue.add(
                'execute-trade',
                { tradeJobId: tradeJob.id },
                {
                  jobId: `trade-job-${tradeJob.id}`,
                  attempts: 1,
                  removeOnComplete: true,
                  removeOnFail: { age: 3600 }
                }
              );

              triggered++;
            } catch (error: any) {
              this.logger.error(
                `[MONITOR] [JOB-CREATION-FAILED] Erro ao criar job para posição ${position.id}: ${error.message}`
              );
              
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { sg_triggered: false }
              });
              
              this.logger.warn(`[MONITOR] [LOCK-REVERTED] Flag sg_triggered revertida para posição ${position.id}`);
            }
          }
        }

        // === TRAILING STOP GAIN ===
        // TSG funciona junto com TP - o primeiro a atingir vence
        // Se TP já foi triggered, não processar TSG
        if (position.tsg_enabled && 
            position.tsg_activation_pct && 
            position.tsg_drop_pct &&
            !position.tp_triggered) {
          
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
                  `[SL-TP-MONITOR-REAL] Flag tsg_triggered resetada para posição ${position.id}: ` +
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
              `[SL-TP-MONITOR-REAL] [TSG] 🎯 ATIVADO para posição ${position.id} (${position.symbol}) - ` +
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
                `[SL-TP-MONITOR-REAL] [TSG] 📈 NOVO PICO para posição ${position.id} (${position.symbol}) - ` +
                `${pnlPct.toFixed(2)}% (anterior: ${currentMax.toFixed(2)}%)`
              );
            }
            
            // Etapa 3: Verificar se deve vender (caiu X% do pico)
            const sellThreshold = currentMax - tsgDropPct;
            
            // Só vende se caiu abaixo do threshold
            if (pnlPct <= sellThreshold) {
              // ========== ETAPA 1: Verificar job existente ANTES do lock ==========
              const existingJob = await this.prisma.tradeJob.findFirst({
                where: {
                  position_id_to_close: position.id,
                  side: 'SELL',
                  status: { 
                    in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED']
                  }
                },
                select: { id: true, status: true, order_type: true, base_quantity: true }
              });

              if (existingJob) {
                this.logger.warn(
                  `[MONITOR] [DUPLICATE-PREVENTION] Job ${existingJob.id} (${existingJob.status}, ${existingJob.order_type}) ` +
                  `já existe para posição ${position.id}, pulando criação. ` +
                  `Quantidade: ${existingJob.base_quantity}`
                );
                continue;
              }

              // ========== ETAPA 2: Revalidar posição ANTES do lock ==========
              const freshPosition = await this.prisma.tradePosition.findUnique({
                where: { id: position.id },
                select: { 
                  qty_remaining: true, 
                  status: true,
                  symbol: true 
                }
              });

              if (!freshPosition || 
                  freshPosition.status !== 'OPEN' || 
                  freshPosition.qty_remaining.toNumber() <= 0) {
                this.logger.warn(
                  `[MONITOR] [POSITION-VALIDATION] Posição ${position.id} não elegível: ` +
                  `status=${freshPosition?.status}, qty=${freshPosition?.qty_remaining.toNumber()}`
                );
                continue;
              }

              // Validar quantidade mínima (evitar tentar vender resíduos)
              const minQtyUSD = 5; // $5 USD mínimo
              const estimatedValueUSD = freshPosition.qty_remaining.toNumber() * currentPrice;
              if (estimatedValueUSD < minQtyUSD) {
                this.logger.warn(
                  `[MONITOR] [RESIDUE-SKIP] Posição ${position.id} tem resíduo muito pequeno: ` +
                  `${freshPosition.qty_remaining.toNumber()} ${freshPosition.symbol} (~$${estimatedValueUSD.toFixed(2)}). ` +
                  `Pulando venda (mínimo: $${minQtyUSD})`
                );
                continue;
              }

              // ========== ETAPA 3: Lock otimista com condições restritas ==========
              const lockResult = await this.prisma.tradePosition.updateMany({
                where: { 
                  id: position.id, 
                  tsg_triggered: false,
                  status: 'OPEN',
                  qty_remaining: { gt: 0 }
                },
                data: { tsg_triggered: true }
              });
              
              if (lockResult.count === 0) {
                this.logger.warn(
                  `[MONITOR] [LOCK-FAILED] Lock falhou para posição ${position.id} ` +
                  `(outra execução ou posição mudou)`
                );
                continue;
              }

              // ========== ETAPA 4: Double-check jobs após lock ==========
              const doubleCheckJob = await this.prisma.tradeJob.findFirst({
                where: {
                  position_id_to_close: position.id,
                  side: 'SELL',
                  status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] }
                },
                select: { id: true, status: true }
              });

              if (doubleCheckJob) {
                // Reverter lock
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { tsg_triggered: false }
                });
                this.logger.warn(
                  `[MONITOR] [RACE-DETECTED] Job ${doubleCheckJob.id} criado por outro processo ` +
                  `durante lock, FLAG REVERTIDA`
                );
                continue;
              }

              // ========== ETAPA 5: Criar job com quantidade validada ==========
              try {
                const limitPrice = currentPrice * 0.999; // 0.1% abaixo do preço atual
                
                const tradeJob = await tradeJobService.createJob({
                  exchangeAccountId: position.exchange_account_id,
                  tradeMode: TradeMode.REAL,
                  symbol: position.symbol,
                  side: 'SELL',
                  orderType: 'LIMIT',
                  baseQuantity: freshPosition.qty_remaining.toNumber(),
                  limitPrice,
                  positionIdToClose: position.id,
                  skipParameterValidation: true,
                  createdBy: 'TRAILING_STOP_GAIN'
                });

                this.logger.log(
                  `[MONITOR] [JOB-CREATED] TRAILING_STOP_GAIN job criado: ` +
                  `ID=${tradeJob.id}, symbol=${position.symbol}, ` +
                  `qty=${freshPosition.qty_remaining.toNumber()}, limitPrice=${limitPrice}`
                );

                await this.tradeExecutionQueue.add(
                  'execute-trade',
                  { tradeJobId: tradeJob.id },
                  {
                    jobId: `trade-job-${tradeJob.id}`,
                    attempts: 1,
                    removeOnComplete: true,
                    removeOnFail: { age: 3600 }
                  }
                );

                triggered++;
              } catch (error: any) {
                this.logger.error(
                  `[MONITOR] [JOB-CREATION-FAILED] Erro ao criar job para posição ${position.id}: ${error.message}`
                );
                
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { tsg_triggered: false }
                });
                
                this.logger.warn(`[MONITOR] [LOCK-REVERTED] Flag tsg_triggered revertida para posição ${position.id}`);
              }
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
            // ========== ETAPA 1: Verificar job existente ANTES do lock ==========
            const existingJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { 
                  in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED']
                }
              },
              select: { id: true, status: true, order_type: true, base_quantity: true }
            });

            if (existingJob) {
              this.logger.warn(
                `[MONITOR] [DUPLICATE-PREVENTION] Job ${existingJob.id} (${existingJob.status}, ${existingJob.order_type}) ` +
                `já existe para posição ${position.id}, pulando criação. ` +
                `Quantidade: ${existingJob.base_quantity}`
              );
              continue;
            }

            // ========== ETAPA 2: Revalidar posição ANTES do lock ==========
            const freshPosition = await this.prisma.tradePosition.findUnique({
              where: { id: position.id },
              select: { 
                qty_remaining: true, 
                status: true,
                symbol: true 
              }
            });

            if (!freshPosition || 
                freshPosition.status !== 'OPEN' || 
                freshPosition.qty_remaining.toNumber() <= 0) {
              this.logger.warn(
                `[MONITOR] [POSITION-VALIDATION] Posição ${position.id} não elegível: ` +
                `status=${freshPosition?.status}, qty=${freshPosition?.qty_remaining.toNumber()}`
              );
              continue;
            }

            // Validar quantidade mínima (evitar tentar vender resíduos)
            const minQtyUSD = 5; // $5 USD mínimo
            const estimatedValueUSD = freshPosition.qty_remaining.toNumber() * currentPrice;
            if (estimatedValueUSD < minQtyUSD) {
              this.logger.warn(
                `[MONITOR] [RESIDUE-SKIP] Posição ${position.id} tem resíduo muito pequeno: ` +
                `${freshPosition.qty_remaining.toNumber()} ${freshPosition.symbol} (~$${estimatedValueUSD.toFixed(2)}). ` +
                `Pulando venda (mínimo: $${minQtyUSD})`
              );
              continue;
            }

            // ========== ETAPA 3: Lock otimista com condições restritas ==========
            const lockResult = await this.prisma.tradePosition.updateMany({
              where: {
                id: position.id,
                trailing_triggered: false,
                status: 'OPEN',
                qty_remaining: { gt: 0 }
              },
              data: { trailing_triggered: true },
            });

            if (lockResult.count === 0) {
              this.logger.warn(
                `[MONITOR] [LOCK-FAILED] Lock falhou para posição ${position.id} ` +
                `(outra execução ou posição mudou)`
              );
              continue;
            }

            // ========== ETAPA 4: Double-check jobs após lock ==========
            const doubleCheckJob = await this.prisma.tradeJob.findFirst({
              where: {
                position_id_to_close: position.id,
                side: 'SELL',
                status: { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING', 'PARTIALLY_FILLED'] }
              },
              select: { id: true, status: true }
            });

            if (doubleCheckJob) {
              // Reverter lock
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { trailing_triggered: false }
              });
              this.logger.warn(
                `[MONITOR] [RACE-DETECTED] Job ${doubleCheckJob.id} criado por outro processo ` +
                `durante lock, FLAG REVERTIDA`
              );
              continue;
            }

            // ========== ETAPA 5: Criar job com quantidade validada ==========
            try {
              // Calcular preço LIMIT para Trailing Stop: usar trailingTriggerPrice
              const limitPrice = trailingTriggerPrice;
              
              // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
              const validationResult = await positionService.validateMinProfit(
                position.id,
                limitPrice
              );

              if (!validationResult.valid) {
                this.logger.warn(`[SL-TP-MONITOR-REAL] ⚠️ Trailing Stop SKIPADO para posição ${position.id}: ${validationResult.reason}`);
                // Reverter lock
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: { trailing_triggered: false }
                });
                continue;
              }
              
              const tradeJob = await tradeJobService.createJob({
                exchangeAccountId: position.exchange_account_id,
                tradeMode: TradeMode.REAL,
                symbol: position.symbol,
                side: 'SELL',
                orderType: 'LIMIT',
                baseQuantity: freshPosition.qty_remaining.toNumber(),
                limitPrice,
                positionIdToClose: position.id,
                skipParameterValidation: true,
                createdBy: 'TRAILING_STOP',
              });

              this.logger.log(
                `[MONITOR] [JOB-CREATED] TRAILING_STOP job criado: ` +
                `ID=${tradeJob.id}, symbol=${position.symbol}, ` +
                `qty=${freshPosition.qty_remaining.toNumber()}, limitPrice=${limitPrice}`
              );

              await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
                jobId: `trade-job-${tradeJob.id}`,
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: { age: 3600 },
              });

              triggered++;
            } catch (error: any) {
              this.logger.error(
                `[MONITOR] [JOB-CREATION-FAILED] Erro ao criar job para posição ${position.id}: ${error.message}`
              );
              
              // Reverter lock se falhar
              await this.prisma.tradePosition.update({
                where: { id: position.id },
                data: { trailing_triggered: false }
              });
              
              this.logger.warn(`[MONITOR] [LOCK-REVERTED] Flag trailing_triggered revertida para posição ${position.id}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing position ${position.id}:`, error);
      }
        } // Fim do loop de posições do account
      } catch (accountError: any) {
        this.logger.error(`[SL-TP-MONITOR-REAL] Erro ao processar account ${accountId}: ${accountError.message}`);
      }
    } // Fim do loop de accounts

    const result = { positionsChecked: positions.length, triggered };
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `[SL-TP-MONITOR-REAL] Monitoramento concluído com sucesso. ` +
      `Posições verificadas: ${positions.length}, Triggers acionados: ${triggered}, Duração: ${durationMs}ms`
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

