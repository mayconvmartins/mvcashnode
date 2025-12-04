import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { CacheService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('price-sync')
export class PriceSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceSyncProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService,
    private cacheService: CacheService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'price-sync';
    this.logger.log('[PRICE-SYNC] Iniciando sincronização de preços...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Buscar todas as posições abertas com suas exchanges
      const openPositions = await this.prisma.tradePosition.findMany({
        where: {
          status: 'OPEN',
          qty_remaining: { gt: 0 },
        },
        select: {
          symbol: true,
          exchange_account: {
            select: {
              exchange: true,
            },
          },
        },
      });

      // Remover duplicatas manualmente (mesmo símbolo + exchange)
      const uniquePositions = new Map<string, typeof openPositions[0]>();
      for (const position of openPositions) {
        const key = `${position.exchange_account.exchange}:${position.symbol}`;
        if (!uniquePositions.has(key)) {
          uniquePositions.set(key, position);
        }
      }

      if (uniquePositions.size === 0) {
        this.logger.log('[PRICE-SYNC] Nenhuma posição aberta encontrada');
        await this.cronExecutionService.recordExecution(
          jobName,
          CronExecutionStatus.SUCCESS,
          Date.now() - startTime,
          { prices_synced: 0 }
        );
        return { prices_synced: 0 };
      }

      // Agrupar símbolos por exchange
      const symbolExchangeMap = new Map<string, { symbols: Set<string>; exchange: string }>();

      for (const position of uniquePositions.values()) {
        const exchange = position.exchange_account.exchange;
        const key = exchange;

        if (!symbolExchangeMap.has(key)) {
          symbolExchangeMap.set(key, { symbols: new Set(), exchange });
        }
        symbolExchangeMap.get(key)!.symbols.add(position.symbol);
      }

      let totalSynced = 0;
      let totalErrors = 0;

      // Buscar preços para cada exchange
      for (const { symbols, exchange } of symbolExchangeMap.values()) {
        try {
          this.logger.log(
            `[PRICE-SYNC] Sincronizando ${symbols.size} símbolo(s) para ${exchange}`
          );

          // Criar adapter read-only (sem API keys necessárias para buscar preços)
          const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);

          // Buscar preços para todos os símbolos desta exchange em paralelo
          const pricePromises = Array.from(symbols).map(async (symbol) => {
            try {
              const ticker = await adapter.fetchTicker(symbol);
              const price = ticker.last;

              if (price && price > 0) {
                // Armazenar no cache com TTL de 25 segundos (máximo)
                const cacheKey = `price:${exchange}:${symbol}`;
                await this.cacheService.set(cacheKey, price, { ttl: 25 });
                return { symbol, price, success: true };
              } else {
                this.logger.warn(
                  `[PRICE-SYNC] Preço inválido para ${symbol} na ${exchange}: ${price}`
                );
                return { symbol, price: null, success: false };
              }
            } catch (error: any) {
              this.logger.error(
                `[PRICE-SYNC] Erro ao buscar preço para ${symbol} na ${exchange}: ${error.message}`
              );
              return { symbol, price: null, success: false, error: error.message };
            }
          });

          const results = await Promise.all(pricePromises);

          // Contar sucessos e erros
          const successes = results.filter((r) => r.success).length;
          const errors = results.filter((r) => !r.success).length;

          totalSynced += successes;
          totalErrors += errors;

          this.logger.log(
            `[PRICE-SYNC] ${exchange}: ${successes} preço(s) sincronizado(s), ${errors} erro(s)`
          );
        } catch (error: any) {
          this.logger.error(
            `[PRICE-SYNC] Erro ao processar exchange ${exchange}: ${error.message}`
          );
          totalErrors += symbols.size;
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[PRICE-SYNC] Sincronização concluída: ${totalSynced} preço(s) sincronizado(s), ${totalErrors} erro(s) em ${duration}ms`
      );

      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        duration,
        {
          prices_synced: totalSynced,
          errors: totalErrors,
        }
      );

      return {
        prices_synced: totalSynced,
        errors: totalErrors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`[PRICE-SYNC] Erro geral na sincronização: ${error.message}`);
      this.logger.error(`[PRICE-SYNC] Stack:`, error.stack);

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
}

