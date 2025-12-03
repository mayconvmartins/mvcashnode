import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CreateCronJobDto,
  UpdateCronJobDto,
  CronJobStatus,
  CronExecutionStatus,
} from './dto/cron-management.dto';

@Injectable()
export class CronManagementService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('sl-tp-monitor-real') private slTpRealQueue: Queue,
    @InjectQueue('sl-tp-monitor-sim') private slTpSimQueue: Queue,
    @InjectQueue('limit-orders-monitor-real') private limitOrdersRealQueue: Queue,
    @InjectQueue('limit-orders-monitor-sim') private limitOrdersSimQueue: Queue,
    @InjectQueue('balances-sync-real') private balancesSyncQueue: Queue,
    @InjectQueue('system-monitor') private systemMonitorQueue: Queue,
  ) {}

  /**
   * Mapa de filas disponíveis
   */
  private getQueueMap(): Record<string, Queue> {
    return {
      'sl-tp-monitor-real': this.slTpRealQueue,
      'sl-tp-monitor-sim': this.slTpSimQueue,
      'limit-orders-monitor-real': this.limitOrdersRealQueue,
      'limit-orders-monitor-sim': this.limitOrdersSimQueue,
      'balances-sync-real': this.balancesSyncQueue,
      'system-monitor': this.systemMonitorQueue,
    };
  }

  /**
   * Mapeia o nome do job no banco para o nome usado no BullMQ
   * O BullMQ usa o primeiro parâmetro do queue.add() como name do job repetitivo
   */
  private getBullMQJobName(jobName: string): string | null {
    const nameMap: Record<string, string> = {
      'sl-tp-monitor-real': 'monitor-sl-tp',
      'sl-tp-monitor-sim': 'monitor-sl-tp',
      'limit-orders-monitor-real': 'monitor-limit-orders',
      'limit-orders-monitor-sim': 'monitor-limit-orders',
      'balances-sync-real': 'sync-balances',
      'system-monitor': 'monitor-system',
    };
    return nameMap[jobName] || null;
  }

  /**
   * Inicializa as configurações padrão dos jobs no banco
   */
  async initializeDefaultJobs(): Promise<void> {
    const defaultJobs = [
      {
        name: 'sl-tp-monitor-real',
        description: 'Monitor de SL/TP para modo REAL',
        queue_name: 'sl-tp-monitor-real',
        job_id: 'sl-tp-monitor-real-repeat',
        interval_ms: 30000,
      },
      {
        name: 'sl-tp-monitor-sim',
        description: 'Monitor de SL/TP para modo SIMULAÇÃO',
        queue_name: 'sl-tp-monitor-sim',
        job_id: 'sl-tp-monitor-sim-repeat',
        interval_ms: 30000,
      },
      {
        name: 'limit-orders-monitor-real',
        description: 'Monitor de ordens LIMIT pendentes (REAL)',
        queue_name: 'limit-orders-monitor-real',
        job_id: 'limit-orders-monitor-real-repeat',
        interval_ms: 60000,
      },
      {
        name: 'limit-orders-monitor-sim',
        description: 'Monitor de ordens LIMIT pendentes (SIMULAÇÃO)',
        queue_name: 'limit-orders-monitor-sim',
        job_id: 'limit-orders-monitor-sim-repeat',
        interval_ms: 60000,
      },
      {
        name: 'balances-sync-real',
        description: 'Sincronização de saldos com exchanges',
        queue_name: 'balances-sync-real',
        job_id: 'balances-sync-real-repeat',
        interval_ms: 300000,
      },
      {
        name: 'system-monitor',
        description: 'Monitor de sistema e alertas',
        queue_name: 'system-monitor',
        job_id: 'system-monitor-repeat',
        interval_ms: 30000,
      },
    ];

    for (const job of defaultJobs) {
      const existing = await this.prisma.cronJobConfig.findUnique({
        where: { name: job.name },
      });

      if (!existing) {
        await this.prisma.cronJobConfig.create({
          data: job,
        });
      }
    }
  }

  /**
   * Lista todos os jobs configurados
   */
  async getAllJobs(): Promise<any[]> {
    try {
      const jobs = await this.prisma.cronJobConfig.findMany({
        orderBy: { name: 'asc' },
      });

      const queueMap = this.getQueueMap();

      // Usar Promise.allSettled para garantir que erros em um job não quebrem a listagem completa
      const results = await Promise.allSettled(
        jobs.map(async (job) => {
          try {
            // Buscar estatísticas
            const stats = await this.getJobStatistics(job.id).catch((error) => {
              console.error(`[Cron] Erro ao buscar estatísticas do job ${job.name}:`, error);
              return {
                total_runs: 0,
                success_count: 0,
                failure_count: 0,
                avg_duration_ms: 0,
                success_rate: 0,
              };
            });

            // Buscar última execução
            const lastExecution = await this.prisma.cronJobExecution
              .findFirst({
                where: { job_config_id: job.id },
                orderBy: { started_at: 'desc' },
              })
              .catch((error) => {
                console.error(`[Cron] Erro ao buscar última execução do job ${job.name}:`, error);
                return null;
              });

            // Calcular próxima execução
            let next_execution = null;
            if (job.enabled && job.status === CronJobStatus.ACTIVE && lastExecution?.finished_at) {
              next_execution = new Date(lastExecution.finished_at.getTime() + job.interval_ms);
            }

            // Verificar status na fila BullMQ
            const queue = queueMap[job.queue_name];
            let bullmqStatus = null;
            if (queue) {
              try {
                const repeatableJobs = await queue.getRepeatableJobs();
                
                // Obter o nome do job no BullMQ baseado no mapeamento
                const bullMQJobName = this.getBullMQJobName(job.name);
                
                // O BullMQ retorna jobs repetitivos com:
                // - key: formato hash ou "{queueName}::{jobId}::{pattern}" (com dois dois-pontos)
                // - id: identificador único do job repetitivo (pode ser igual ao jobId ou diferente)
                // - name: nome do job (primeiro parâmetro do queue.add(), ex: "monitor-sl-tp")
                const repeatJob = repeatableJobs.find((rj) => {
                  // 1. Comparar pelo name do job (mais confiável)
                  // O name no BullMQ é o primeiro parâmetro do queue.add()
                  if (rj.name && bullMQJobName) {
                    if (rj.name === bullMQJobName) {
                      return true;
                    }
                  }
                  
                  // 2. Comparar pelo job_id no key (formato pode ser hash ou "queueName::jobId::pattern")
                  if (rj.key) {
                    // O key pode ter dois dois-pontos (::) como separador
                    // Exemplo: "sl-tp-monitor-real::sl-tp-monitor-real-repeat::30000"
                    const keyParts = rj.key.split('::');
                    // Verificar se algum dos segmentos corresponde ao job_id
                    if (keyParts.some(part => part === job.job_id)) {
                      return true;
                    }
                    
                    // Também tentar split por um dois-pontos (:) para compatibilidade
                    const keyPartsSingle = rj.key.split(':');
                    if (keyPartsSingle.some(part => part === job.job_id)) {
                      return true;
                    }
                    
                    // Verificar se o key contém o job_id como substring (fallback)
                    if (rj.key.includes(job.job_id)) {
                      return true;
                    }
                  }
                  
                  // 3. Comparar pelo id se for igual ao job_id
                  if (rj.id === job.job_id) {
                    return true;
                  }
                  
                  // 4. Verificar se o id contém o job_id
                  if (rj.id && rj.id.includes(job.job_id)) {
                    return true;
                  }
                  
                  return false;
                });
                
                bullmqStatus = repeatJob ? 'active' : 'not_found';
                
                // Log para debug quando não encontrado (apenas se o job está ativo)
                if (!repeatJob && job.enabled && job.status === CronJobStatus.ACTIVE) {
                  // Log detalhado para debug
                  const availableJobsInfo = repeatableJobs.length > 0 
                    ? repeatableJobs.map(rj => `key="${rj.key || 'N/A'}", id="${rj.id || 'N/A'}", name="${rj.name || 'N/A'}"`).join('; ')
                    : 'nenhum';
                  console.warn(
                    `[Cron] Job ${job.name} (job_id: ${job.job_id}) não encontrado no BullMQ. ` +
                    `Total de jobs repetitivos na fila: ${repeatableJobs.length}. ` +
                    `Jobs disponíveis: ${availableJobsInfo}`
                  );
                }
              } catch (error) {
                console.error(`[Cron] Erro ao verificar job ${job.name} no BullMQ:`, error);
                bullmqStatus = 'error';
              }
            } else {
              console.warn(`[Cron] Fila ${job.queue_name} não encontrada no mapa de filas para job ${job.name}`);
              bullmqStatus = 'queue_not_found';
            }

            return {
              ...job,
              statistics: stats,
              last_execution: lastExecution
                ? {
                    started_at: lastExecution.started_at,
                    duration_ms: lastExecution.duration_ms,
                    status: lastExecution.status,
                    result_json: lastExecution.result_json,
                  }
                : null,
              next_execution,
              bullmq_status: bullmqStatus,
            };
          } catch (error) {
            console.error(`[Cron] Erro ao processar job ${job.name}:`, error);
            // Retornar job com informações básicas mesmo em caso de erro
            return {
              ...job,
              statistics: {
                total_runs: 0,
                success_count: 0,
                failure_count: 0,
                avg_duration_ms: 0,
                success_rate: 0,
              },
              last_execution: null,
              next_execution: null,
              bullmq_status: 'error',
            };
          }
        }),
      );

      // Processar resultados e filtrar rejeitados
      return results
        .map((result) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            console.error('[Cron] Erro ao processar job:', result.reason);
            return null;
          }
        })
        .filter((job) => job !== null);
    } catch (error) {
      console.error('[Cron] Erro crítico ao buscar jobs:', error);
      return [];
    }
  }

  /**
   * Busca um job específico
   */
  async getJobByName(name: string): Promise<any> {
    const job = await this.prisma.cronJobConfig.findUnique({
      where: { name },
    });

    if (!job) {
      throw new NotFoundException(`Job ${name} não encontrado`);
    }

    const stats = await this.getJobStatistics(job.id);
    const executions = await this.prisma.cronJobExecution.findMany({
      where: { job_config_id: job.id },
      orderBy: { started_at: 'desc' },
      take: 100,
    });

    return {
      job,
      statistics: stats,
      executions,
    };
  }

  /**
   * Calcula estatísticas de um job
   */
  private async getJobStatistics(jobConfigId: number): Promise<any> {
    const executions = await this.prisma.cronJobExecution.findMany({
      where: { job_config_id: jobConfigId },
    });

    const total_runs = executions.length;
    const success_count = executions.filter((e) => e.status === CronExecutionStatus.SUCCESS).length;
    const failure_count = executions.filter((e) => e.status === CronExecutionStatus.FAILED).length;

    const completedExecutions = executions.filter((e) => e.duration_ms !== null);
    const avg_duration_ms =
      completedExecutions.length > 0
        ? completedExecutions.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / completedExecutions.length
        : 0;

    const success_rate = total_runs > 0 ? (success_count / total_runs) * 100 : 0;

    return {
      total_runs,
      success_count,
      failure_count,
      avg_duration_ms: Math.round(avg_duration_ms),
      success_rate: parseFloat(success_rate.toFixed(2)),
    };
  }

  /**
   * Cria um novo job
   */
  async createJob(dto: CreateCronJobDto, userId?: number): Promise<any> {
    const existing = await this.prisma.cronJobConfig.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(`Job ${dto.name} já existe`);
    }

    return this.prisma.cronJobConfig.create({
      data: {
        ...dto,
        updated_by: userId,
      },
    });
  }

  /**
   * Atualiza configuração de um job
   */
  async updateJob(name: string, dto: UpdateCronJobDto, userId?: number): Promise<any> {
    const job = await this.prisma.cronJobConfig.findUnique({
      where: { name },
    });

    if (!job) {
      throw new NotFoundException(`Job ${name} não encontrado`);
    }

    // Se o intervalo mudou, precisamos recriar o job no BullMQ
    if (dto.interval_ms && dto.interval_ms !== job.interval_ms) {
      await this.rescheduleJob(job, dto.interval_ms);
    }

    // Se o status mudou para PAUSED, pausar job
    if (dto.status === CronJobStatus.PAUSED && job.status !== CronJobStatus.PAUSED) {
      await this.pauseJobInBullMQ(job);
    }

    // Se o status mudou de PAUSED para ACTIVE, retomar job
    if (dto.status === CronJobStatus.ACTIVE && job.status === CronJobStatus.PAUSED) {
      await this.resumeJobInBullMQ(job);
    }

    return this.prisma.cronJobConfig.update({
      where: { name },
      data: {
        ...dto,
        updated_by: userId,
      },
    });
  }

  /**
   * Pausa um job
   */
  async pauseJob(name: string): Promise<any> {
    const job = await this.prisma.cronJobConfig.findUnique({
      where: { name },
    });

    if (!job) {
      throw new NotFoundException(`Job ${name} não encontrado`);
    }

    await this.pauseJobInBullMQ(job);

    return this.prisma.cronJobConfig.update({
      where: { name },
      data: { status: CronJobStatus.PAUSED },
    });
  }

  /**
   * Retoma um job pausado
   */
  async resumeJob(name: string): Promise<any> {
    const job = await this.prisma.cronJobConfig.findUnique({
      where: { name },
    });

    if (!job) {
      throw new NotFoundException(`Job ${name} não encontrado`);
    }

    await this.resumeJobInBullMQ(job);

    return this.prisma.cronJobConfig.update({
      where: { name },
      data: { status: CronJobStatus.ACTIVE },
    });
  }

  /**
   * Executa um job manualmente
   */
  async executeJobManually(name: string): Promise<any> {
    const job = await this.prisma.cronJobConfig.findUnique({
      where: { name },
    });

    if (!job) {
      throw new NotFoundException(`Job ${name} não encontrado`);
    }

    const queue = this.getQueueMap()[job.queue_name];
    if (!queue) {
      throw new BadRequestException(`Fila ${job.queue_name} não encontrada`);
    }

    // Criar registro de execução
    const execution = await this.prisma.cronJobExecution.create({
      data: {
        job_config_id: job.id,
        status: CronExecutionStatus.RUNNING,
        triggered_by: 'MANUAL',
      },
    });

    // Adicionar job na fila
    const bullJob = await queue.add(`manual-${Date.now()}`, {}, { jobId: `manual-${job.name}-${Date.now()}` });

    return {
      success: true,
      message: `Job ${name} adicionado à fila para execução manual`,
      execution,
      bull_job_id: bullJob.id,
    };
  }

  /**
   * Busca histórico de execuções
   */
  async getExecutionHistory(name?: string, limit: number = 100): Promise<any[]> {
    const where: any = {};

    if (name) {
      const job = await this.prisma.cronJobConfig.findUnique({
        where: { name },
      });

      if (!job) {
        throw new NotFoundException(`Job ${name} não encontrado`);
      }

      where.job_config_id = job.id;
    }

    return this.prisma.cronJobExecution.findMany({
      where,
      include: {
        job_config: {
          select: {
            name: true,
            description: true,
          },
        },
      },
      orderBy: { started_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Helper: Encontra o key do job repetitivo no BullMQ
   */
  private async findRepeatableJobKey(queue: Queue, jobId: string): Promise<string | null> {
    try {
      const repeatableJobs = await queue.getRepeatableJobs();
      const repeatJob = repeatableJobs.find((rj) => {
        if (rj.key) {
          const keyParts = rj.key.split(':');
          if (keyParts.some(part => part === jobId)) {
            return true;
          }
          if (rj.key.includes(jobId)) {
            return true;
          }
        }
        if (rj.id === jobId || (rj.id && rj.id.includes(jobId))) {
          return true;
        }
        return false;
      });
      return repeatJob?.key || null;
    } catch (error) {
      console.error(`[Cron] Erro ao buscar key do job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Helper: Pausa job no BullMQ
   */
  private async pauseJobInBullMQ(job: any): Promise<void> {
    const queue = this.getQueueMap()[job.queue_name];
    if (!queue) return;

    try {
      // Buscar o key correto do job repetitivo
      const key = await this.findRepeatableJobKey(queue, job.job_id);
      if (key) {
        await queue.removeRepeatableByKey(key);
        console.log(`[Cron] Job ${job.name} pausado no BullMQ (key: ${key})`);
      } else {
        // Tentar remover usando o jobId diretamente (pode funcionar em algumas versões)
        try {
          await queue.removeRepeatableByKey(job.job_id);
          console.log(`[Cron] Job ${job.name} pausado no BullMQ usando jobId diretamente`);
        } catch (error2) {
          console.warn(`[Cron] Não foi possível pausar job ${job.name} no BullMQ: job não encontrado`);
        }
      }
    } catch (error) {
      console.error(`[Cron] Erro ao pausar job ${job.name}:`, error);
    }
  }

  /**
   * Helper: Retoma job no BullMQ
   */
  private async resumeJobInBullMQ(job: any): Promise<void> {
    const queue = this.getQueueMap()[job.queue_name];
    if (!queue) return;

    try {
      await queue.add(
        job.name,
        {},
        {
          repeat: { every: job.interval_ms },
          jobId: job.job_id,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      console.log(`[Cron] Job ${job.name} retomado no BullMQ`);
    } catch (error) {
      console.error(`[Cron] Erro ao retomar job ${job.name}:`, error);
    }
  }

  /**
   * Helper: Reagenda job com novo intervalo
   */
  private async rescheduleJob(job: any, newIntervalMs: number): Promise<void> {
    const queue = this.getQueueMap()[job.queue_name];
    if (!queue) return;

    try {
      // Buscar o key correto do job repetitivo
      const key = await this.findRepeatableJobKey(queue, job.job_id);
      
      // Remove job antigo
      if (key) {
        await queue.removeRepeatableByKey(key);
      } else {
        // Tentar remover usando o jobId diretamente
        try {
          await queue.removeRepeatableByKey(job.job_id);
        } catch (error2) {
          console.warn(`[Cron] Job ${job.name} não encontrado para remover antes de reagendar`);
        }
      }

      // Adiciona com novo intervalo
      await queue.add(
        job.name,
        {},
        {
          repeat: { every: newIntervalMs },
          jobId: job.job_id,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      console.log(`[Cron] Job ${job.name} reagendado com intervalo ${newIntervalMs}ms`);
    } catch (error) {
      console.error(`[Cron] Erro ao reagendar job ${job.name}:`, error);
    }
  }

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
    const job = await this.prisma.cronJobConfig.findUnique({
      where: { name: jobName },
    });

    if (!job) return;

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

  /**
   * Inicializa os jobs padrão quando o módulo é carregado
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.initializeDefaultJobs();
      console.log('[CronManagement] Jobs padrão inicializados automaticamente');
    } catch (error) {
      console.error('[CronManagement] Erro ao inicializar jobs padrão:', error);
    }
  }
}

