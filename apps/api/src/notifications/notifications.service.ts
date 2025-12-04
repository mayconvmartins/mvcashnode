import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';

export interface WhatsAppGlobalConfigDto {
  api_url: string;
  api_key?: string;
  instance_name: string;
  is_active: boolean;
}

export interface WhatsAppNotificationsConfigDto {
  position_opened_enabled?: boolean;
  position_closed_enabled?: boolean;
  stop_loss_enabled?: boolean;
  take_profit_enabled?: boolean;
  vault_alerts_enabled?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // ==================== Global Config ====================

  async getGlobalConfig() {
    const config = await this.prisma.whatsAppGlobalConfig.findFirst({
      orderBy: { id: 'desc' },
    });
    
    return config || {
      id: null,
      api_url: '',
      api_key: null,
      instance_name: '',
      is_active: false,
      created_at: null,
      updated_at: null,
    };
  }

  async updateGlobalConfig(data: WhatsAppGlobalConfigDto) {
    const existing = await this.prisma.whatsAppGlobalConfig.findFirst({
      orderBy: { id: 'desc' },
    });

    if (existing) {
      return this.prisma.whatsAppGlobalConfig.update({
        where: { id: existing.id },
        data: {
          api_url: data.api_url,
          api_key: data.api_key || null,
          instance_name: data.instance_name,
          is_active: data.is_active,
        },
      });
    }

    return this.prisma.whatsAppGlobalConfig.create({
      data: {
        api_url: data.api_url,
        api_key: data.api_key || null,
        instance_name: data.instance_name,
        is_active: data.is_active,
      },
    });
  }

