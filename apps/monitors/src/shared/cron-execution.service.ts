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
   * Se o job não existir no banco, apenas loga um aviso e continua
   */
  async recordExecution(
    jobName: string,
    status: CronExecutionStatus,
    durationMs?: number,
    resultJson?: any,
    errorMessage?: string,
  ): Promise<void> {
    try {
      // Usar retry automático para lidar com conexões fechadas
      let job;
      try {
        job = await this.prisma.executeWithRetry(
          async () => {
            return await this.prisma.cronJobConfig.findUnique({
              where: { name: jobName },
            });
          },
          3, // maxRetries
          1000 // retryDelay
        );
      } catch (error: any) {
        // Se falhar após retries, apenas logar e retornar (não quebrar o job)
        console.warn(`[CronExecutionService] Erro ao buscar job ${jobName} no banco:`, error.message);
        return;
      }

      if (!job) {
        // Job não existe no banco - isso é OK, apenas não registramos a execução
        // Os jobs podem ser criados posteriormente via API de gerenciamento
        return;
      }

      // Se o status é RUNNING, criar novo registro sem finished_at
      if (status === CronExecutionStatus.RUNNING) {
        try {
          await this.prisma.executeWithRetry(
            async () => {
              return await this.prisma.cronJobExecution.create({
                data: {
                  job_config_id: job.id,
                  started_at: new Date(),
                  finished_at: null,
                  duration_ms: null,
                  status,
                  result_json: undefined,
                  error_message: null,
                  triggered_by: 'SCHEDULED',
                },
              });
            },
            3,
            1000
          );
        } catch (error: any) {
          console.warn(`[CronExecutionService] Erro ao criar execução RUNNING para ${jobName}:`, error.message);
        }
      } else {
        // Para SUCCESS, FAILED ou TIMEOUT, atualizar o último registro RUNNING ou criar novo
        let lastRunning;
        try {
          lastRunning = await this.prisma.executeWithRetry(
            async () => {
              return await this.prisma.cronJobExecution.findFirst({
                where: {
                  job_config_id: job.id,
                  status: CronExecutionStatus.RUNNING,
                  finished_at: null,
                },
                orderBy: { started_at: 'desc' },
              });
            },
            3,
            1000
          );
        } catch (error: any) {
          console.warn(`[CronExecutionService] Erro ao buscar execução RUNNING para ${jobName}:`, error.message);
          lastRunning = null;
        }

        if (lastRunning) {
          // Atualizar registro RUNNING existente
          const actualDuration = durationMs || (Date.now() - lastRunning.started_at.getTime());
          try {
            await this.prisma.executeWithRetry(
              async () => {
                return await this.prisma.cronJobExecution.update({
                  where: { id: lastRunning.id },
                  data: {
                    finished_at: new Date(),
                    duration_ms: actualDuration,
                    status,
                    result_json: resultJson,
                    error_message: errorMessage,
                  },
                });
              },
              3,
              1000
            );
          } catch (error: any) {
            console.warn(`[CronExecutionService] Erro ao atualizar execução para ${jobName}:`, error.message);
          }
        } else {
          // Criar novo registro se não houver RUNNING pendente
          try {
            await this.prisma.executeWithRetry(
              async () => {
                return await this.prisma.cronJobExecution.create({
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
              },
              3,
              1000
            );
          } catch (error: any) {
            console.warn(`[CronExecutionService] Erro ao criar execução para ${jobName}:`, error.message);
          }
        }
      }
    } catch (error: any) {
      // Erro geral - não quebrar o job principal, apenas logar
      console.error(`[CronExecutionService] Erro geral ao registrar execução do job ${jobName}:`, error.message);
    }
  }
}

