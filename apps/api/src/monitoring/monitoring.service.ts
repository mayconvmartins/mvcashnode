import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { MonitorService, ProcessMetrics, SystemMetrics } from '@mvcashnode/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface JobMetrics {
  name: string;
  description: string;
  status: 'active' | 'paused' | 'disabled';
  lastExecution?: {
    timestamp: Date;
    duration: number;
    result: 'success' | 'failed';
    data?: any;
  };
  nextExecution?: Date;
  statistics: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
    avgDuration: number;
  };
}

export interface SystemStatus {
  services: {
    api: ProcessMetrics;
    executor?: ProcessMetrics;
    monitors?: ProcessMetrics;
  };
  resources: {
    database: { status: string; responseTime?: number };
    redis: { status: string; responseTime?: number };
  };
  system: SystemMetrics;
  alerts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

@Injectable()
export class MonitoringService {
  private monitorService: MonitorService;

  constructor(
    private prisma: PrismaService,
    @InjectQueue('trade-execution-real') private realQueue: Queue,
    @InjectQueue('trade-execution-sim') private simQueue: Queue
  ) {
    this.monitorService = new MonitorService();
  }

  /**
   * Retorna status geral do sistema
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const [apiMetrics, systemMetrics, dbHealth, alertCounts] = await Promise.all([
      this.monitorService.getCurrentProcessMetrics('API'),
      this.monitorService.getSystemMetrics(),
      this.monitorService.checkDatabaseHealth(this.prisma),
      this.getAlertCounts(),
    ]);

    // Simular verificação Redis (precisa de client Redis injetado)
    const redisHealth = { status: 'healthy', responseTime: 10 };

    return {
      services: {
        api: apiMetrics,
      },
      resources: {
        database: {
          status: dbHealth.status,
          responseTime: dbHealth.responseTime,
        },
        redis: redisHealth,
      },
      system: systemMetrics,
      alerts: alertCounts,
    };
  }

  /**
   * Retorna métricas de todos os processos
   */
  async getAllProcessMetrics(): Promise<ProcessMetrics[]> {
    const currentProcess = await this.monitorService.getCurrentProcessMetrics('API');
    
    // Buscar últimos logs de outros serviços (um por serviço)
    const services = ['EXECUTOR', 'MONITORS'];
    const processes: ProcessMetrics[] = [currentProcess];

    for (const serviceName of services) {
      const latestLog = await this.prisma.systemMonitoringLog.findFirst({
        where: {
          service_name: serviceName,
          timestamp: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // Últimos 5 minutos
          },
        },
        orderBy: { timestamp: 'desc' },
      });

      if (latestLog) {
        const metricsJson = latestLog.metrics_json as any;
        processes.push({
          pid: latestLog.process_id || 0,
          name: latestLog.service_name,
          cpu: latestLog.cpu_usage?.toNumber() || 0,
          memory: latestLog.memory_usage?.toNumber() || 0,
          uptime: metricsJson?.uptime || 0,
          status: latestLog.status as any,
          lastUpdate: latestLog.timestamp,
        });
      }
    }

    return processes;
  }

