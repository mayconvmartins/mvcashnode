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
    } catch (error) {
      console.error(`[CronExecutionService] Erro ao registrar execução do job ${jobName}:`, error);
    }
  }
}

