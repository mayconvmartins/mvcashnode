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

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { sl_triggered: true },
            });
            triggered++;
          }
        }

        // Check Take Profit
        if (position.tp_enabled && position.tp_pct && pnlPct >= position.tp_pct.toNumber()) {
          if (!position.tp_triggered) {
            // Calcular preço LIMIT para Take Profit: price_open * (1 + tp_pct / 100)
            const tpPct = position.tp_pct.toNumber();
            const limitPrice = priceOpen * (1 + tpPct / 100);
            
            // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
            // Usa o limitPrice calculado para validar
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

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

            await this.prisma.tradePosition.update({
              where: { id: position.id },
              data: { tp_triggered: true },
            });
            triggered++;
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

            // Enfileirar job para execução
            await this.tradeExecutionQueue.add('execute-trade', { tradeJobId: tradeJob.id }, {
              jobId: `trade-job-${tradeJob.id}`,
              attempts: 3,
            });

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

