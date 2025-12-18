import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { NotificationService, WhatsAppClient, EmailService } from '@mvcashnode/notifications';

@Injectable()
export class NotificationWrapperService {
  private notificationService: NotificationService | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {}

  /**
   * Obtém instância do NotificationService, criando se necessário
   */
  private async getNotificationService(): Promise<NotificationService | null> {
    if (this.notificationService) {
      return this.notificationService;
    }

    // Buscar configuração global
    const config = await this.prisma.whatsAppGlobalConfig.findFirst({
      orderBy: { id: 'desc' },
    });

    if (!config || !config.is_active || !config.api_url || !config.instance_name) {
      console.log('[NOTIFICATION-WRAPPER] WhatsApp não configurado ou inativo');
      return null;
    }

    // Criar WhatsAppClient
    const whatsappClient = new WhatsAppClient({
      apiUrl: config.api_url,
      apiKey: config.api_key || undefined,
      instanceName: config.instance_name,
    });

    // Criar EmailService se configurado
    let emailService: EmailService | undefined;
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    
    if (smtpHost && smtpUser && smtpPass) {
      emailService = new EmailService(this.prisma as any, {
        host: smtpHost,
        port: parseInt(this.configService.get<string>('SMTP_PORT') || '2525'),
        user: smtpUser,
        password: smtpPass,
        from: this.configService.get<string>('SMTP_FROM') || 'noreply.mvcash@mvmdev.com',
      });
    }

    // Criar NotificationService
    this.notificationService = new NotificationService(
      this.prisma as any, // PrismaClient
      whatsappClient,
      emailService
    );

    return this.notificationService;
  }

  /**
   * Envia notificação de webhook recebido
   */
  async sendWebhookAlert(
    webhookEvent: any,
    source: any,
    jobsCreated: number = 0,
    jobIds: number[] = []
  ): Promise<void> {
    const service = await this.getNotificationService();
    if (!service) {
      console.warn('[NOTIFICATION-WRAPPER] NotificationService não disponível. Verifique a configuração do WhatsApp.');
      throw new Error('NotificationService não disponível. Verifique a configuração do WhatsApp.');
    }
    // Não capturar erro aqui - deixar propagar para que o controller saiba que falhou
    await service.sendWebhookAlert(webhookEvent, source, jobsCreated);
  }

  /**
   * Envia notificação de posição aberta
   */
  async sendPositionOpenedAlert(positionId: number): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendPositionOpenedAlert(positionId);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar alerta de posição aberta:', error.message);
    }
  }

  /**
   * Envia notificação de posição fechada
   */
  async sendPositionClosedAlert(positionId: number): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendPositionClosedAlert(positionId);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar alerta de posição fechada:', error.message);
    }
  }

  /**
   * Envia notificação de Stop Loss acionado
   */
  async sendStopLossAlert(positionId: number, executionId: number): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendStopLossAlert(positionId, executionId);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar alerta de Stop Loss:', error.message);
    }
  }

  /**
   * Envia notificação de Stop Gain acionado
   */
  async sendStopGainAlert(positionId: number, executionId: number): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendStopGainAlert(positionId, executionId);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar alerta de Stop Gain:', error.message);
    }
  }

  /**
   * Envia notificação de Trailing Stop Gain acionado
   */
  async sendTrailingStopGainAlert(positionId: number, executionId: number): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendTrailingStopGainAlert(positionId, executionId);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar alerta de Trailing Stop Gain:', error.message);
    }
  }

  /**
   * Envia notificação de Take Profit parcial
   */
  async sendPartialTPAlert(positionId: number, executionId: number): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendPartialTPAlert(positionId, executionId);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar alerta de TP parcial:', error.message);
    }
  }

  /**
   * Envia mensagem de teste
   */
  async sendTestMessage(phone: string, config: any): Promise<void> {
    try {
      const service = await this.getNotificationService();
      if (!service) {
        return;
      }
      await service.sendTestMessage(phone, config);
    } catch (error: any) {
      console.error('[NOTIFICATION-WRAPPER] Erro ao enviar mensagem de teste:', error.message);
    }
  }
}

