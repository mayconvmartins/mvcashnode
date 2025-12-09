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

          // Buscar preço atual (sempre tenta Binance primeiro, depois Bybit se falhar)
          // Não precisa mais do exchange específico, sempre usa Binance primeiro
          const currentPrice = await this.getCurrentPrice(
            'BINANCE', // Sempre começar com Binance
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
            this.logger.debug(
              `[WEBHOOK-MONITOR] Alerta ${alert.id} ainda em monitoramento (preço: ${currentPrice}, mínimo: ${alert.price_minimum.toNumber()})`
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
   * Buscar preço atual usando cache do price-sync ou buscar diretamente
   * Sempre tenta Binance primeiro, depois Bybit se falhar
   */
  private async getCurrentPrice(_exchange: string, symbol: string): Promise<number | null> {
    // Sempre tentar Binance primeiro
    const exchangesToTry = ['BINANCE', 'BYBIT'];
    
    for (const exchangeToTry of exchangesToTry) {
      try {
        // Tentar buscar do cache primeiro
        const cacheKey = `price:${exchangeToTry}:${symbol}`;
        const cachedPrice = await this.cacheService.get<number>(cacheKey);

        if (cachedPrice !== null && cachedPrice > 0) {
          this.logger.debug(
            `[WEBHOOK-MONITOR] Preço de ${symbol} obtido do cache (${exchangeToTry}): ${cachedPrice}`
          );
          return cachedPrice;
        }

        // Se não estiver no cache, buscar da exchange
        this.logger.debug(
          `[WEBHOOK-MONITOR] Preço não encontrado no cache, buscando da exchange ${exchangeToTry}...`
        );

        const adapter = AdapterFactory.createAdapter(exchangeToTry as ExchangeType);
        const ticker = await adapter.fetchTicker(symbol);
        const price = ticker.last;

        if (price && price > 0) {
          // Armazenar no cache com TTL de 25 segundos
          await this.cacheService.set(cacheKey, price, { ttl: 25 });
          this.logger.debug(
            `[WEBHOOK-MONITOR] Preço de ${symbol} obtido da ${exchangeToTry} e armazenado no cache: ${price}`
          );
          return price;
        }

        this.logger.warn(
          `[WEBHOOK-MONITOR] Preço inválido para ${symbol} na ${exchangeToTry}: ${price}`
        );
      } catch (error: any) {
        this.logger.warn(
          `[WEBHOOK-MONITOR] Erro ao buscar preço para ${symbol} na ${exchangeToTry}: ${error.message}`
        );
        // Continuar para próxima exchange se não for a última
        if (exchangeToTry !== exchangesToTry[exchangesToTry.length - 1]) {
          continue;
        }
      }
    }

    // Se todas as exchanges falharam
    this.logger.error(
      `[WEBHOOK-MONITOR] Falha ao buscar preço para ${symbol} em todas as exchanges tentadas`
    );
    return null;
  }
}

