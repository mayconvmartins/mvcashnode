import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { MonitorService, ProcessMetrics, SystemMetrics } from '@mvcashnode/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { readdir, readFile } from 'fs/promises';
import { PositionService } from '@mvcashnode/domain';

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
    api?: ProcessMetrics;
    executor?: ProcessMetrics;
    monitors?: ProcessMetrics;
    frontend?: ProcessMetrics;
    site?: ProcessMetrics;
    backup?: ProcessMetrics;
    [key: string]: ProcessMetrics | undefined;
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
    const [pm2Processes, systemMetrics, dbHealth, alertCounts] = await Promise.all([
      this.monitorService.getAllPM2Processes(),
      this.monitorService.getSystemMetrics(),
      this.monitorService.checkDatabaseHealth(this.prisma),
      this.getAlertCounts(),
    ]);

    // Simular verificação Redis (precisa de client Redis injetado)
    const redisHealth = { status: 'healthy', responseTime: 10 };

    // Mapear processos PM2 para serviços conhecidos
    const services: SystemStatus['services'] = {};
    
    // Mapear nomes do PM2 para nomes de serviços
    const serviceMap: Record<string, string> = {
      'mvcashnode-api': 'api',
      'mvcashnode-executor': 'executor',
      'mvcashnode-monitors': 'monitors',
      'mvcashnode-frontend': 'frontend',
      'mvcashnode-site': 'site',
      'mvcashnode-backup': 'backup',
    };

    for (const process of pm2Processes) {
      const serviceName = serviceMap[process.name] || process.name.toLowerCase();
      services[serviceName] = process;
    }

    // Fallback: se não encontrou processos via PM2, usar método antigo
    if (!services.api) {
      try {
        services.api = await this.monitorService.getCurrentProcessMetrics('API');
      } catch (error) {
        console.warn('[Monitoring] Não foi possível obter métricas da API');
      }
    }

    return {
      services,
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
    try {
      // Tentar obter processos do PM2 primeiro
      const pm2Processes = await this.monitorService.getAllPM2Processes();
      
      if (pm2Processes.length > 0) {
        return pm2Processes;
      }
    } catch (error) {
      console.warn('[Monitoring] Erro ao obter processos do PM2, usando método alternativo:', error);
    }

    // Fallback: método antigo usando logs do banco
    const currentProcess = await this.monitorService.getCurrentProcessMetrics('API');
    
    // Buscar últimos logs de outros serviços (um por serviço)
    const services = ['EXECUTOR', 'MONITORS', 'FRONTEND', 'SITE', 'BACKUP'];
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
          // Adicionar job com estatísticas zeradas em caso de erro para não quebrar a listagem
          jobs.push({
            name: jobDef.name,
            description: jobDef.description,
            status: 'active',
            statistics: {
              totalRuns: 0,
              successCount: 0,
              failureCount: 0,
              avgDuration: 0,
            },
          });
        }
      }

      // Buscar informações de jobs agendados (monitors) do banco de dados
      try {
        const cronJobConfigs = await this.prisma.cronJobConfig.findMany({
          where: {
            name: {
              in: [
                'sl-tp-monitor-real',
                'sl-tp-monitor-sim',
                'limit-orders-monitor-real',
                'limit-orders-monitor-sim',
                'balances-sync-real',
                'system-monitor',
                'positions-sync-missing',
                'price-sync',
                'positions-params-fix',
              ],
            },
          },
        });

        // Otimizar: buscar todas as execuções de uma vez ao invés de N+1 queries
        const allJobConfigIds = cronJobConfigs.map(jc => jc.id);
        const allExecutions = await this.prisma.cronJobExecution.findMany({
          where: { job_config_id: { in: allJobConfigIds } },
          select: {
            id: true,
            job_config_id: true,
            started_at: true,
            duration_ms: true,
            status: true,
            result_json: true,
          },
          orderBy: { started_at: 'desc' },
        });

        // Agrupar execuções por job_config_id
        const executionsByJob = new Map<number, typeof allExecutions>();
        for (const execution of allExecutions) {
          const jobId = execution.job_config_id;
          if (!executionsByJob.has(jobId)) {
            executionsByJob.set(jobId, []);
          }
          executionsByJob.get(jobId)!.push(execution);
        }

        for (const jobConfig of cronJobConfigs) {
          try {
            // Obter execuções do cache
            const executions = executionsByJob.get(jobConfig.id) || [];

            // Calcular estatísticas
            const totalRuns = executions.length;
            const successCount = executions.filter(
              (e) => e.status === 'SUCCESS',
            ).length;
            const failureCount = executions.filter(
              (e) => e.status === 'FAILED',
            ).length;

            // Calcular duração média
            const completedExecutions = executions.filter(
              (e) => e.duration_ms !== null,
            );
            const avgDuration =
              completedExecutions.length > 0
                ? completedExecutions.reduce(
                    (sum, e) => sum + (e.duration_ms || 0),
                    0,
                  ) / completedExecutions.length
                : 0;

            // Buscar última execução (já ordenado por started_at desc)
            const lastExecutionRecord = executions.length > 0 ? executions[0] : null;

            let lastExecution;
            if (lastExecutionRecord) {
              lastExecution = {
                timestamp: lastExecutionRecord.started_at,
                duration: lastExecutionRecord.duration_ms || 0,
                result:
                  lastExecutionRecord.status === 'SUCCESS'
                    ? 'success'
                    : ('failed' as 'success' | 'failed'),
                data: lastExecutionRecord.result_json,
              };
            }

            // Determinar status
            let status: 'active' | 'paused' | 'disabled' = 'active';
            if (jobConfig.status === 'PAUSED') {
              status = 'paused';
            } else if (jobConfig.status === 'DISABLED' || !jobConfig.enabled) {
              status = 'disabled';
            }

            jobs.push({
              name: jobConfig.name,
              description: jobConfig.description,
              status,
              lastExecution,
              statistics: {
                totalRuns,
                successCount,
                failureCount,
                avgDuration: Math.round(avgDuration),
              },
            });
        } catch (error) {
          console.error(
            `[Monitoring] Erro ao coletar métricas do job ${jobConfig.name}:`,
            error,
          );
          // Adicionar job com estatísticas zeradas em caso de erro para não quebrar a listagem
          jobs.push({
            name: jobConfig.name,
            description: jobConfig.description,
            status: 'active',
            statistics: {
              totalRuns: 0,
              successCount: 0,
              failureCount: 0,
              avgDuration: 0,
            },
          });
        }
      }

      // Log informativo sobre quantos jobs foram encontrados
      if (cronJobConfigs.length > 0) {
        console.log(
          `[Monitoring] ${cronJobConfigs.length} jobs de monitor encontrados no banco de dados`,
        );
      } else {
        console.warn(
          '[Monitoring] Nenhum job de monitor encontrado no banco de dados. Verifique se os jobs foram inicializados.',
        );
      }
    } catch (error) {
      console.error(
        '[Monitoring] Erro ao buscar jobs de monitor do banco de dados:',
        error,
      );
      // Continuar mesmo com erro para não quebrar a listagem completa
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

  /**
   * Retorna logs do backend lendo arquivos de log
   */
  async getBackendLogs(options: {
    level?: string;
    from?: string;
    to?: string;
    search?: string;
    limit?: number;
  }): Promise<any[]> {
    // Tentar diferentes caminhos possíveis para o diretório de logs
    const possiblePaths = [
      path.resolve(process.cwd(), 'logs'),
      path.resolve(process.cwd(), 'apps', 'api', 'logs'),
      path.resolve(__dirname, '..', '..', '..', 'logs'),
      path.resolve(__dirname, '..', '..', 'logs'),
    ];
    
    let logsPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        logsPath = possiblePath;
        break;
      }
    }
    
    // Se não encontrou, tentar criar no primeiro caminho
    if (!logsPath) {
      logsPath = possiblePaths[0];
      try {
        fs.mkdirSync(logsPath, { recursive: true });
        console.log(`[Monitoring] Diretório de logs criado em: ${logsPath}`);
      } catch (error) {
        console.error(`[Monitoring] Erro ao criar diretório de logs: ${error}`);
        return [];
      }
    }
    
    console.log(`[Monitoring] Buscando logs em: ${logsPath}`);

    const { level, from, to, search, limit = 1000 } = options;
    
    // Buscar arquivos de log
    const logFiles: string[] = [];
    try {
      const files = await readdir(logsPath);
      console.log(`[Monitoring] Arquivos encontrados no diretório: ${files.length}`);
      if (files.length > 0) {
        console.log(`[Monitoring] Primeiros arquivos: ${files.slice(0, 10).join(', ')}`);
      }
      
      // Buscar arquivos application-*.log e error-*.log
      // Padrões possíveis:
      // - application-YYYY-MM-DD.log
      // - error-YYYY-MM-DD.log
      // - application.log (sem data)
      // - error.log (sem data)
      const patterns = [
        /^(application|error)-\d{4}-\d{2}-\d{2}\.log$/, // Com data
        /^(application|error)\.log$/, // Sem data
      ];
      
      for (const file of files) {
        // Verificar se é um arquivo de log
        if (file.endsWith('.log')) {
          // Verificar se corresponde a algum padrão
          const matches = patterns.some(pattern => pattern.test(file));
          if (matches || file.includes('application') || file.includes('error')) {
            logFiles.push(path.join(logsPath, file));
          }
        }
      }
      
      console.log(`[Monitoring] Arquivos de log encontrados: ${logFiles.length}`);
      if (logFiles.length > 0) {
        console.log(`[Monitoring] Arquivos de log: ${logFiles.map(f => path.basename(f)).join(', ')}`);
      }
      
      // Ordenar por data (mais recente primeiro) - ordenar pelo nome do arquivo
      logFiles.sort((a, b) => {
        const nameA = path.basename(a);
        const nameB = path.basename(b);
        return nameB.localeCompare(nameA);
      });
    } catch (error) {
      console.error('[Monitoring] Erro ao ler diretório de logs:', error);
      return [];
    }
    
    if (logFiles.length === 0) {
      console.warn(`[Monitoring] Nenhum arquivo de log encontrado no diretório: ${logsPath}`);
      console.warn(`[Monitoring] Verifique se os logs estão sendo gerados corretamente`);
      return [];
    }

    const allLogs: any[] = [];
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    // Ler os arquivos mais recentes primeiro
    const maxFiles = 5; // Limitar a 5 arquivos mais recentes
    let totalLinesRead = 0;
    let totalLinesParsed = 0;
    
    for (const filePath of logFiles.slice(0, maxFiles)) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        totalLinesRead += lines.length;
        console.log(`[Monitoring] Lendo arquivo ${path.basename(filePath)}: ${lines.length} linhas`);
        
        for (const line of lines) {
          try {
            // Tentar parsear como JSON
            let logEntry: any;
            try {
              logEntry = JSON.parse(line);
            } catch (parseError) {
              // Se não for JSON, tentar criar um log básico da linha
              if (line.trim().length > 0) {
                // Tentar extrair informações básicas de logs não-JSON
                const timestampMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
                const levelMatch = line.match(/(error|warn|info|debug)/i);
                logEntry = {
                  timestamp: timestampMatch ? timestampMatch[0] : new Date().toISOString(),
                  level: levelMatch ? levelMatch[0].toLowerCase() : 'info',
                  message: line.substring(0, 200), // Limitar tamanho
                  raw: line,
                };
              } else {
                continue;
              }
            }
            
            // Filtrar por nível
            if (level && logEntry.level?.toLowerCase() !== level.toLowerCase()) {
              continue;
            }
            
            // Filtrar por data
            if (logEntry.timestamp) {
              const logDate = new Date(logEntry.timestamp);
              if (isNaN(logDate.getTime())) {
                // Timestamp inválido, pular
                continue;
              }
              if (fromDate && logDate < fromDate) continue;
              if (toDate && logDate > toDate) continue;
            }
            
            // Filtrar por busca de texto
            if (search) {
              const searchLower = search.toLowerCase();
              const message = (logEntry.message || '').toLowerCase();
              const context = JSON.stringify(logEntry).toLowerCase();
              if (!message.includes(searchLower) && !context.includes(searchLower)) {
                continue;
              }
            }
            
            allLogs.push({
              timestamp: logEntry.timestamp || new Date().toISOString(),
              level: (logEntry.level || 'info').toLowerCase(),
              message: logEntry.message || logEntry.msg || '',
              metadata: logEntry.meta || logEntry.context || logEntry.data || {},
              service: logEntry.service || logEntry.context?.service || 'API',
              ...(logEntry.stack && { stack: logEntry.stack }),
            });
            totalLinesParsed++;
          } catch (lineError) {
            // Ignorar linhas que causam erro
            continue;
          }
        }
      } catch (error) {
        console.error(`[Monitoring] Erro ao ler arquivo ${filePath}:`, error);
        continue;
      }
    }
    
    console.log(`[Monitoring] Processadas ${totalLinesParsed} linhas de log de ${totalLinesRead} linhas lidas`);

    // Ordenar por timestamp (mais recente primeiro) e limitar
    allLogs.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA;
    });

    const result = allLogs.slice(0, limit);
    console.log(`[Monitoring] Retornando ${result.length} logs (de ${allLogs.length} encontrados)`);
    
    return result;
  }

  /**
   * Limpa posições órfãs de agrupamento
   */
  async cleanupOrphanedGroupedPositions(): Promise<{
    checked: number;
    deleted: number;
    errors: string[];
  }> {
    const positionService = new PositionService(this.prisma);
    return positionService.cleanupOrphanedGroupedPositions();
  }

  async fixMissingGroupedJobsFromFills(): Promise<{
    checked: number;
    added: number;
    orphanedRemoved: number;
    errors: string[];
  }> {
    const positionService = new PositionService(this.prisma);
    return positionService.fixMissingGroupedJobsFromFills();
  }
}

