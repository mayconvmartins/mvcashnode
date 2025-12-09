import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { CacheService, ExchangeType } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { WebhookMonitorService } from '@mvcashnode/domain';
import { TradeJobService } from '@mvcashnode/domain';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('webhook-monitor')
export class WebhookMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookMonitorProcessor.name);
  private monitorService: WebhookMonitorService;

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService,
    private cacheService: CacheService
  ) {
    super();
    const tradeJobService = new TradeJobService(prisma);
    this.monitorService = new WebhookMonitorService(prisma, tradeJobService);
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'webhook-monitor';
    this.logger.log('[WEBHOOK-MONITOR] Iniciando monitoramento de alertas...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Buscar todos os alertas ativos em MONITORING
      const activeAlerts = await this.prisma.webhookMonitorAlert.findMany({
        where: {
          state: 'MONITORING',
        },
        include: {
          webhook_source: {
            include: {
              bindings: {
                where: { is_active: true },
                include: {
                  exchange_account: {
                    select: {
                      exchange: true,
                    },
                  },
                },
                take: 1, // Pegar apenas uma conta para buscar o exchange
              },
            },
          },
        },
      });

      if (activeAlerts.length === 0) {
        this.logger.log('[WEBHOOK-MONITOR] Nenhum alerta ativo encontrado');
        await this.cronExecutionService.recordExecution(
          jobName,
          CronExecutionStatus.SUCCESS,
          Date.now() - startTime,
          { checked: 0, executed: 0, cancelled: 0, errors: 0 }
        );
        return { checked: 0, executed: 0, cancelled: 0, errors: 0 };
      }

      this.logger.log(`[WEBHOOK-MONITOR] Processando ${activeAlerts.length} alerta(s) ativo(s)`);

      let checked = 0;
      let executed = 0;
      let cancelled = 0;
      let errors = 0;

      // Processar cada alerta
      for (const alert of activeAlerts) {
        try {
          checked++;

      // Buscar preço atual usando cache do sistema (BINANCE_SPOT)
      const currentPrice = await this.getCurrentPrice(
        'BINANCE_SPOT', // Usar BINANCE_SPOT que é o cache padrão
        alert.symbol
      );

          if (!currentPrice || currentPrice <= 0) {
            this.logger.warn(
              `[WEBHOOK-MONITOR] Preço inválido para ${alert.symbol}: ${currentPrice}`
            );
            continue;
          }

          // Atualizar monitoramento
          const { shouldExecute, shouldCancel, cancelReason } =
            await this.monitorService.updatePriceMonitoring(alert.id, currentPrice);

          if (shouldCancel) {
            await this.monitorService.cancelAlert(alert.id, cancelReason || 'Proteção ativada');
            cancelled++;
            this.logger.log(
              `[WEBHOOK-MONITOR] Alerta ${alert.id} cancelado: ${cancelReason}`
            );
          } else if (shouldExecute) {
            await this.monitorService.executeAlert(alert.id);
            executed++;
            this.logger.log(
              `[WEBHOOK-MONITOR] Alerta ${alert.id} executado para ${alert.symbol}`
            );
          } else {
            const side = (alert as any).side || 'BUY';
            const priceRef = side === 'BUY' 
              ? (alert.price_minimum?.toNumber() || alert.price_alert.toNumber())
              : (alert.price_maximum?.toNumber() || alert.price_alert.toNumber());
            this.logger.debug(
              `[WEBHOOK-MONITOR] Alerta ${alert.id} ainda em monitoramento (preço: ${currentPrice}, ${side === 'BUY' ? 'mínimo' : 'máximo'}: ${priceRef})`
            );
          }
        } catch (error: any) {
          errors++;
          this.logger.error(
            `[WEBHOOK-MONITOR] Erro ao processar alerta ${alert.id}: ${error.message}`
          );
          this.logger.error(`[WEBHOOK-MONITOR] Stack:`, error.stack);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[WEBHOOK-MONITOR] Monitoramento concluído: ${checked} verificado(s), ${executed} executado(s), ${cancelled} cancelado(s), ${errors} erro(s) em ${duration}ms`
      );

      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        duration,
        {
          checked,
          executed,
          cancelled,
          errors,
        }
      );

      return {
        checked,
        executed,
        cancelled,
        errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[WEBHOOK-MONITOR] Erro geral no monitoramento: ${error.message}`);
      this.logger.error(`[WEBHOOK-MONITOR] Stack:`, error.stack);

      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.FAILED,
        duration,
        {
          error: error.message,
        }
      );

      throw error;
    }
  }

  /**
   * Buscar preço atual usando cache do price-sync
   * Tenta buscar do cache de todas as exchanges comuns antes de buscar diretamente
   */
  private async getCurrentPrice(_exchange: string, symbol: string): Promise<number | null> {
    // Tentar buscar do cache de todas as exchanges comuns (formato usado pelo price-sync)
    // O price-sync salva com formato: price:${exchange}:${symbol} onde exchange é o enum do banco
    const commonExchanges = [
      'BINANCE_SPOT',
      'BINANCE_FUTURES',
      'BYBIT_SPOT',
      'BYBIT_FUTURES',
      'BINANCE', // Fallback para formato antigo
    ];

    for (const exchange of commonExchanges) {
      try {
        const cacheKey = `price:${exchange}:${symbol}`;
        const cachedPrice = await this.cacheService.get<number>(cacheKey);
        if (cachedPrice !== null && cachedPrice > 0) {
          this.logger.debug(
            `[WEBHOOK-MONITOR] Preço de ${symbol} obtido do cache (${exchange}): ${cachedPrice}`
          );
          return cachedPrice;
        }
      } catch (error: any) {
        // Continuar para próxima exchange
        continue;
      }
    }

    // Se não encontrou no cache, tentar buscar diretamente da Binance
    try {
      this.logger.debug(
        `[WEBHOOK-MONITOR] Preço não encontrado no cache, buscando da exchange BINANCE_SPOT...`
      );

      const adapter = AdapterFactory.createAdapter('BINANCE_SPOT' as ExchangeType);
      const ticker = await adapter.fetchTicker(symbol);
      const price = ticker.last;

      if (price && price > 0) {
        // Armazenar no cache com TTL de 25 segundos (usar chave padrão BINANCE_SPOT)
        const cacheKey = `price:BINANCE_SPOT:${symbol}`;
        await this.cacheService.set(cacheKey, price, { ttl: 25 });
        this.logger.debug(
          `[WEBHOOK-MONITOR] Preço de ${symbol} obtido da BINANCE_SPOT e armazenado no cache: ${price}`
        );
        return price;
      }

      this.logger.warn(
        `[WEBHOOK-MONITOR] Preço inválido para ${symbol} na BINANCE_SPOT: ${price}`
      );
    } catch (error: any) {
      this.logger.warn(
        `[WEBHOOK-MONITOR] Erro ao buscar preço para ${symbol} na BINANCE_SPOT: ${error.message}`
      );
    }

    // Se falhou
    this.logger.error(
      `[WEBHOOK-MONITOR] Falha ao buscar preço para ${symbol}`
    );
    return null;
  }
}

