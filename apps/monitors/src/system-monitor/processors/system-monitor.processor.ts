import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { MonitorService } from '@mvcashnode/shared';
import { EmailService } from '@mvcashnode/notifications';
import { CronExecutionService, CronExecutionStatus } from '../../shared/cron-execution.service';

@Processor('system-monitor')
export class SystemMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemMonitorProcessor.name);
  private monitorService: MonitorService;
  private emailService: EmailService | null = null;

  constructor(
    private prisma: PrismaService,
    private cronExecutionService: CronExecutionService
  ) {
    super();
    this.monitorService = new MonitorService();
    
    // Inicializar EmailService se configurado
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    
    if (smtpHost && smtpUser && smtpPass) {
      this.emailService = new EmailService(this.prisma, {
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '2525'),
        user: smtpUser,
        password: smtpPass,
        from: process.env.SMTP_FROM || 'noreply.mvcash@mvmdev.com',
      });
    }
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    const jobName = 'system-monitor';
    this.logger.log('[SYSTEM-MONITOR] Iniciando coleta de métricas...');

    try {
      // Registrar início da execução
      await this.cronExecutionService.recordExecution(jobName, CronExecutionStatus.RUNNING);
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

      const result = {
        success: true,
        timestamp: new Date(),
        metrics: {
          process: processMetrics,
          system: systemMetrics,
        },
      };

      const durationMs = Date.now() - startTime;

      // Registrar sucesso
      await this.cronExecutionService.recordExecution(
        jobName,
        CronExecutionStatus.SUCCESS,
        durationMs,
        result
      );

      return result;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Erro desconhecido';

      this.logger.error(`[SYSTEM-MONITOR] Erro ao coletar métricas: ${error.message}`, error.stack);

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
      const alert = await this.prisma.systemAlert.create({
        data: {
          alert_type: alertType,
          severity,
          message,
          service_name: serviceName,
          metadata_json: metadata || {},
        },
      });

      this.logger.warn(`[ALERT] ${severity.toUpperCase()}: ${message}`);

      // Enviar email para alertas críticos ou de alta severidade
      if ((severity === 'critical' || severity === 'high') && this.emailService) {
        try {
          const emailRecipients = await this.getAdminEmails();
          for (const email of emailRecipients) {
            await this.emailService.sendSystemHealthAlert(email, {
              alertType,
              severity,
              message,
              serviceName,
              metadata,
            });
          }
        } catch (error) {
          this.logger.error(`[ALERT] Erro ao enviar email de alerta: ${error}`);
        }
      }
    }
  }

  /**
   * Busca emails de administradores com notificações de sistema habilitadas
   */
  private async getAdminEmails(): Promise<string[]> {
    const emails: string[] = [];

    const admins = await this.prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: 'admin',
          },
        },
        is_active: true,
      },
    });

    for (const admin of admins) {
      const config = await this.prisma.emailNotificationsConfig.findUnique({
        where: { user_id: admin.id },
      });

      if (config?.system_alerts_enabled && admin.email) {
        emails.push(admin.email);
      } else if (!config && admin.email) {
        // Se não tiver config, criar com padrões e adicionar
        await this.prisma.emailNotificationsConfig.upsert({
          where: { user_id: admin.id },
          create: {
            user_id: admin.id,
            system_alerts_enabled: true, // Padrão true para admins
          },
          update: {},
        });
        emails.push(admin.email);
      }
    }

    return emails;
  }
}