  async testConnection() {
    const config = await this.getGlobalConfig();
    
    if (!config.api_url || !config.instance_name) {
      return {
        success: false,
        message: 'Configuração incompleta. Defina URL da API e nome da instância.',
      };
    }

    // Normalizar URL da API (remover barra final se houver)
    const apiUrl = config.api_url.replace(/\/+$/, '');
    
    console.log(`[WHATSAPP] Testando conexão com: ${apiUrl}`);
    console.log(`[WHATSAPP] Instância: ${config.instance_name}`);

    // Lista de endpoints para tentar (diferentes versões da Evolution API)
    const endpointsToTry = [
      // Evolution API v2 - formato mais comum
      `${apiUrl}/instance/connectionState/${config.instance_name}`,
      // Evolution API v1 - formato antigo
      `${apiUrl}/instance/${config.instance_name}/status`,
      // Formato alternativo v2
      `${apiUrl}/instance/fetchInstances`,
      // Formato com query param
      `${apiUrl}/instance/connect/${config.instance_name}`,
    ];

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`[WHATSAPP] Tentando endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(config.api_key && { 'apikey': config.api_key }),
          },
        });

        console.log(`[WHATSAPP] Resposta do endpoint ${endpoint}: ${response.status}`);

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          console.log(`[WHATSAPP] Dados da resposta:`, data);
          
          return {
            success: true,
            message: 'Conexão estabelecida com sucesso!',
            endpoint: endpoint,
            data: data,
          };
        }
      } catch (error: any) {
        console.log(`[WHATSAPP] Erro no endpoint ${endpoint}: ${error.message}`);
        // Continuar para o próximo endpoint
      }
    }

    // Se nenhum endpoint funcionou, tentar um GET básico na URL base
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(config.api_key && { 'apikey': config.api_key }),
        },
      });

      if (response.ok || response.status === 401) {
        // 401 significa que a API está funcionando mas precisa de autenticação
        return {
          success: response.status !== 401,
          message: response.status === 401 
            ? 'API encontrada mas a chave de API pode estar incorreta'
            : 'Conexão estabelecida, mas não foi possível verificar a instância',
        };
      }
    } catch (error: any) {
      // Ignorar
    }

    return {
      success: false,
      message: `Não foi possível conectar à API. Verifique a URL (${apiUrl}) e se a instância "${config.instance_name}" existe.`,
    };
  }

  // ==================== User Config ====================

  async getUserConfig(userId: number) {
    const config = await this.prisma.whatsAppNotificationsConfig.findUnique({
      where: { user_id: userId },
    });

    return config || {
      id: null,
      user_id: userId,
      position_opened_enabled: true,
      position_closed_enabled: true,
      stop_loss_enabled: true,
      take_profit_enabled: true,
      vault_alerts_enabled: false,
      created_at: null,
      updated_at: null,
    };
  }

  async updateUserConfig(userId: number, data: WhatsAppNotificationsConfigDto) {
    const existing = await this.prisma.whatsAppNotificationsConfig.findUnique({
      where: { user_id: userId },
    });

    if (existing) {
      return this.prisma.whatsAppNotificationsConfig.update({
        where: { user_id: userId },
        data: {
          position_opened_enabled: data.position_opened_enabled ?? existing.position_opened_enabled,
          position_closed_enabled: data.position_closed_enabled ?? existing.position_closed_enabled,
          stop_loss_enabled: data.stop_loss_enabled ?? existing.stop_loss_enabled,
          take_profit_enabled: data.take_profit_enabled ?? existing.take_profit_enabled,
          vault_alerts_enabled: data.vault_alerts_enabled ?? existing.vault_alerts_enabled,
        },
      });
    }

    return this.prisma.whatsAppNotificationsConfig.create({
      data: {
        user_id: userId,
        position_opened_enabled: data.position_opened_enabled ?? true,
        position_closed_enabled: data.position_closed_enabled ?? true,
        stop_loss_enabled: data.stop_loss_enabled ?? true,
        take_profit_enabled: data.take_profit_enabled ?? true,
        vault_alerts_enabled: data.vault_alerts_enabled ?? false,
      },
    });
  }

  // ==================== Alert History ====================

  async getAlertHistory(filters?: {
    userId?: number;
    type?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    
    if (filters?.type) {
      where.template_type = filters.type;
    }
    
    if (filters?.from || filters?.to) {
      where.sent_at = {};
      if (filters.from) where.sent_at.gte = filters.from;
      if (filters.to) where.sent_at.lte = filters.to;
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    // Buscar do log de notificações (inclui webhooks, posições, etc)
    const notificationLogs = await this.prisma.whatsAppNotificationLog.findMany({
      where,
      orderBy: { sent_at: 'desc' },
      skip,
      take: limit,
    });

    // Buscar também dos logs antigos (PositionAlertSent e VaultAlertSent) para compatibilidade
    const [positionAlerts, vaultAlerts] = await Promise.all([
      this.prisma.positionAlertSent.findMany({
        where: filters?.type ? { alert_type: filters.type } : {},
        orderBy: { sent_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.vaultAlertSent.findMany({
        where: filters?.type ? { alert_type: filters.type } : {},
        orderBy: { sent_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Combinar todos os alertas
    const allAlerts = [
      ...notificationLogs.map(log => ({
        id: log.id,
        alert_type: log.template_type,
        sent_at: log.sent_at,
        source: log.position_id ? 'position' : log.vault_id ? 'vault' : log.webhook_event_id ? 'webhook' : 'other',
        position_id: log.position_id || undefined,
        vault_id: log.vault_id || undefined,
        webhook_event_id: log.webhook_event_id || undefined,
        recipient: log.recipient,
        recipient_type: log.recipient_type,
        status: log.status,
        error_message: log.error_message,
      })),
      ...positionAlerts.map(a => ({ ...a, source: 'position' as const })),
      ...vaultAlerts.map(a => ({ ...a, source: 'vault' as const })),
    ].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

    return {
      items: allAlerts.slice(0, limit),
      total: notificationLogs.length + positionAlerts.length + vaultAlerts.length,
      page,
      limit,
    };
  }

  // ==================== Statistics ====================

  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      globalConfig,
      totalPositionAlerts,
      todayPositionAlerts,
      totalVaultAlerts,
      todayVaultAlerts,
      usersWithConfig,
      usersWithWhatsApp,
    ] = await Promise.all([
      this.getGlobalConfig(),
      this.prisma.positionAlertSent.count(),
      this.prisma.positionAlertSent.count({
        where: { sent_at: { gte: today } },
      }),
      this.prisma.vaultAlertSent.count(),
      this.prisma.vaultAlertSent.count({
        where: { sent_at: { gte: today } },
      }),
      this.prisma.whatsAppNotificationsConfig.count(),
      // Contar usuários que têm número WhatsApp configurado
      this.prisma.user.count({
        where: {
          profile: {
            whatsapp_phone: {
              not: null,
            },
          },
        },
      }),
    ]);

    return {
      globalConfig: {
        isActive: globalConfig.is_active,
        apiUrl: globalConfig.api_url,
        instanceName: globalConfig.instance_name,
      },
      alerts: {
        position: {
          total: totalPositionAlerts,
          today: todayPositionAlerts,
        },
        vault: {
          total: totalVaultAlerts,
          today: todayVaultAlerts,
        },
      },
      usersWithConfig,
      usersWithWhatsApp, // Usuários que têm número WhatsApp mas podem não ter configurado preferências ainda
    };
  }
}

