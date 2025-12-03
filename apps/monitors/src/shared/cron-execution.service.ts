import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';

export enum CronExecutionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  RUNNING = 'RUNNING',
}

@Injectable()
export class CronExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra execução de um job (chamado pelos processors)
   */
  async recordExecution(
    jobName: string,
    status: CronExecutionStatus,
    durationMs?: number,
    resultJson?: any,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const job = await this.prisma.cronJobConfig.findUnique({
        where: { name: jobName },
      });

      if (!job) {
        console.warn(`[CronExecutionService] Job ${jobName} não encontrado no banco`);
        return;
      }

      // Se o status é RUNNING, criar novo registro sem finished_at
      if (status === CronExecutionStatus.RUNNING) {
        await this.prisma.cronJobExecution.create({
          data: {
            job_config_id: job.id,
            started_at: new Date(),
            finished_at: null,
            duration_ms: null,
            status,
            result_json: null,
            error_message: null,
            triggered_by: 'SCHEDULED',
          },
        });
      } else {
        // Para SUCCESS, FAILED ou TIMEOUT, atualizar o último registro RUNNING ou criar novo
        const lastRunning = await this.prisma.cronJobExecution.findFirst({
          where: {
            job_config_id: job.id,
            status: CronExecutionStatus.RUNNING,
            finished_at: null,
          },
          orderBy: { started_at: 'desc' },
        });

        if (lastRunning) {
          // Atualizar registro RUNNING existente
          const actualDuration = durationMs || (Date.now() - lastRunning.started_at.getTime());
          await this.prisma.cronJobExecution.update({
            where: { id: lastRunning.id },
            data: {
              finished_at: new Date(),
              duration_ms: actualDuration,
              status,
              result_json: resultJson,
              error_message: errorMessage,
            },
          });
        } else {
          // Criar novo registro se não houver RUNNING pendente
          await this.prisma.cronJobExecution.create({
            data: {
              job_config_id: job.id,
              started_at: new Date(Date.now() - (durationMs || 0)),
              finished_at: new Date(),
              duration_ms: durationMs,
              status,
              result_json: resultJson,
              error_message: errorMessage,
              triggered_by: 'SCHEDULED',
            },
          });
        }
      }
    } catch (error) {
      console.error(`[CronExecutionService] Erro ao registrar execução do job ${jobName}:`, error);
    }
  }
}

