import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@mvcashnode/db';
import { TradeJobService, MinProfitValidationService } from '@mvcashnode/domain';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, PositionStatus, TradeMode } from '@mvcashnode/shared';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('sl-tp-monitor-sim')
export class SLTPMonitorSimProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('trade-execution-sim') private tradeExecutionQueue: Queue,
    private cronExecutionService: CronExecutionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'sl-tp-monitor-sim';

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
    // Get all open positions with SL/TP enabled (SIMULATION)
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        trade_mode: TradeMode.SIMULATION,
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
    const minProfitValidationService = new MinProfitValidationService(this.prisma);
    let triggered = 0;

    for (const position of positions) {
      try {
        // Create read-only adapter (no API keys needed for simulation)
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );

        // Get current price
        const ticker = await adapter.fetchTicker(position.symbol);
        const currentPrice = ticker.last;
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
              tradeMode: TradeMode.SIMULATION,
              symbol: position.symbol,
              side: 'SELL',
              orderType: 'LIMIT',
              baseQuantity: position.qty_remaining.toNumber(),
              limitPrice,
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
            
            // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado
            // Usa o limitPrice calculado para validar
            const validationResult = await minProfitValidationService.validateMinProfit(
              position.exchange_account_id,
              position.symbol,
              priceOpen,
              'TAKE_PROFIT',
              position.exchange_account.exchange as ExchangeType,
              TradeMode.SIMULATION,
              limitPrice // Passar o preço calculado para validação
            );

            if (!validationResult.valid) {
              console.warn(`[SL-TP-MONITOR-SIM] ⚠️ Take Profit SKIPADO para posição ${position.id}: ${validationResult.reason}`);
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
            
            // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado
            // Usa o limitPrice calculado para validar
            const validationResult = await minProfitValidationService.validateMinProfit(
              position.exchange_account_id,
              position.symbol,
              priceOpen,
              'TRAILING',
              position.exchange_account.exchange as ExchangeType,
              TradeMode.SIMULATION,
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