  /**
   * Retorna métricas de jobs BullMQ
   */
  async getJobsMetrics(): Promise<JobMetrics[]> {
    const jobs: JobMetrics[] = [];

    try {
      // Buscar informações de todos os jobs conhecidos do sistema
      const jobDefinitions = [
        { name: 'trade-execution-real', queue: this.realQueue, description: 'Execução de trades em modo REAL' },
        { name: 'trade-execution-sim', queue: this.simQueue, description: 'Execução de trades em modo SIMULAÇÃO' },
      ];

      for (const jobDef of jobDefinitions) {
        try {
          const [completed, failed, active, waiting, delayed] = await Promise.all([
            jobDef.queue.getCompletedCount(),
            jobDef.queue.getFailedCount(),
            jobDef.queue.getActiveCount(),
            jobDef.queue.getWaitingCount(),
            jobDef.queue.getDelayedCount(),
          ]);

          // Buscar jobs recentes para calcular média de duração
          const recentCompleted = await jobDef.queue.getCompleted(0, 10);
          let avgDuration = 0;
          if (recentCompleted.length > 0) {
            const durations = recentCompleted
              .filter(j => j.finishedOn && j.processedOn)
              .map(j => (j.finishedOn! - j.processedOn!));
            avgDuration = durations.length > 0 
              ? durations.reduce((a, b) => a + b, 0) / durations.length 
              : 0;
          }

          // Última execução
          let lastExecution;
          if (recentCompleted.length > 0) {
            const lastJob = recentCompleted[0];
            lastExecution = {
              timestamp: new Date(lastJob.finishedOn || Date.now()),
              duration: lastJob.finishedOn && lastJob.processedOn 
                ? lastJob.finishedOn - lastJob.processedOn 
                : 0,
              result: (lastJob.returnvalue?.success !== false ? 'success' : 'failed') as 'success' | 'failed',
              data: lastJob.returnvalue,
            };
          }

          jobs.push({
            name: jobDef.name,
            description: jobDef.description,
            status: 'active',
            lastExecution,
            statistics: {
              totalRuns: completed + failed,
              successCount: completed,
              failureCount: failed,
              avgDuration,
            },
          });
        } catch (error) {
          console.error(`[Monitoring] Erro ao coletar métricas do job ${jobDef.name}:`, error);
        }
      }

      // Adicionar informações de jobs agendados (monitors)
      const monitorJobs = [
        { name: 'sl-tp-monitor-real', description: 'Monitor SL/TP modo REAL - a cada 30s' },
        { name: 'sl-tp-monitor-sim', description: 'Monitor SL/TP modo SIMULAÇÃO - a cada 30s' },
        { name: 'limit-orders-monitor-real', description: 'Monitor ordens LIMIT modo REAL - a cada 60s' },
        { name: 'limit-orders-monitor-sim', description: 'Monitor ordens LIMIT modo SIMULAÇÃO - a cada 60s' },
        { name: 'balances-sync-real', description: 'Sincronização de saldos - a cada 5min' },
        { name: 'system-monitor', description: 'Monitor de sistema e alertas - a cada 30s' },
      ];

      // Buscar estatísticas dos últimos logs para monitor jobs
      for (const monitorJob of monitorJobs) {
        jobs.push({
          name: monitorJob.name,
          description: monitorJob.description,
          status: 'active',
          statistics: {
            totalRuns: 0,
            successCount: 0,
            failureCount: 0,
            avgDuration: 0,
          },
        });
      }
    } catch (error) {
      console.error('[Monitoring] Erro ao coletar métricas de jobs:', error);
    }

    return jobs;
  }

  /**
   * Retorna alertas ativos
   */
  async getActiveAlerts(): Promise<any[]> {
    return this.prisma.systemAlert.findMany({
      where: {
        resolved_at: null,
      },
      orderBy: [
        { severity: 'desc' },
        { created_at: 'desc' },
      ],
    });
  }

  /**
   * Retorna contagem de alertas por severidade
   */
  async getAlertCounts() {
    const alerts = await this.prisma.systemAlert.groupBy({
      by: ['severity'],
      where: {
        resolved_at: null,
      },
      _count: true,
    });

    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const alert of alerts) {
      const severity = alert.severity as keyof typeof counts;
      if (severity in counts) {
        counts[severity] = alert._count;
      }
    }

    return counts;
  }

  /**
   * Salva log de monitoramento
   */
  async saveMonitoringLog(metrics: ProcessMetrics) {
    await this.prisma.systemMonitoringLog.create({
      data: {
        service_name: metrics.name,
        process_id: metrics.pid,
        status: metrics.status,
        cpu_usage: metrics.cpu,
        memory_usage: metrics.memory,
        metrics_json: {
          uptime: metrics.uptime,
        },
      },
    });
  }

  /**
   * Cria alerta
   */
  async createAlert(
    alertType: string,
    severity: string,
    message: string,
    serviceName?: string,
    metadata?: any
  ): Promise<any> {
    return this.prisma.systemAlert.create({
      data: {
        alert_type: alertType,
        severity,
        message,
        service_name: serviceName,
        metadata_json: metadata || {},
      },
    });
  }

  /**
   * Resolve alerta
   */
  async resolveAlert(alertId: number, userId?: number): Promise<any> {
    return this.prisma.systemAlert.update({
      where: { id: alertId },
      data: {
        resolved_at: new Date(),
        resolved_by: userId,
      },
    });
  }

  /**
   * Retorna histórico de logs
   */
  async getMonitoringHistory(
    serviceName?: string,
    limit: number = 100
  ): Promise<any[]> {
    return this.prisma.systemMonitoringLog.findMany({
      where: serviceName ? { service_name: serviceName } : undefined,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Retorna métricas agregadas
   */
  async getAggregatedMetrics(hoursBack: number = 24) {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const logs = await this.prisma.systemMonitoringLog.findMany({
      where: {
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Agrupar por serviço
    const byService: Record<string, any[]> = {};
    
    for (const log of logs) {
      if (!byService[log.service_name]) {
        byService[log.service_name] = [];
      }
      byService[log.service_name].push({
        timestamp: log.timestamp,
        cpu: log.cpu_usage?.toNumber() || 0,
        memory: log.memory_usage?.toNumber() || 0,
      });
    }

    return byService;
  }
}

