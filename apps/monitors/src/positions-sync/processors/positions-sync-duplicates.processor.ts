import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('positions-sync-duplicates')
export class PositionsSyncDuplicatesProcessor extends WorkerHost {
  private readonly logger = new Logger(PositionsSyncDuplicatesProcessor.name);

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'positions-sync-duplicates';
    this.logger.log('[POSITIONS-SYNC-DUPLICATES] Iniciando detecção de posições e jobs duplicados...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);

      const issues = {
        duplicate_positions: [] as Array<{
          job_id_open: number;
          position_ids: number[];
          created_at: Date[];
        }>,
        duplicate_jobs: [] as Array<{
          exchange_order_id: string;
          job_ids: number[];
          created_at: Date[];
        }>,
        orphan_executions: [] as Array<{
          execution_id: number;
          job_id: number;
          exchange_order_id: string | null;
          reason: string;
        }>,
      };

      // 1. Detectar posições duplicadas (mesmo trade_job_id_open)
      this.logger.log('[POSITIONS-SYNC-DUPLICATES] Detectando posições duplicadas...');
      // trade_job_id_open é obrigatório no schema, então todas as posições já têm esse campo
      const allPositions = await this.prisma.tradePosition.findMany({
        select: {
          id: true,
          trade_job_id_open: true,
          created_at: true,
          status: true,
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      const positionsByJob = new Map<number, typeof allPositions>();
      for (const pos of allPositions) {
        if (pos.trade_job_id_open) {
          if (!positionsByJob.has(pos.trade_job_id_open)) {
            positionsByJob.set(pos.trade_job_id_open, []);
          }
          positionsByJob.get(pos.trade_job_id_open)!.push(pos);
        }
      }

      for (const [jobId, positions] of positionsByJob.entries()) {
        if (positions.length > 1) {
          issues.duplicate_positions.push({
            job_id_open: jobId,
            position_ids: positions.map(p => p.id),
            created_at: positions.map(p => p.created_at),
          });
          this.logger.warn(
            `[POSITIONS-SYNC-DUPLICATES] ⚠️ Job ${jobId} tem ${positions.length} posição(ões) duplicada(s): ${positions.map(p => `#${p.id} (${p.status})`).join(', ')}`
          );
        }
      }

      // 2. Detectar jobs duplicados (mesmo exchange_order_id)
      this.logger.log('[POSITIONS-SYNC-DUPLICATES] Detectando jobs duplicados...');
      const executionsWithOrderId = await this.prisma.tradeExecution.findMany({
        where: {
          exchange_order_id: { not: null },
        },
        select: {
          id: true,
          trade_job_id: true,
          exchange_order_id: true,
          exchange: true,
          created_at: true,
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      const jobsByOrderId = new Map<string, typeof executionsWithOrderId>();
      for (const exec of executionsWithOrderId) {
        if (exec.exchange_order_id) {
          const key = `${exec.exchange}:${exec.exchange_order_id}`;
          if (!jobsByOrderId.has(key)) {
            jobsByOrderId.set(key, []);
          }
          jobsByOrderId.get(key)!.push(exec);
        }
      }

      for (const [orderKey, executions] of jobsByOrderId.entries()) {
        if (executions.length > 1) {
          const jobIds = executions.map(e => e.trade_job_id);
          issues.duplicate_jobs.push({
            exchange_order_id: orderKey,
            job_ids: jobIds,
            created_at: executions.map(e => e.created_at),
          });
          this.logger.warn(
            `[POSITIONS-SYNC-DUPLICATES] ⚠️ Exchange order ${orderKey} tem ${executions.length} execução(ões) duplicada(s): jobs ${jobIds.join(', ')}`
          );
        }
      }

      // 3. Detectar execuções órfãs (execuções sem position_fills correspondentes)
      this.logger.log('[POSITIONS-SYNC-DUPLICATES] Detectando execuções órfãs...');
      const allExecutions = await this.prisma.tradeExecution.findMany({
        where: {
          trade_job: {
            side: 'BUY',
            status: 'FILLED',
          },
        },
        include: {
          position_fills: {
            select: {
              id: true,
            },
          },
          trade_job: {
            select: {
              side: true,
              status: true,
            },
          },
        },
      });

      for (const exec of allExecutions) {
        if (exec.trade_job.side === 'BUY' && exec.position_fills.length === 0) {
          issues.orphan_executions.push({
            execution_id: exec.id,
            job_id: exec.trade_job_id,
            exchange_order_id: exec.exchange_order_id,
            reason: 'Execução BUY sem position_fill correspondente',
          });
          this.logger.warn(
            `[POSITIONS-SYNC-DUPLICATES] ⚠️ Execução ${exec.id} (job ${exec.trade_job_id}) é órfã: sem position_fill`
          );
        }
      }

      const durationMs = Date.now() - startTime;
      const totalIssues = 
        issues.duplicate_positions.length + 
        issues.duplicate_jobs.length + 
        issues.orphan_executions.length;

      this.logger.log(
        `[POSITIONS-SYNC-DUPLICATES] ✅ Concluído: ${issues.duplicate_positions.length} posição(ões) duplicada(s), ` +
        `${issues.duplicate_jobs.length} job(s) duplicado(s), ${issues.orphan_executions.length} execução(ões) órfã(s) (${durationMs}ms)`
      );

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        {
          duplicate_positions_count: issues.duplicate_positions.length,
          duplicate_jobs_count: issues.duplicate_jobs.length,
          orphan_executions_count: issues.orphan_executions.length,
          total_issues: totalIssues,
        }
      );

      return {
        duplicate_positions: issues.duplicate_positions,
        duplicate_jobs: issues.duplicate_jobs,
        orphan_executions: issues.orphan_executions,
        total_issues: totalIssues,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(
        `[POSITIONS-SYNC-DUPLICATES] ❌ Erro: ${errorMessage}`,
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

