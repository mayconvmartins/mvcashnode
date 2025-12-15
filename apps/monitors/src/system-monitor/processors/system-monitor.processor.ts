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

      // ✅ NOVO: Verificar inconsistências críticas de posições
      await this.checkPositionInconsistencies();
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
   * Verifica inconsistências críticas de posições
   */
  private async checkPositionInconsistencies(): Promise<void> {
    try {
      // 1. Verificar posições com qty_remaining negativo
      const negativeQtyPositions = await this.prisma.tradePosition.findMany({
        where: {
          status: 'OPEN',
          qty_remaining: { lt: 0 },
        },
        select: {
          id: true,
          symbol: true,
          qty_remaining: true,
          exchange_account_id: true,
        },
        take: 10, // Limitar para não sobrecarregar
      });

      if (negativeQtyPositions.length > 0) {
        await this.createAlert(
          'POSITION_NEGATIVE_QTY',
          'critical',
          `Encontradas ${negativeQtyPositions.length} posição(ões) com qty_remaining negativo: ${negativeQtyPositions.map(p => `#${p.id} (${p.symbol})`).join(', ')}`,
          'MONITORS',
          { positions: negativeQtyPositions }
        );
      }

      // 2. Verificar posições com qty_remaining > qty_total
      const invalidQtyPositions = await this.prisma.tradePosition.findMany({
        where: {
          status: 'OPEN',
        },
        select: {
          id: true,
          symbol: true,
          qty_total: true,
          qty_remaining: true,
          exchange_account_id: true,
        },
        take: 100,
      });

      const invalidPositions = invalidQtyPositions.filter(
        p => p.qty_remaining.toNumber() > p.qty_total.toNumber()
      );

      if (invalidPositions.length > 0) {
        await this.createAlert(
          'POSITION_INVALID_QTY',
          'critical',
          `Encontradas ${invalidPositions.length} posição(ões) com qty_remaining > qty_total: ${invalidPositions.map(p => `#${p.id} (${p.symbol})`).join(', ')}`,
          'MONITORS',
          { positions: invalidPositions }
        );
      }

      // 3. Verificar posições duplicadas (mesmo trade_job_id_open)
      const duplicatePositions = await this.prisma.$queryRaw<Array<{
        trade_job_id_open: number;
        count: bigint;
        position_ids: string;
      }>>`
        SELECT 
          trade_job_id_open,
          COUNT(*) as count,
          GROUP_CONCAT(id ORDER BY id) as position_ids
        FROM trade_positions
        WHERE trade_job_id_open IS NOT NULL
          AND status = 'OPEN'
        GROUP BY trade_job_id_open
        HAVING COUNT(*) > 1
        LIMIT 10
      `;

      if (duplicatePositions.length > 0) {
        await this.createAlert(
          'POSITION_DUPLICATES',
          'high',
          `Encontradas ${duplicatePositions.length} posição(ões) duplicada(s) (mesmo trade_job_id_open)`,
          'MONITORS',
          { duplicates: duplicatePositions }
        );
      }

      // 4. Verificar execuções órfãs (BUY sem position_fill)
      const orphanExecutions = await this.prisma.$queryRaw<Array<{
        execution_id: number;
        job_id: number;
      }>>`
        SELECT 
          te.id as execution_id,
          te.trade_job_id as job_id
        FROM trade_executions te
        INNER JOIN trade_jobs tj ON te.trade_job_id = tj.id
        LEFT JOIN position_fills pf ON te.id = pf.trade_execution_id
        WHERE tj.side = 'BUY'
          AND tj.status = 'FILLED'
          AND pf.id IS NULL
        LIMIT 10
      `;

      if (orphanExecutions.length > 0) {
        await this.createAlert(
          'EXECUTION_ORPHANS',
          'high',
          `Encontradas ${orphanExecutions.length} execução(ões) órfã(s) (BUY sem position_fill): ${orphanExecutions.map(e => `exec ${e.execution_id}, job ${e.job_id}`).join(', ')}`,
          'MONITORS',
          { executions: orphanExecutions }
        );
      }
    } catch (error: any) {
      this.logger.error(`[SYSTEM-MONITOR] Erro ao verificar inconsistências de posições: ${error.message}`);
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

