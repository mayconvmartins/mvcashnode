import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { MonitorService } from '@mvcashnode/shared';

@Processor('system-monitor')
export class SystemMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemMonitorProcessor.name);
  private monitorService: MonitorService;

  constructor(private prisma: PrismaService) {
    super();
    this.monitorService = new MonitorService();
  }

  async process(_job: Job<any>): Promise<any> {
    this.logger.log('[SYSTEM-MONITOR] Iniciando coleta de métricas...');

    try {
      // Coletar métricas do processo atual (monitors)
      const processMetrics = await this.monitorService.getCurrentProcessMetrics('MONITORS');

      // Salvar log de monitoramento
      await this.prisma.systemMonitoringLog.create({
        data: {
          service_name: processMetrics.name,
          process_id: processMetrics.pid,
          status: processMetrics.status,
          cpu_usage: processMetrics.cpu,
          memory_usage: processMetrics.memory / (1024 * 1024), // Converter bytes para MB
          metrics_json: {
            uptime: processMetrics.uptime,
            memory_bytes: processMetrics.memory, // Manter valor original em bytes no JSON
          },
        },
      });

      // Coletar métricas do sistema
      const systemMetrics = await this.monitorService.getSystemMetrics();

      // Verificar métricas críticas e gerar alertas
      await this.checkAndGenerateAlerts(processMetrics, systemMetrics);

      this.logger.log('[SYSTEM-MONITOR] Métricas coletadas com sucesso');

      return {
        success: true,
        timestamp: new Date(),
        metrics: {
          process: processMetrics,
          system: systemMetrics,
        },
      };
    } catch (error: any) {
      this.logger.error(`[SYSTEM-MONITOR] Erro ao coletar métricas: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verifica métricas e gera alertas se necessário
   */
  private async checkAndGenerateAlerts(processMetrics: any, systemMetrics: any): Promise<void> {
    // Alerta de CPU alta (> 90%)
    if (processMetrics.cpu > 90) {
      await this.createAlert(
        'HIGH_CPU',
        'high',
        `Processo ${processMetrics.name} com CPU alta: ${processMetrics.cpu.toFixed(2)}%`,
        processMetrics.name,
        { cpu: processMetrics.cpu }
      );
    }

    // Alerta de memória alta (> 1GB)
    const memoryGB = processMetrics.memory / (1024 * 1024 * 1024);
    if (memoryGB > 1) {
      await this.createAlert(
        'HIGH_MEMORY',
        'high',
        `Processo ${processMetrics.name} com memória alta: ${memoryGB.toFixed(2)}GB`,
        processMetrics.name,
        { memory: processMetrics.memory }
      );
    }

    // Alerta de memória do sistema (> 85%)
    if (systemMetrics.memory.usagePercent > 85) {
      await this.createAlert(
        'HIGH_SYSTEM_MEMORY',
        'critical',
        `Memória do sistema em ${systemMetrics.memory.usagePercent.toFixed(2)}%`,
        'SYSTEM',
        { memoryPercent: systemMetrics.memory.usagePercent }
      );
    }

    // Alerta de disco cheio (> 90%)
    if (systemMetrics.disk.usagePercent > 90) {
      await this.createAlert(
        'HIGH_DISK_USAGE',
        'critical',
        `Disco em ${systemMetrics.disk.usagePercent.toFixed(2)}%`,
        'SYSTEM',
        { diskPercent: systemMetrics.disk.usagePercent }
      );
    }

    // Verificar processos travados
    await this.checkStuckProcesses();
  }

  /**
   * Verifica se há processos travados
   */
  private async checkStuckProcesses(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Buscar últimos logs de cada serviço
    const services = ['API', 'EXECUTOR', 'MONITORS'];

    for (const serviceName of services) {
      const lastLog = await this.prisma.systemMonitoringLog.findFirst({
        where: { service_name: serviceName },
        orderBy: { timestamp: 'desc' },
      });

      if (lastLog && lastLog.timestamp < fiveMinutesAgo) {
        // Processo pode estar travado
        const existingAlert = await this.prisma.systemAlert.findFirst({
          where: {
            alert_type: 'PROCESS_STUCK',
            service_name: serviceName,
            resolved_at: null,
          },
        });

        if (!existingAlert) {
          await this.createAlert(
            'PROCESS_STUCK',
            'critical',
            `Processo ${serviceName} sem atualizações há mais de 5 minutos`,
            serviceName,
            { lastUpdate: lastLog.timestamp }
          );
        }
      }
    }
  }

  /**
   * Cria um alerta (evita duplicados)
   */
  private async createAlert(
    alertType: string,
    severity: string,
    message: string,
    serviceName?: string,
    metadata?: any
  ): Promise<void> {
    // Verificar se já existe um alerta similar não resolvido
    const existingAlert = await this.prisma.systemAlert.findFirst({
      where: {
        alert_type: alertType,
        service_name: serviceName,
        resolved_at: null,
        created_at: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Última hora
        },
      },
    });

    if (!existingAlert) {
      await this.prisma.systemAlert.create({
        data: {
          alert_type: alertType,
          severity,
          message,
          service_name: serviceName,
          metadata_json: metadata || {},
        },
      });

      this.logger.warn(`[ALERT] ${severity.toUpperCase()}: ${message}`);
    }
  }
}

