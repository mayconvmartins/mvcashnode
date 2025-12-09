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
          exchange_account: {
            select: {
              exchange: true,
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

          // Buscar preço atual
          const currentPrice = await this.getCurrentPrice(
            alert.exchange_account.exchange,
            alert.symbol
          );

          if (!currentPrice || currentPrice <= 0) {
            this.logger.warn(
              `[WEBHOOK-MONITOR] Preço inválido para ${alert.symbol} na ${alert.exchange_account.exchange}: ${currentPrice}`
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
   */
  private async getCurrentPrice(exchange: string, symbol: string): Promise<number | null> {
    try {
      // Tentar buscar do cache primeiro
      const cacheKey = `price:${exchange}:${symbol}`;
      const cachedPrice = await this.cacheService.get<number>(cacheKey);

      if (cachedPrice !== null && cachedPrice > 0) {
        this.logger.debug(
          `[WEBHOOK-MONITOR] Preço de ${symbol} obtido do cache: ${cachedPrice}`
        );
        return cachedPrice;
      }

      // Se não estiver no cache, buscar da exchange
      this.logger.debug(
        `[WEBHOOK-MONITOR] Preço não encontrado no cache, buscando da exchange ${exchange}...`
      );

      const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);
      const ticker = await adapter.fetchTicker(symbol);
      const price = ticker.last;

      if (price && price > 0) {
        // Armazenar no cache com TTL de 25 segundos
        await this.cacheService.set(cacheKey, price, { ttl: 25 });
        this.logger.debug(
          `[WEBHOOK-MONITOR] Preço de ${symbol} obtido da exchange e armazenado no cache: ${price}`
        );
        return price;
      }

      this.logger.warn(
        `[WEBHOOK-MONITOR] Preço inválido para ${symbol} na ${exchange}: ${price}`
      );
      return null;
    } catch (error: any) {
      this.logger.error(
        `[WEBHOOK-MONITOR] Erro ao buscar preço para ${symbol} na ${exchange}: ${error.message}`
      );
      return null;
    }
  }
}

