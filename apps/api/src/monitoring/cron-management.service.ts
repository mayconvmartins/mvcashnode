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
    const jobs = await this.prisma.cronJobConfig.findMany({
      orderBy: { name: 'asc' },
    });

    const queueMap = this.getQueueMap();

    return Promise.all(
      jobs.map(async (job) => {
        // Buscar estatísticas
        const stats = await this.getJobStatistics(job.id);

        // Buscar última execução
        const lastExecution = await this.prisma.cronJobExecution.findFirst({
          where: { job_config_id: job.id },
          orderBy: { started_at: 'desc' },
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
            const repeatJob = repeatableJobs.find((rj) => rj.id === job.job_id);
            bullmqStatus = repeatJob ? 'active' : 'not_found';
          } catch (error) {
            console.error(`Erro ao verificar job ${job.name} no BullMQ:`, error);
            bullmqStatus = 'error';
          }
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
      }),
    );
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
   * Helper: Pausa job no BullMQ
   */
  private async pauseJobInBullMQ(job: any): Promise<void> {
    const queue = this.getQueueMap()[job.queue_name];
    if (!queue) return;

    try {
      await queue.removeRepeatableByKey(job.job_id);
      console.log(`[Cron] Job ${job.name} pausado no BullMQ`);
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
      // Remove job antigo
      await queue.removeRepeatableByKey(job.job_id);

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

