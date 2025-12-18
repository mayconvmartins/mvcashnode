import { PrismaService } from '@mvcashnode/db';
import { TemplateService } from './template.service';

export type NotificationChannel = 'whatsapp' | 'email' | 'webpush';

export type TemplateType =
  | 'WEBHOOK_RECEIVED'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'POSITION_ERROR'
  | 'SL_HIT'
  | 'TP_HIT'
  | 'SG_HIT'
  | 'TSG_HIT'
  | 'TRADE_ERROR'
  | 'PASSWORD_RESET'
  | 'WELCOME'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_EXPIRING'
  | 'SUBSCRIPTION_EXPIRED'
  | 'TEST_MESSAGE';

export interface TemplateRenderResult {
  subject?: string;
  body: string;
  bodyHtml?: string;
  iconUrl?: string;
  actionUrl?: string;
}

export interface TemplateVariables {
  [key: string]: any;
}

// Templates padrão por tipo e canal
const DEFAULT_TEMPLATES: Record<TemplateType, Partial<Record<NotificationChannel, {
  name: string;
  subject?: string;
  body: string;
  bodyHtml?: string;
  iconUrl?: string;
  actionUrl?: string;
}>>> = {
  WEBHOOK_RECEIVED: {
    whatsapp: {
      name: 'Webhook Recebido',
      body: '🔔 *Webhook Recebido*\n\nSímbolo: {symbol}\nAção: {action}\nQuantidade: {quantity}\n\nRecebido em: {timestamp}',
    },
    email: {
      name: 'Webhook Recebido',
      subject: 'MVCash - Webhook Recebido: {symbol}',
      body: 'Um novo webhook foi recebido para o símbolo {symbol} com ação {action}.',
      bodyHtml: '<h2>🔔 Webhook Recebido</h2><p><strong>Símbolo:</strong> {symbol}<br><strong>Ação:</strong> {action}<br><strong>Quantidade:</strong> {quantity}</p><p>Recebido em: {timestamp}</p>',
    },
    webpush: {
      name: 'Webhook Recebido',
      subject: 'Webhook: {symbol}',
      body: '{action} - Quantidade: {quantity}',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/webhooks',
    },
  },
  POSITION_OPENED: {
    whatsapp: {
      name: 'Posição Aberta',
      body: '✅ *Posição Aberta*\n\nSímbolo: {symbol}\nTipo: {side}\nQuantidade: {quantity}\nPreço: ${entry_price}\n\n📊 Conta: {account}',
    },
    email: {
      name: 'Posição Aberta',
      subject: 'MVCash - Posição Aberta: {symbol}',
      body: 'Uma nova posição foi aberta.',
      bodyHtml: '<h2>✅ Posição Aberta</h2><p><strong>Símbolo:</strong> {symbol}<br><strong>Tipo:</strong> {side}<br><strong>Quantidade:</strong> {quantity}<br><strong>Preço:</strong> ${entry_price}</p>',
    },
    webpush: {
      name: 'Posição Aberta',
      subject: 'Posição Aberta: {symbol}',
      body: '{side} - Quantidade: {quantity} @ ${entry_price}',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  POSITION_CLOSED: {
    whatsapp: {
      name: 'Posição Fechada',
      body: '🏁 *Posição Fechada*\n\nSímbolo: {symbol}\nPnL: ${pnl} ({pnl_pct}%)\n\nPreço entrada: ${entry_price}\nPreço saída: ${exit_price}',
    },
    email: {
      name: 'Posição Fechada',
      subject: 'MVCash - Posição Fechada: {symbol} ({pnl_pct}%)',
      body: 'Uma posição foi fechada.',
      bodyHtml: '<h2>🏁 Posição Fechada</h2><p><strong>Símbolo:</strong> {symbol}<br><strong>PnL:</strong> ${pnl} ({pnl_pct}%)<br><strong>Preço entrada:</strong> ${entry_price}<br><strong>Preço saída:</strong> ${exit_price}</p>',
    },
    webpush: {
      name: 'Posição Fechada',
      subject: 'Posição Fechada: {symbol}',
      body: 'PnL: ${pnl} ({pnl_pct}%)',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  POSITION_ERROR: {
    whatsapp: {
      name: 'Erro na Posição',
      body: '❌ *Erro na Posição*\n\nSímbolo: {symbol}\nErro: {error}\n\n📊 Conta: {account}',
    },
    email: {
      name: 'Erro na Posição',
      subject: 'MVCash - Erro na Posição: {symbol}',
      body: 'Ocorreu um erro ao processar uma posição.',
      bodyHtml: '<h2>❌ Erro na Posição</h2><p><strong>Símbolo:</strong> {symbol}<br><strong>Erro:</strong> {error}</p>',
    },
    webpush: {
      name: 'Erro na Posição',
      subject: 'Erro: {symbol}',
      body: '{error}',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  SL_HIT: {
    whatsapp: {
      name: 'Stop Loss Atingido',
      body: '🛑 *Stop Loss Atingido*\n\nSímbolo: {symbol}\nPnL: ${pnl} ({pnl_pct}%)\n\nPreço SL: ${sl_price}',
    },
    webpush: {
      name: 'Stop Loss Atingido',
      subject: 'SL Atingido: {symbol}',
      body: 'PnL: ${pnl} ({pnl_pct}%)',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  TP_HIT: {
    whatsapp: {
      name: 'Take Profit Atingido',
      body: '🎯 *Take Profit Atingido*\n\nSímbolo: {symbol}\nPnL: ${pnl} ({pnl_pct}%)\n\nPreço TP: ${tp_price}',
    },
    webpush: {
      name: 'Take Profit Atingido',
      subject: 'TP Atingido: {symbol}',
      body: 'PnL: ${pnl} ({pnl_pct}%)',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  SG_HIT: {
    whatsapp: {
      name: 'Stop Gain Atingido',
      body: '💰 *Stop Gain Atingido*\n\nSímbolo: {symbol}\nPnL: ${pnl} ({pnl_pct}%)\n\nPreço SG: ${sg_price}',
    },
    webpush: {
      name: 'Stop Gain Atingido',
      subject: 'SG Atingido: {symbol}',
      body: 'PnL: ${pnl} ({pnl_pct}%)',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  TSG_HIT: {
    whatsapp: {
      name: 'Trailing Stop Gain Atingido',
      body: '📈 *Trailing Stop Gain Atingido*\n\nSímbolo: {symbol}\nPnL: ${pnl} ({pnl_pct}%)\n\nPreço máximo: ${max_price}\nPreço saída: ${exit_price}',
    },
    webpush: {
      name: 'TSG Atingido',
      subject: 'TSG Atingido: {symbol}',
      body: 'PnL: ${pnl} ({pnl_pct}%)',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/positions',
    },
  },
  TRADE_ERROR: {
    whatsapp: {
      name: 'Erro no Trade',
      body: '❌ *Erro no Trade*\n\nSímbolo: {symbol}\nTipo: {trade_type}\nErro: {error}',
    },
    webpush: {
      name: 'Erro no Trade',
      subject: 'Erro: {symbol}',
      body: '{error}',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/trades',
    },
  },
  PASSWORD_RESET: {
    email: {
      name: 'Recuperação de Senha',
      subject: 'MVCash - Recuperação de Senha',
      body: 'Clique no link para redefinir sua senha.',
      bodyHtml: '<h2>Recuperação de Senha</h2><p>Você solicitou a recuperação de senha. Clique no botão abaixo para criar uma nova senha:</p><p><a href="{reset_link}" style="padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px;">Redefinir Senha</a></p><p>Se você não solicitou isso, ignore este email.</p>',
    },
  },
  WELCOME: {
    email: {
      name: 'Boas-vindas',
      subject: 'Bem-vindo ao MVCash!',
      body: 'Seja bem-vindo ao MVCash Trading!',
      bodyHtml: '<h2>Bem-vindo ao MVCash! 🚀</h2><p>Sua conta foi criada com sucesso. Acesse o dashboard para começar a automatizar seus trades.</p>',
    },
  },
  SUBSCRIPTION_ACTIVATED: {
    email: {
      name: 'Assinatura Ativada',
      subject: 'MVCash - Assinatura Ativada',
      body: 'Sua assinatura foi ativada com sucesso!',
      bodyHtml: '<h2>Assinatura Ativada! ✅</h2><p>Sua assinatura do plano <strong>{plan_name}</strong> foi ativada com sucesso.</p><p>Válida até: {expires_at}</p>',
    },
    webpush: {
      name: 'Assinatura Ativada',
      subject: 'Assinatura Ativada!',
      body: 'Plano {plan_name} ativado com sucesso',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/subscription',
    },
  },
  SUBSCRIPTION_EXPIRING: {
    email: {
      name: 'Assinatura Expirando',
      subject: 'MVCash - Sua assinatura está expirando',
      body: 'Sua assinatura expira em breve.',
      bodyHtml: '<h2>Sua assinatura está expirando! ⚠️</h2><p>Sua assinatura do plano <strong>{plan_name}</strong> expira em {days_remaining} dias.</p><p>Renove agora para continuar usando todos os recursos.</p>',
    },
    webpush: {
      name: 'Assinatura Expirando',
      subject: 'Assinatura expira em {days_remaining} dias',
      body: 'Renove agora para continuar usando o MVCash',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/subscription',
    },
  },
  SUBSCRIPTION_EXPIRED: {
    email: {
      name: 'Assinatura Expirada',
      subject: 'MVCash - Sua assinatura expirou',
      body: 'Sua assinatura expirou.',
      bodyHtml: '<h2>Sua assinatura expirou! 😢</h2><p>Sua assinatura do plano <strong>{plan_name}</strong> expirou.</p><p>Renove agora para continuar automatizando seus trades.</p>',
    },
    webpush: {
      name: 'Assinatura Expirada',
      subject: 'Assinatura Expirada',
      body: 'Renove para continuar usando o MVCash',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/subscription',
    },
  },
  TEST_MESSAGE: {
    whatsapp: {
      name: 'Mensagem de Teste',
      body: '✅ *Teste de Notificação*\n\nEsta é uma mensagem de teste do MVCash.\n\nData/Hora: {timestamp}',
    },
    email: {
      name: 'Email de Teste',
      subject: 'MVCash - Teste de Notificação',
      body: 'Esta é uma mensagem de teste.',
      bodyHtml: '<h2>✅ Teste de Notificação</h2><p>Esta é uma mensagem de teste do MVCash.</p><p>Data/Hora: {timestamp}</p>',
    },
    webpush: {
      name: 'Notificação de Teste',
      subject: 'MVCash Trading',
      body: 'Esta é uma notificação de teste. As notificações push estão funcionando!',
      iconUrl: '/icons/icon-192x192.png',
      actionUrl: '/',
    },
  },
};

export class UnifiedTemplateService {
  private prisma: PrismaService;
  private templateService: TemplateService;

  constructor(prisma: PrismaService) {
    this.prisma = prisma;
    this.templateService = new TemplateService();
  }

  /**
   * Busca e renderiza um template por tipo e canal
   */
  async renderTemplate(
    templateType: TemplateType,
    channel: NotificationChannel,
    variables: TemplateVariables
  ): Promise<TemplateRenderResult | null> {
    // Tentar buscar template customizado do banco
    let template = await this.prisma.notificationTemplate.findFirst({
      where: {
        template_type: templateType,
        channel,
        is_active: true,
      },
    });

    // Se não encontrar, usar template padrão
    if (!template) {
      const defaultTemplate = DEFAULT_TEMPLATES[templateType]?.[channel];
      if (!defaultTemplate) {
        console.warn(`[TEMPLATE] Template não encontrado: ${templateType} / ${channel}`);
        return null;
      }

      // Renderizar template padrão
      return {
        subject: defaultTemplate.subject 
          ? this.templateService.renderTemplate(defaultTemplate.subject, variables) 
          : undefined,
        body: this.templateService.renderTemplate(defaultTemplate.body, variables),
        bodyHtml: defaultTemplate.bodyHtml 
          ? this.templateService.renderTemplate(defaultTemplate.bodyHtml, variables) 
          : undefined,
        iconUrl: defaultTemplate.iconUrl,
        actionUrl: defaultTemplate.actionUrl 
          ? this.templateService.renderTemplate(defaultTemplate.actionUrl, variables) 
          : undefined,
      };
    }

    // Renderizar template do banco
    return {
      subject: template.subject 
        ? this.templateService.renderTemplate(template.subject, variables) 
        : undefined,
      body: this.templateService.renderTemplate(template.body, variables),
      bodyHtml: template.body_html 
        ? this.templateService.renderTemplate(template.body_html, variables) 
        : undefined,
      iconUrl: template.icon_url || undefined,
      actionUrl: template.action_url 
        ? this.templateService.renderTemplate(template.action_url, variables) 
        : undefined,
    };
  }

  /**
   * Lista todos os templates (default + customizados)
   */
  async listTemplates(channel?: NotificationChannel): Promise<Array<{
    templateType: TemplateType;
    channel: NotificationChannel;
    name: string;
    isCustom: boolean;
    isActive: boolean;
    id?: number;
  }>> {
    const result: Array<{
      templateType: TemplateType;
      channel: NotificationChannel;
      name: string;
      isCustom: boolean;
      isActive: boolean;
      id?: number;
    }> = [];

    // Adicionar templates padrão
    for (const [type, channels] of Object.entries(DEFAULT_TEMPLATES)) {
      for (const [ch, template] of Object.entries(channels)) {
        if (!channel || ch === channel) {
          result.push({
            templateType: type as TemplateType,
            channel: ch as NotificationChannel,
            name: template.name,
            isCustom: false,
            isActive: true,
          });
        }
      }
    }

    // Buscar templates customizados do banco
    const customTemplates = await this.prisma.notificationTemplate.findMany({
      where: channel ? { channel } : {},
      orderBy: { template_type: 'asc' },
    });

    // Sobrescrever com templates customizados
    for (const custom of customTemplates) {
      const index = result.findIndex(
        t => t.templateType === custom.template_type && t.channel === custom.channel
      );
      
      const customEntry = {
        templateType: custom.template_type as TemplateType,
        channel: custom.channel as NotificationChannel,
        name: custom.name,
        isCustom: true,
        isActive: custom.is_active,
        id: custom.id,
      };

      if (index >= 0) {
        result[index] = customEntry;
      } else {
        result.push(customEntry);
      }
    }

    return result;
  }

  /**
   * Obtém um template específico
   */
  async getTemplate(templateType: TemplateType, channel: NotificationChannel): Promise<{
    templateType: TemplateType;
    channel: NotificationChannel;
    name: string;
    subject?: string;
    body: string;
    bodyHtml?: string;
    iconUrl?: string;
    actionUrl?: string;
    variables: string[];
    isCustom: boolean;
    id?: number;
  } | null> {
    // Buscar template customizado
    const custom = await this.prisma.notificationTemplate.findFirst({
      where: { template_type: templateType, channel },
    });

    if (custom) {
      return {
        templateType: custom.template_type as TemplateType,
        channel: custom.channel as NotificationChannel,
        name: custom.name,
        subject: custom.subject || undefined,
        body: custom.body,
        bodyHtml: custom.body_html || undefined,
        iconUrl: custom.icon_url || undefined,
        actionUrl: custom.action_url || undefined,
        variables: this.templateService.extractVariables(custom.body),
        isCustom: true,
        id: custom.id,
      };
    }

    // Usar template padrão
    const defaultTemplate = DEFAULT_TEMPLATES[templateType]?.[channel];
    if (!defaultTemplate) {
      return null;
    }

    return {
      templateType,
      channel,
      name: defaultTemplate.name,
      subject: defaultTemplate.subject,
      body: defaultTemplate.body,
      bodyHtml: defaultTemplate.bodyHtml,
      iconUrl: defaultTemplate.iconUrl,
      actionUrl: defaultTemplate.actionUrl,
      variables: this.templateService.extractVariables(defaultTemplate.body),
      isCustom: false,
    };
  }

  /**
   * Salva ou atualiza um template customizado
   */
  async saveTemplate(data: {
    templateType: TemplateType;
    channel: NotificationChannel;
    name: string;
    subject?: string;
    body: string;
    bodyHtml?: string;
    iconUrl?: string;
    actionUrl?: string;
    isActive?: boolean;
  }): Promise<any> {
    const existing = await this.prisma.notificationTemplate.findFirst({
      where: {
        template_type: data.templateType,
        channel: data.channel,
      },
    });

    if (existing) {
      return this.prisma.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          subject: data.subject,
          body: data.body,
          body_html: data.bodyHtml,
          icon_url: data.iconUrl,
          action_url: data.actionUrl,
          is_active: data.isActive ?? true,
          variables_json: { variables: this.templateService.extractVariables(data.body) },
        },
      });
    }

    return this.prisma.notificationTemplate.create({
      data: {
        template_type: data.templateType,
        channel: data.channel,
        name: data.name,
        subject: data.subject,
        body: data.body,
        body_html: data.bodyHtml,
        icon_url: data.iconUrl,
        action_url: data.actionUrl,
        is_active: data.isActive ?? true,
        variables_json: { variables: this.templateService.extractVariables(data.body) },
      },
    });
  }

  /**
   * Reseta um template para o padrão (deleta o customizado)
   */
  async resetTemplate(templateType: TemplateType, channel: NotificationChannel): Promise<boolean> {
    const deleted = await this.prisma.notificationTemplate.deleteMany({
      where: {
        template_type: templateType,
        channel,
      },
    });
    return deleted.count > 0;
  }

  /**
   * Retorna os templates padrão (para referência)
   */
  getDefaultTemplates(): typeof DEFAULT_TEMPLATES {
    return DEFAULT_TEMPLATES;
  }
}

