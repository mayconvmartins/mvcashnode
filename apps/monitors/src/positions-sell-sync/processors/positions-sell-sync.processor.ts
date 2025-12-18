import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { PositionService } from '@mvcashnode/domain';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('positions-sell-sync')
export class PositionsSellSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsSellSyncProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'positions-sell-sync';
    this.logger.log('[POSITIONS-SELL-SYNC] Iniciando verificação de posições abertas com vendas executadas...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      // Buscar posições abertas
      const openPositions = await this.prisma.tradePosition.findMany({
        where: {
          status: 'OPEN',
          qty_remaining: { gt: 0 },
        },
        include: {
          exchange_account: true,
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      this.logger.log(`[POSITIONS-SELL-SYNC] Encontradas ${openPositions.length} posições abertas`);

      let processed = 0;
      let closed = 0;
      let errors = 0;

      for (const position of openPositions) {
        try {
          // Buscar trade_jobs SELL executados (FILLED) para esta posição
          // que não foram processados (não têm position_fills correspondentes)
          const sellJobs = await this.prisma.tradeJob.findMany({
            where: {
              exchange_account_id: position.exchange_account_id,
              trade_mode: position.trade_mode,
              symbol: position.symbol,
              side: 'SELL',
              status: 'FILLED',
              created_at: { gte: position.created_at }, // Apenas jobs criados após a posição
            },
            include: {
              executions: {
                where: {
                  executed_qty: { gt: 0 }, // Apenas execuções com quantidade > 0
                },
                orderBy: {
                  created_at: 'asc',
                },
              },
            },
            orderBy: {
              created_at: 'asc',
            },
          });

          if (sellJobs.length === 0) {
            continue; // Nenhuma venda executada para esta posição
          }

          // Para cada job de venda, verificar se foi processado
          for (const sellJob of sellJobs) {
            if (sellJob.executions.length === 0) {
              continue; // Sem execuções
            }

            const execution = sellJob.executions[0];
            const executedQty = execution.executed_qty.toNumber();
            const avgPrice = execution.avg_price.toNumber();

            if (executedQty === 0 || avgPrice === 0) {
              continue; // Execução inválida
            }

            // Verificar se já existe position_fill para esta execução
            const existingFill = await this.prisma.positionFill.findFirst({
              where: {
                trade_execution_id: execution.id,
                position_id: position.id,
                side: 'SELL',
              },
            });

            if (existingFill) {
              continue; // Já foi processado
            }

            // Verificar se a posição ainda está aberta e tem quantidade restante
            const currentPosition = await this.prisma.tradePosition.findUnique({
              where: { id: position.id },
            });

            if (!currentPosition || currentPosition.status !== 'OPEN' || currentPosition.qty_remaining.toNumber() <= 0) {
              continue; // Posição já foi fechada ou não tem quantidade
            }

            // Determinar origin baseado na posição
            let origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'STOP_GAIN' | 'TRAILING_STOP_GAIN' | 'MANUAL' | 'TRAILING' = 'WEBHOOK';
            
            if (currentPosition.tsg_triggered) {
              origin = 'TRAILING_STOP_GAIN';
            } else if (currentPosition.sg_triggered) {
              origin = 'STOP_GAIN';
            } else if (currentPosition.tp_triggered) {
              origin = 'TAKE_PROFIT';
            } else if (currentPosition.sl_triggered) {
              origin = 'STOP_LOSS';
            } else if (currentPosition.trailing_triggered) {
              origin = 'TRAILING';
            } else if (!sellJob.webhook_event_id) {
              origin = 'MANUAL';
            }

            this.logger.log(
              `[POSITIONS-SELL-SYNC] Processando venda não processada: ` +
              `Position ${position.id}, Job ${sellJob.id}, Execution ${execution.id}, ` +
              `Qty: ${executedQty}, Price: ${avgPrice}, Origin: ${origin}`
            );

            // Processar a venda usando PositionService
            const positionService = new PositionService(this.prisma);
            await positionService.onSellExecuted(
              sellJob.id,
              execution.id,
              executedQty,
              avgPrice,
              origin,
              execution.fee_amount?.toNumber(),
              execution.fee_currency || undefined
            );

            processed++;

            // Verificar se a posição foi fechada
            const updatedPosition = await this.prisma.tradePosition.findUnique({
              where: { id: position.id },
            });

            if (updatedPosition?.status === 'CLOSED') {
              closed++;
              this.logger.log(`[POSITIONS-SELL-SYNC] ✅ Posição ${position.id} fechada com sucesso`);
            } else {
              this.logger.log(`[POSITIONS-SELL-SYNC] ✅ Posição ${position.id} parcialmente fechada (qty_remaining: ${updatedPosition?.qty_remaining.toNumber()})`);
            }
          }
        } catch (error: any) {
          errors++;
          this.logger.error(
            `[POSITIONS-SELL-SYNC] Erro ao processar posição ${position.id}: ${error.message}`,
            error.stack
          );
        }
      }

      const duration = Date.now() - startTime;
      const result = {
        processed,
        closed,
        errors,
        totalPositions: openPositions.length,
        duration,
      };

      const durationMs = Date.now() - startTime;

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        result
      );

      this.logger.log(
        `[POSITIONS-SELL-SYNC] ✅ Concluído: ${processed} vendas processadas, ${closed} posições fechadas, ${errors} erros (${durationMs}ms)`
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
        undefined,
        errorMessage
      );

      this.logger.error(`[POSITIONS-SELL-SYNC] ❌ Erro fatal: ${errorMessage}`, error.stack);
      throw error;
    }
  }
}

