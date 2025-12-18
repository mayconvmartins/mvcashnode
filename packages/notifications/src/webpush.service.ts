import { PrismaService } from '@mvcashnode/db';
import * as webpush from 'web-push';

export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: {
    url?: string;
    [key: string]: any;
  };
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
}

export interface WebPushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendWebPushResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

export class WebPushService {
  private prisma: PrismaService;
  private isConfigured: boolean = false;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
    this.configureVapid();
  }

  /**
   * Configura as chaves VAPID para Web Push
   */
  private configureVapid(): void {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:suporte@mvcash.com.br';

    if (vapidPublicKey && vapidPrivateKey) {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
        this.isConfigured = true;
        console.log('[WEBPUSH] VAPID configurado com sucesso');
      } catch (error: any) {
        console.error('[WEBPUSH] Erro ao configurar VAPID:', error.message);
        this.isConfigured = false;
      }
    } else {
      console.warn('[WEBPUSH] VAPID keys não configuradas. Web Push desabilitado.');
      this.isConfigured = false;
    }
  }

  /**
   * Retorna a chave pública VAPID para o frontend
   */
  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * Verifica se o serviço está configurado
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Registra uma nova subscription de Web Push
   */
  async subscribe(
    userId: number,
    subscription: WebPushSubscriptionKeys,
    userAgent?: string,
    deviceName?: string
  ): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Web Push não está configurado. Verifique as chaves VAPID.');
    }

    // Verificar se já existe uma subscription para este endpoint
    const existing = await this.prisma.webPushSubscription.findFirst({
      where: {
        user_id: userId,
        endpoint: subscription.endpoint,
      },
    });

    if (existing) {
      // Atualizar subscription existente
      await this.prisma.webPushSubscription.update({
        where: { id: existing.id },
        data: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          user_agent: userAgent,
          device_name: deviceName || this.parseDeviceName(userAgent),
          is_active: true,
          updated_at: new Date(),
        },
      });
      console.log(`[WEBPUSH] Subscription atualizada para usuário ${userId}`);
    } else {
      // Criar nova subscription
      await this.prisma.webPushSubscription.create({
        data: {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          user_agent: userAgent,
          device_name: deviceName || this.parseDeviceName(userAgent),
          is_active: true,
        },
      });
      console.log(`[WEBPUSH] Nova subscription criada para usuário ${userId}`);
    }
  }

  /**
   * Remove uma subscription de Web Push
   */
  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await this.prisma.webPushSubscription.deleteMany({
      where: {
        user_id: userId,
        endpoint,
      },
    });
    console.log(`[WEBPUSH] Subscription removida para usuário ${userId}`);
  }

  /**
   * Lista todas as subscriptions de um usuário
   */
  async listSubscriptions(userId: number): Promise<any[]> {
    return this.prisma.webPushSubscription.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Envia notificação push para um usuário específico
   */
  async sendToUser(
    userId: number,
    payload: WebPushPayload,
    templateType?: string,
    metadata?: { webhookEventId?: number; positionId?: number }
  ): Promise<SendWebPushResult> {
    if (!this.isConfigured) {
      console.warn('[WEBPUSH] Serviço não configurado, pulando envio');
      return { success: false, sent: 0, failed: 0, errors: ['Web Push não configurado'] };
    }

    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
    });

    if (subscriptions.length === 0) {
      console.log(`[WEBPUSH] Usuário ${userId} não tem subscriptions ativas`);
      return { success: true, sent: 0, failed: 0, errors: [] };
    }

    return this.sendToSubscriptions(subscriptions, payload, templateType, userId, metadata);
  }

  /**
   * Envia notificação push para múltiplos usuários
   */
  async sendToUsers(
    userIds: number[],
    payload: WebPushPayload,
    templateType?: string
  ): Promise<SendWebPushResult> {
    if (!this.isConfigured) {
      console.warn('[WEBPUSH] Serviço não configurado, pulando envio');
      return { success: false, sent: 0, failed: 0, errors: ['Web Push não configurado'] };
    }

    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: {
        user_id: { in: userIds },
        is_active: true,
      },
    });

    if (subscriptions.length === 0) {
      console.log(`[WEBPUSH] Nenhuma subscription encontrada para os usuários`);
      return { success: true, sent: 0, failed: 0, errors: [] };
    }

    let totalSent = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    // Agrupar por usuário para logging
    for (const subscription of subscriptions) {
      const result = await this.sendToSubscriptions(
        [subscription],
        payload,
        templateType,
        subscription.user_id
      );
      totalSent += result.sent;
      totalFailed += result.failed;
      allErrors.push(...result.errors);
    }

    return {
      success: totalSent > 0,
      sent: totalSent,
      failed: totalFailed,
      errors: allErrors,
    };
  }

  /**
   * Envia notificação para uma lista de subscriptions
   */
  private async sendToSubscriptions(
    subscriptions: any[],
    payload: WebPushPayload,
    templateType?: string,
    _userId?: number,
    metadata?: { webhookEventId?: number; positionId?: number }
  ): Promise<SendWebPushResult> {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const subscription of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        };

        // Configurar opções do push
        const options: webpush.RequestOptions = {
          TTL: 86400, // 24 horas
          urgency: 'high' as const,
        };

        // Enviar notificação
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload),
          options
        );

        sent++;

        // Registrar log de sucesso
        await this.logNotification({
          templateType: templateType || 'CUSTOM',
          userId: subscription.user_id,
          subscriptionId: subscription.id,
          title: payload.title,
          body: payload.body,
          status: 'sent',
          metadata,
        });

        console.log(`[WEBPUSH] ✅ Notificação enviada para subscription ${subscription.id}`);
      } catch (error: any) {
        failed++;
        const errorMessage = error.message || 'Erro desconhecido';
        errors.push(`Subscription ${subscription.id}: ${errorMessage}`);

        // Se for erro 410 (Gone), desativar a subscription
        if (error.statusCode === 410) {
          console.log(`[WEBPUSH] Subscription ${subscription.id} expirada, desativando...`);
          await this.prisma.webPushSubscription.update({
            where: { id: subscription.id },
            data: { is_active: false },
          });
        }

        // Registrar log de erro
        await this.logNotification({
          templateType: templateType || 'CUSTOM',
          userId: subscription.user_id,
          subscriptionId: subscription.id,
          title: payload.title,
          body: payload.body,
          status: 'failed',
          errorMessage,
          metadata,
        });

        console.error(`[WEBPUSH] ❌ Erro ao enviar para subscription ${subscription.id}:`, errorMessage);
      }
    }

    return {
      success: sent > 0,
      sent,
      failed,
      errors,
    };
  }

  /**
   * Registra log de notificação
   */
  private async logNotification(params: {
    templateType: string;
    userId: number;
    subscriptionId?: number;
    title?: string;
    body?: string;
    status: 'sent' | 'failed' | 'clicked';
    errorMessage?: string;
    metadata?: { webhookEventId?: number; positionId?: number };
  }): Promise<void> {
    try {
      await this.prisma.webPushNotificationLog.create({
        data: {
          template_type: params.templateType,
          user_id: params.userId,
          subscription_id: params.subscriptionId,
          title: params.title,
          body: params.body,
          status: params.status,
          error_message: params.errorMessage,
          webhook_event_id: params.metadata?.webhookEventId,
          position_id: params.metadata?.positionId,
        },
      });
    } catch (error: any) {
      console.error('[WEBPUSH] Erro ao registrar log:', error.message);
    }
  }

  /**
   * Gera chaves VAPID (usar apenas uma vez para configuração inicial)
   */
  static generateVapidKeys(): { publicKey: string; privateKey: string } {
    return webpush.generateVAPIDKeys();
  }

  /**
   * Extrai nome do dispositivo do user agent
   */
  private parseDeviceName(userAgent?: string): string {
    if (!userAgent) return 'Dispositivo desconhecido';

    if (/iPhone/.test(userAgent)) return 'iPhone';
    if (/iPad/.test(userAgent)) return 'iPad';
    if (/Android.*Mobile/.test(userAgent)) return 'Android';
    if (/Android/.test(userAgent)) return 'Tablet Android';
    if (/Macintosh/.test(userAgent)) return 'Mac';
    if (/Windows/.test(userAgent)) return 'Windows';
    if (/Linux/.test(userAgent)) return 'Linux';

    return 'Dispositivo';
  }
}

