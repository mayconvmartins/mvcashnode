import { PrismaClient } from '@mvcashnode/db';
import { WhatsAppClient } from './whatsapp-client';
import { TemplateService, TemplateVariables } from './template.service';
import { EmailService } from './email.service';

export type NotificationTemplateType = 
  | 'WEBHOOK_RECEIVED'
  | 'TEST_MESSAGE'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'STOP_LOSS_TRIGGERED'
  | 'STOP_GAIN_TRIGGERED'
  | 'PARTIAL_TP_TRIGGERED';

export class NotificationService {
  private templateService: TemplateService;

  constructor(
    private prisma: PrismaClient,
    private whatsappClient: WhatsAppClient,
    private emailService?: EmailService
  ) {
    this.templateService = new TemplateService();
  }


  /**
   * Busca template ativo por tipo
   */
  private async getTemplate(type: NotificationTemplateType): Promise<string | null> {
    // @ts-ignore - Prisma client será regenerado após migration
    const template = await this.prisma.whatsAppNotificationTemplate.findFirst({
      where: {
        template_type: type,
        is_active: true,
      },
      orderBy: {
        updated_at: 'desc',
      },
    });

    return template?.body || null;
  }

  /**
   * Envia mensagem usando template
   */
  private async sendWithTemplate(
    type: NotificationTemplateType,
    variables: TemplateVariables,
    recipients: string[],
    metadata?: {
      webhook_event_id?: number;
      position_id?: number;
      vault_id?: number;
    }
  ): Promise<void> {
    if (recipients.length === 0) {
      console.log(`[NOTIFICATIONS] Nenhum destinatário para template ${type}`);
      return;
    }

    const template = await this.getTemplate(type);
    
    if (!template) {
      console.warn(`[NOTIFICATIONS] Template ${type} não encontrado ou inativo`);
      console.warn(`[NOTIFICATIONS] Verificando templates no banco...`);
      // Verificar se existe algum template do tipo
      try {
        const allTemplates = await this.prisma.whatsAppNotificationTemplate.findMany({
          where: { template_type: type },
        });
        console.warn(`[NOTIFICATIONS] Templates encontrados:`, allTemplates.map((t: any) => ({
          id: t.id,
          name: t.name,
          is_active: t.is_active,
        })));
      } catch (err) {
        console.error(`[NOTIFICATIONS] Erro ao verificar templates:`, err);
      }
      throw new Error(`Template ${type} não encontrado ou inativo. Verifique se o template existe e está ativo no banco de dados.`);
    }

    const message = this.templateService.renderTemplate(template, variables);
    let successCount = 0;
    let errorCount = 0;

    for (const recipient of recipients) {
      let status = 'failed';
      let errorMessage: string | null = null;
      
      try {
        console.log(`[NOTIFICATIONS] Enviando mensagem para ${recipient}...`);
        // Se for grupo (contém @g.us), usar sendToGroup
        if (recipient.includes('@g.us')) {
          await this.whatsappClient.sendToGroup(recipient, message);
        } else {
          await this.whatsappClient.sendMessage(recipient, message);
        }
        status = 'sent';
        successCount++;
        console.log(`[NOTIFICATIONS] ✅ Mensagem enviada com sucesso para ${recipient}`);
      } catch (error: any) {
        errorCount++;
        status = 'failed';
        // Extrair mensagem de erro mais detalhada
        const detailedError = error.response?.data?.message || 
                             error.response?.data?.error || 
                             error.message || 
                             'Erro desconhecido ao enviar mensagem';
        errorMessage = detailedError;
        console.error(`[NOTIFICATIONS] ❌ Erro ao enviar para ${recipient}:`, detailedError);
        console.error(`[NOTIFICATIONS] Erro completo:`, {
          message: error.message,
          detailedError,
          stack: error.stack,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url,
        });
        // Continuar para outros destinatários, mas registrar o erro
      } finally {
        // Registrar no log de notificações
        try {
          await this.prisma.whatsAppNotificationLog.create({
            data: {
              template_type: type,
              recipient,
              recipient_type: recipient.includes('@g.us') ? 'group' : 'phone',
              message: message.length > 1000 ? message.substring(0, 1000) + '...' : message, // Limitar tamanho
              status: status as any,
              error_message: errorMessage,
              webhook_event_id: metadata?.webhook_event_id || null,
              position_id: metadata?.position_id || null,
              vault_id: metadata?.vault_id || null,
            },
          });
        } catch (logError: any) {
          // Não falhar se o log falhar
          console.error(`[NOTIFICATIONS] Erro ao registrar log:`, logError.message);
        }
      }
    }

    console.log(`[NOTIFICATIONS] Resumo do envio: ${successCount} sucesso(s), ${errorCount} erro(s) de ${recipients.length} destinatário(s)`);

    // Se todos falharam, lançar erro
    if (errorCount > 0 && successCount === 0) {
      const errorMsg = `Falha ao enviar notificação ${type} para todos os destinatários (${errorCount} erro(s))`;
      console.error(`[NOTIFICATIONS] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    } else if (errorCount > 0) {
      console.warn(`[NOTIFICATIONS] ⚠️ Alguns destinatários falharam: ${successCount} sucesso(s), ${errorCount} erro(s)`);
    } else {
      console.log(`[NOTIFICATIONS] ✅ Todas as mensagens enviadas com sucesso`);
    }
  }

  /**
   * Busca destinatários de email para notificações
   */
  private async getEmailRecipients(
    accountUserId: number,
    configFlag: 'password_reset_enabled' | 'system_alerts_enabled' | 'position_opened_enabled' | 'position_closed_enabled' | 'operations_enabled'
  ): Promise<string[]> {
    const recipients: string[] = [];

    // Buscar todos os admins com notificações habilitadas
    const admins = await this.prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: 'admin',
          },
        },
      },
      include: {
        profile: true,
      },
    });

    for (const admin of admins) {
      const config = await this.prisma.emailNotificationsConfig.findUnique({
        where: { user_id: admin.id },
      });

      if (config?.[configFlag] && admin.email) {
        recipients.push(admin.email);
      }
    }

    // Buscar dono da conta
    const accountOwner = await this.prisma.user.findUnique({
      where: { id: accountUserId },
    });

    if (accountOwner?.email) {
      const ownerConfig = await this.prisma.emailNotificationsConfig.findUnique({
        where: { user_id: accountOwner.id },
      });

      if (ownerConfig?.[configFlag]) {
        if (!recipients.includes(accountOwner.email)) {
          recipients.push(accountOwner.email);
        }
      }
    }

    return recipients;
  }

  /**
   * Busca destinatários para notificações de posição (admins + dono da conta)
   */
  private async getPositionNotificationRecipients(
    accountUserId: number,
    notificationType: 'POSITION_OPENED' | 'POSITION_CLOSED' | 'STOP_LOSS' | 'STOP_GAIN' | 'TAKE_PROFIT' | 'PARTIAL_TP' = 'POSITION_OPENED'
  ): Promise<string[]> {
    const recipients: string[] = [];

    // Determinar qual flag verificar baseado no tipo de notificação
    let configFlag: 'position_opened_enabled' | 'position_closed_enabled' | 'stop_loss_enabled' | 'take_profit_enabled';
    switch (notificationType) {
      case 'POSITION_OPENED':
        configFlag = 'position_opened_enabled';
        break;
      case 'POSITION_CLOSED':
        configFlag = 'position_closed_enabled';
        break;
      case 'STOP_LOSS':
        configFlag = 'stop_loss_enabled';
        break;
      case 'STOP_GAIN':
      case 'TAKE_PROFIT':
      case 'PARTIAL_TP':
        configFlag = 'take_profit_enabled';
        break;
      default:
        configFlag = 'position_opened_enabled';
    }

    // Buscar todos os admins com notificações habilitadas
    const admins = await this.prisma.user.findMany({
      where: {
        roles: {
          some: {
            role: 'admin',
          },
        },
      },
      include: {
        profile: true,
      },
    });

    for (const admin of admins) {
      // Verificar se admin tem notificações habilitadas para este tipo
      const config = await this.prisma.whatsAppNotificationsConfig.findUnique({
        where: { user_id: admin.id },
      });

      if (config?.[configFlag] && admin.profile?.whatsapp_phone) {
        recipients.push(admin.profile.whatsapp_phone);
      }
    }

    // Buscar dono da conta
    const accountOwner = await this.prisma.user.findUnique({
      where: { id: accountUserId },
      include: {
        profile: true,
      },
    });

    if (accountOwner?.profile?.whatsapp_phone) {
      const ownerConfig = await this.prisma.whatsAppNotificationsConfig.findUnique({
        where: { user_id: accountOwner.id },
      });

      if (ownerConfig?.[configFlag]) {
        // Adicionar se ainda não estiver na lista
        if (!recipients.includes(accountOwner.profile.whatsapp_phone)) {
          recipients.push(accountOwner.profile.whatsapp_phone);
        }
      }
    }

    return recipients;
  }

  /**
   * Envia notificação de webhook recebido para grupo
   */
  async sendWebhookAlert(
    webhookEvent: any,
    source: any,
    jobsCreated: number = 0
  ): Promise<void> {
    console.log(`[NOTIFICATIONS] sendWebhookAlert chamado com:`, {
      alert_group_enabled: source.alert_group_enabled,
      alert_group_id: source.alert_group_id,
      eventId: webhookEvent?.id,
      trade_mode: source?.trade_mode,
    });

    if (!source.alert_group_enabled || !source.alert_group_id) {
      console.log('[NOTIFICATIONS] sendWebhookAlert: alert_group_enabled ou alert_group_id não configurado');
      console.log('[NOTIFICATIONS] Valores:', {
        alert_group_enabled: source.alert_group_enabled,
        alert_group_id: source.alert_group_id,
        tipo_alert_group_enabled: typeof source.alert_group_enabled,
        tipo_alert_group_id: typeof source.alert_group_id,
      });
      return;
    }

    console.log(`[NOTIFICATIONS] Enviando notificação de webhook recebido para grupo ${source.alert_group_id}`);
    console.log(`[NOTIFICATIONS] Evento:`, {
      id: webhookEvent.id,
      symbol: webhookEvent.symbol_normalized,
      action: webhookEvent.action,
      jobsCreated,
      trade_mode: source.trade_mode,
    });

    const variables: TemplateVariables = {
      'source.label': source.label || 'Webhook',
      'symbol': webhookEvent.symbol_normalized || webhookEvent.symbol_raw || 'N/A',
      'action': webhookEvent.action === 'BUY_SIGNAL' ? 'BUY' : webhookEvent.action === 'SELL_SIGNAL' ? 'SELL' : 'UNKNOWN',
      'price': webhookEvent.price_reference ? String(webhookEvent.price_reference) : '',
      'timeframe': webhookEvent.timeframe || '',
      'originalText': webhookEvent.raw_text || JSON.stringify(webhookEvent.raw_payload_json || {}),
      'datetime': new Date(),
      'jobsCreated': jobsCreated,
      'eventId': webhookEvent.id || 'N/A',
    };

    // Determinar emoji baseado na ação
    const emoji = webhookEvent.action === 'BUY_SIGNAL' ? '🟢' : webhookEvent.action === 'SELL_SIGNAL' ? '🔴' : '⚪';
    variables['emoji'] = emoji;

    try {
      await this.sendWithTemplate('WEBHOOK_RECEIVED', variables, [source.alert_group_id], {
        webhook_event_id: webhookEvent.id,
      });
      console.log(`[NOTIFICATIONS] ✅ Notificação de webhook recebido enviada com sucesso`);
    } catch (error: any) {
      console.error(`[NOTIFICATIONS] ❌ Falha ao enviar notificação de webhook recebido:`, error.message);
      throw error; // Propagar o erro para que o controller saiba que falhou
    }
  }

  /**
   * Envia notificação de posição aberta
   */
  async sendPositionOpenedAlert(positionId: number): Promise<void> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: {
        exchange_account: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    if (!position) {
      return;
    }

    // Buscar job de abertura e suas execuções
    const openJob = await this.prisma.tradeJob.findUnique({
      where: { id: position.trade_job_id_open },
      include: {
        executions: {
          orderBy: { id: 'desc' },
          take: 1,
        },
      },
    });

    const recipients = await this.getPositionNotificationRecipients(position.exchange_account.user_id, 'POSITION_OPENED');
    if (recipients.length === 0) {
      return;
    }

    // Verificar se já foi enviado
    const existing = await this.prisma.positionAlertSent.findUnique({
      where: {
        position_id_alert_type: {
          position_id: positionId,
          alert_type: 'POSITION_OPENED',
        },
      },
    });

    if (existing) {
      return;
    }

    const execution = openJob?.executions?.[0];
    const qty = position.qty_total.toNumber();
    const avgPrice = execution?.avg_price?.toNumber() || position.price_open.toNumber();
    const total = qty * avgPrice;
    const positionIdShort = position.id.toString().slice(0, 8).toUpperCase();

    const variables: TemplateVariables = {
      'account.label': position.exchange_account.label || 'Conta',
      'symbol': position.symbol,
      'position.id': position.id.toString(),
      'position.idShort': `POS-${positionIdShort}`,
      'qty': qty,
      'avgPrice': avgPrice,
      'total': total,
      'commission': execution?.cumm_quote_qty ? (execution.cumm_quote_qty.toNumber() * 0.001) : 0,
      'commissionAsset': 'USDT',
      'autoAdjusted': execution ? '*Auto-ajustada* (mínimo Binance)' : '',
      'datetime': position.created_at,
    };

    try {
      await this.sendWithTemplate('POSITION_OPENED', variables, recipients, {
        position_id: positionId,
      });
      console.log(`[NOTIFICATIONS] ✅ Notificação WhatsApp de posição aberta enviada para ${recipients.length} destinatário(s)`);
    } catch (error: any) {
      console.error(`[NOTIFICATIONS] ❌ Erro ao enviar notificação WhatsApp de posição aberta:`, error.message);
      console.error(`[NOTIFICATIONS] Stack trace:`, error.stack);
      // Continuar para tentar enviar email mesmo se WhatsApp falhar
    }

    // Enviar email se configurado
    if (this.emailService) {
      try {
        const emailRecipients = await this.getEmailRecipients(position.exchange_account.user_id, 'position_opened_enabled');
        console.log(`[NOTIFICATIONS] Enviando email de posição aberta para ${emailRecipients.length} destinatário(s)`);
        
        if (emailRecipients.length === 0) {
          console.log(`[NOTIFICATIONS] Nenhum destinatário de email configurado para posição aberta`);
        } else {
          for (const email of emailRecipients) {
            try {
              await this.emailService.sendPositionOpenedEmail(email, {
                accountLabel: position.exchange_account.label || 'Conta',
                symbol: position.symbol,
                positionId: position.id.toString(),
                qty,
                avgPrice,
                total,
                datetime: position.created_at,
              });
              console.log(`[NOTIFICATIONS] ✅ Email de posição aberta enviado com sucesso para ${email}`);
            } catch (emailError: any) {
              console.error(`[NOTIFICATIONS] ❌ Erro ao enviar email de posição aberta para ${email}:`, emailError.message);
              console.error(`[NOTIFICATIONS] Erro completo:`, {
                message: emailError.message,
                stack: emailError.stack,
                code: emailError.code,
                response: emailError.response,
              });
              // Continuar para outros destinatários
            }
          }
        }
      } catch (error: any) {
        console.error('[NOTIFICATIONS] ❌ Erro geral ao processar envio de email de posição aberta:', error.message);
        console.error('[NOTIFICATIONS] Stack trace:', error.stack);
        // Não lançar erro para não interromper o fluxo
      }
    } else {
      console.log('[NOTIFICATIONS] EmailService não está configurado. Pulando envio de email.');
    }

    // Registrar envio (sempre registrar, mesmo se houver erros parciais)
    try {
      await this.prisma.positionAlertSent.create({
        data: {
          position_id: positionId,
          alert_type: 'POSITION_OPENED',
        },
      });
      console.log(`[NOTIFICATIONS] ✅ Alerta de posição aberta registrado no banco de dados`);
    } catch (dbError: any) {
      console.error('[NOTIFICATIONS] ❌ Erro ao registrar alerta de posição aberta no banco:', dbError.message);
      // Não lançar erro para não interromper o fluxo
    }
  }

  /**
   * Envia notificação de posição fechada
   */
  async sendPositionClosedAlert(positionId: number): Promise<void> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: {
        exchange_account: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    if (!position || position.status !== 'CLOSED') {
      return;
    }

    // Buscar job de abertura e suas execuções
    const openJob = await this.prisma.tradeJob.findUnique({
      where: { id: position.trade_job_id_open },
      include: {
        executions: true,
      },
    });

    const recipients = await this.getPositionNotificationRecipients(position.exchange_account.user_id, 'POSITION_CLOSED');
    if (recipients.length === 0) {
      return;
    }

    // Verificar se já foi enviado
    const existing = await this.prisma.positionAlertSent.findUnique({
      where: {
        position_id_alert_type: {
          position_id: positionId,
          alert_type: 'POSITION_CLOSED',
        },
      },
    });

    if (existing) {
      return;
    }

    // Buscar execuções de compra e venda
    const buyExecution = openJob?.executions?.[0];
    const buyQty = position.qty_total.toNumber();
    const buyAvgPrice = buyExecution?.avg_price?.toNumber() || position.price_open.toNumber();
    const buyTotal = buyQty * buyAvgPrice;

    // Buscar execuções de venda (jobs SELL relacionados)
    // TradeJob não tem position_open_id, então buscar por posição através de PositionFill
    const sellExecutions = await this.prisma.tradeExecution.findMany({
      where: {
        position_fills: {
          some: {
            position_id: positionId,
          },
        },
        trade_job: {
          side: 'SELL',
        },
      },
      include: {
        trade_job: true,
      },
    });

    let sellQty = 0;
    let sellAvgPrice = 0;
    let sellTotal = 0;

    for (const exec of sellExecutions) {
      const execQty = exec.executed_qty.toNumber();
      sellQty += execQty;
      sellTotal += exec.executed_qty.toNumber() * exec.avg_price.toNumber();
    }

    if (sellQty > 0) {
      sellAvgPrice = sellTotal / sellQty;
    }

    const profit = sellTotal - buyTotal;
    const profitPct = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;
    const positionIdShort = position.id.toString().slice(0, 8).toUpperCase();

    // Calcular duração
    const durationMs = position.closed_at 
      ? new Date(position.closed_at).getTime() - new Date(position.created_at).getTime()
      : 0;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const duration = `${hours}h ${minutes}min`;

    // Determinar motivo do fechamento
    let closeReasonText = '';
    if (position.close_reason?.includes('STOP_LOSS')) {
      closeReasonText = '🛑 *Fechado por Stop Loss*';
    } else if (position.close_reason?.includes('STOP_GAIN')) {
      closeReasonText = '🎯 *Fechado por Stop Gain (Saída Antecipada)*';
    } else if (position.close_reason?.includes('TAKE_PROFIT')) {
      closeReasonText = '🎯 *Fechado por Take Profit*';
    } else if (position.close_reason?.includes('TRAILING')) {
      closeReasonText = '📈 *Fechado por Trailing Stop*';
    } else if (position.close_reason?.includes('WEBHOOK')) {
      closeReasonText = '🔄 *Venda auto-ajustada*';
    }

    const variables: TemplateVariables = {
      'account.label': position.exchange_account.label || 'Conta',
      'symbol': position.symbol,
      'position.id': position.id.toString(),
      'position.idShort': `POS-${positionIdShort}`,
      'buyQty': buyQty,
      'buyAvgPrice': buyAvgPrice,
      'buyTotal': buyTotal,
      'sellQty': sellQty,
      'sellAvgPrice': sellAvgPrice,
      'sellTotal': sellTotal,
      'profitPct': profitPct,
      'profit': profit,
      'duration': duration,
      'closeReason': closeReasonText,
      'datetime': position.closed_at || position.updated_at,
    };

    await this.sendWithTemplate('POSITION_CLOSED', variables, recipients, {
      position_id: positionId,
    });

    // Enviar email se configurado
    if (this.emailService) {
      try {
        const emailRecipients = await this.getEmailRecipients(position.exchange_account.user_id, 'position_closed_enabled');
        for (const email of emailRecipients) {
          await this.emailService.sendPositionClosedEmail(email, {
            accountLabel: position.exchange_account.label || 'Conta',
            symbol: position.symbol,
            positionId: position.id.toString(),
            buyQty,
            buyAvgPrice,
            buyTotal,
            sellQty,
            sellAvgPrice,
            sellTotal,
            profit,
            profitPct,
            duration,
            closeReason: closeReasonText,
            datetime: position.closed_at || position.updated_at,
          });
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Erro ao enviar email de posição fechada:', error);
      }
    }

    // Registrar envio
    await this.prisma.positionAlertSent.create({
      data: {
        position_id: positionId,
        alert_type: 'POSITION_CLOSED',
      },
    });
  }

  /**
   * Envia notificação de Stop Loss acionado
   */
  async sendStopLossAlert(positionId: number, executionId: number): Promise<void> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: {
        exchange_account: true,
      },
    });

    const execution = await this.prisma.tradeExecution.findUnique({
      where: { id: executionId },
    });

    if (!position || !execution) {
      return;
    }

    const recipients = await this.getPositionNotificationRecipients(position.exchange_account.user_id, 'STOP_LOSS');
    if (recipients.length === 0) {
      return;
    }

    const qty = execution.executed_qty.toNumber();
    const sellPrice = execution.avg_price.toNumber();
    const total = qty * sellPrice;
    const buyPrice = position.price_open.toNumber();
    const profitPct = ((sellPrice - buyPrice) / buyPrice) * 100;
    const positionIdShort = position.id.toString().slice(0, 8).toUpperCase();
    const limitPct = position.sl_pct?.toNumber() || 0;

    const variables: TemplateVariables = {
      'account.label': position.exchange_account.label || 'Conta',
      'symbol': position.symbol,
      'position.id': position.id.toString(),
      'position.idShort': `POS-${positionIdShort}`,
      'qty': qty,
      'profitPct': profitPct,
      'sellPrice': sellPrice,
      'total': total,
      'limitPct': limitPct,
      'datetime': new Date(),
    };

    await this.sendWithTemplate('STOP_LOSS_TRIGGERED', variables, recipients, {
      position_id: positionId,
    });

    // Enviar email se configurado (usando operation-alert para stop loss)
    if (this.emailService) {
      try {
        const emailRecipients = await this.getEmailRecipients(position.exchange_account.user_id, 'operations_enabled');
        for (const email of emailRecipients) {
          await this.emailService.sendOperationAlert(email, {
            type: 'STOP_LOSS',
            message: `Stop Loss acionado para ${position.symbol}`,
            details: {
              positionId: position.id,
              symbol: position.symbol,
              qty,
              sellPrice,
              profitPct,
              limitPct,
            },
            datetime: new Date(),
          });
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Erro ao enviar email de stop loss:', error);
      }
    }
  }

  /**
   * Envia notificação de Stop Gain acionado
   */
  async sendStopGainAlert(positionId: number, executionId: number): Promise<void> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: {
        exchange_account: true,
      },
    });

    const execution = await this.prisma.tradeExecution.findUnique({
      where: { id: executionId },
    });

    if (!position || !execution) {
      return;
    }

    const recipients = await this.getPositionNotificationRecipients(position.exchange_account.user_id, 'STOP_GAIN');
    if (recipients.length === 0) {
      return;
    }

    const qty = execution.executed_qty.toNumber();
    const sellPrice = execution.avg_price.toNumber();
    const total = qty * sellPrice;
    const buyPrice = position.price_open.toNumber();
    const profitPct = ((sellPrice - buyPrice) / buyPrice) * 100;
    const positionIdShort = position.id.toString().slice(0, 8).toUpperCase();
    const sgPct = position.sg_pct?.toNumber() || 0;
    const tpPct = position.tp_pct?.toNumber() || 0;

    const variables: TemplateVariables = {
      'account.label': position.exchange_account.label || 'Conta',
      'symbol': position.symbol,
      'qty': qty,
      'sellPrice': sellPrice,
      'total': total,
      'buyPrice': buyPrice,
      'profitPct': profitPct,
      'positionId': positionIdShort,
      'sgPct': sgPct,
      'tpPct': tpPct,
      'datetime': new Date(),
    };

    await this.sendWithTemplate('STOP_GAIN_TRIGGERED', variables, recipients);

    // Enviar email se configurado
    if (this.emailService) {
      try {
        const emailRecipients = await this.getEmailRecipients(position.exchange_account.user_id, 'operations_enabled');
        for (const email of emailRecipients) {
          await this.emailService.sendOperationAlert(email, {
            type: 'STOP_GAIN',
            message: `Stop Gain acionado para ${position.symbol} - Saída antecipada com ${profitPct.toFixed(2)}%`,
            details: {
              positionId: position.id,
              symbol: position.symbol,
              qty,
              sellPrice,
              profitPct,
              sgPct,
              tpPct,
            },
            datetime: new Date(),
          });
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Erro ao enviar email de stop gain:', error);
      }
    }
  }

  /**
   * Envia notificação de Trailing Stop Gain acionado
   */
  async sendTrailingStopGainAlert(positionId: number, executionId: number): Promise<void> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: {
        exchange_account: true,
      },
    });

    const execution = await this.prisma.tradeExecution.findUnique({
      where: { id: executionId },
    });

    if (!position || !execution) {
      return;
    }

    const recipients = await this.getPositionNotificationRecipients(position.exchange_account.user_id, 'TRAILING_STOP_GAIN');
    if (recipients.length === 0) {
      return;
    }

    const qty = execution.executed_qty.toNumber();
    const sellPrice = execution.avg_price.toNumber();
    const total = qty * sellPrice;
    const buyPrice = position.price_open.toNumber();
    const profitPct = ((sellPrice - buyPrice) / buyPrice) * 100;
    const positionIdShort = position.id.toString().slice(0, 8).toUpperCase();
    const tsgActivationPct = position.tsg_activation_pct?.toNumber() || 0;
    const tsgDropPct = position.tsg_drop_pct?.toNumber() || 0;
    const tsgMaxPnlPct = position.tsg_max_pnl_pct?.toNumber() || 0;

    const variables: TemplateVariables = {
      'account.label': position.exchange_account.label || 'Conta',
      'symbol': position.symbol,
      'qty': qty,
      'sellPrice': sellPrice,
      'total': total,
      'buyPrice': buyPrice,
      'profitPct': profitPct,
      'positionId': positionIdShort,
      'tsgActivationPct': tsgActivationPct,
      'tsgDropPct': tsgDropPct,
      'tsgMaxPnlPct': tsgMaxPnlPct,
      'datetime': new Date(),
    };

    await this.sendWithTemplate('TRAILING_STOP_GAIN_TRIGGERED', variables, recipients);

    // Enviar email se configurado
    if (this.emailService) {
      try {
        const emailRecipients = await this.getEmailRecipients(position.exchange_account.user_id, 'operations_enabled');
        for (const email of emailRecipients) {
          await this.emailService.sendOperationAlert(email, {
            type: 'TRAILING_STOP_GAIN',
            message: `Trailing Stop Gain acionado para ${position.symbol} - Venda em ${profitPct.toFixed(2)}% (Pico: ${tsgMaxPnlPct.toFixed(2)}%)`,
            details: {
              positionId: position.id,
              symbol: position.symbol,
              qty,
              sellPrice,
              profitPct,
              tsgActivationPct,
              tsgDropPct,
              tsgMaxPnlPct,
            },
            datetime: new Date(),
          });
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Erro ao enviar email de trailing stop gain:', error);
      }
    }
  }

  /**
   * Envia notificação de Take Profit parcial
   */
  async sendPartialTPAlert(positionId: number, executionId: number): Promise<void> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: {
        exchange_account: true,
      },
    });

    const execution = await this.prisma.tradeExecution.findUnique({
      where: { id: executionId },
    });

    if (!position || !execution) {
      return;
    }

    const recipients = await this.getPositionNotificationRecipients(position.exchange_account.user_id, 'PARTIAL_TP');
    if (recipients.length === 0) {
      return;
    }

    const qtySold = execution.executed_qty.toNumber();
    const qtyRemaining = position.qty_remaining.toNumber();
    const sellPrice = execution.avg_price.toNumber();
    const total = qtySold * sellPrice;
    const buyPrice = position.price_open.toNumber();
    const profitPct = ((sellPrice - buyPrice) / buyPrice) * 100;
    const positionIdShort = position.id.toString().slice(0, 8).toUpperCase();

    const variables: TemplateVariables = {
      'account.label': position.exchange_account.label || 'Conta',
      'symbol': position.symbol,
      'position.id': position.id.toString(),
      'position.idShort': `POS-${positionIdShort}`,
      'qtySold': qtySold,
      'qtyRemaining': qtyRemaining,
      'profitPct': profitPct,
      'sellPrice': sellPrice,
      'total': total,
      'datetime': new Date(),
    };

    await this.sendWithTemplate('PARTIAL_TP_TRIGGERED', variables, recipients, {
      position_id: positionId,
    });

    // Enviar email se configurado (usando operation-alert para partial TP)
    if (this.emailService) {
      try {
        const emailRecipients = await this.getEmailRecipients(position.exchange_account.user_id, 'operations_enabled');
        for (const email of emailRecipients) {
          await this.emailService.sendOperationAlert(email, {
            type: 'PARTIAL_TP',
            message: `Take Profit parcial acionado para ${position.symbol}`,
            details: {
              positionId: position.id,
              symbol: position.symbol,
              qtySold,
              qtyRemaining,
              sellPrice,
              profitPct,
            },
            datetime: new Date(),
          });
        }
      } catch (error) {
        console.error('[NOTIFICATIONS] Erro ao enviar email de partial TP:', error);
      }
    }
  }

  /**
   * Envia mensagem de teste
   */
  async sendTestMessage(phone: string, config: any): Promise<void> {
    const variables: TemplateVariables = {
      'instanceName': config.instance_name || 'N/A',
      'datetime': new Date(),
    };

    await this.sendWithTemplate('TEST_MESSAGE', variables, [phone]);
  }

  // Método legado mantido para compatibilidade
  async sendPositionAlert(positionId: number, alertType: 'OPENED' | 'CLOSED' | 'STOP_LOSS' | 'TAKE_PROFIT'): Promise<void> {
    switch (alertType) {
      case 'OPENED':
        await this.sendPositionOpenedAlert(positionId);
        break;
      case 'CLOSED':
        await this.sendPositionClosedAlert(positionId);
        break;
      case 'STOP_LOSS':
        // Precisa do executionId, usar método específico sendStopLossAlert
        break;
      case 'TAKE_PROFIT':
        // Precisa do executionId, usar método específico sendPartialTPAlert
        break;
    }
  }
}

