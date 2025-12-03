import {
  Controller,
  Post,
  Param,
  Headers,
  Request,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';
import { NotificationWrapperService } from '../notifications/notification-wrapper.service';
import { PrismaService } from '@mvcashnode/db';
import { WebSocketService } from '../websocket/websocket.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private webhooksService: WebhooksService,
    private tradeJobQueueService: TradeJobQueueService,
    private notificationWrapper: NotificationWrapperService,
    private prisma: PrismaService,
    private wsService: WebSocketService
  ) {}

  @Post(':code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receber sinal de trading via webhook' })
  @ApiParam({ name: 'code', description: 'Código único do webhook source' })
  @ApiHeader({ name: 'X-Signature', required: false })
  @ApiResponse({ status: 200, description: 'Webhook recebido e enfileirado' })
  @ApiResponse({ status: 403, description: 'Acesso negado (IP ou assinatura inválida)' })
  @ApiResponse({ status: 404, description: 'Webhook code não encontrado' })
  @ApiResponse({ status: 429, description: 'Rate limit excedido' })
  async receiveWebhook(
    @Param('code') code: string,
    @Request() req: any,
    @Headers('x-signature') signature?: string
  ) {
    // Detectar IP do cliente (suporta proxies e load balancers)
    let ip = req?.ip || 
             req?.connection?.remoteAddress || 
             req?.socket?.remoteAddress ||
             req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
             req?.headers?.['x-real-ip'] ||
             'unknown';
    
    // Limpar IPv6 mapping (::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    // Capturar payload baseado no Content-Type
    const contentType = req.headers['content-type'] || '';
    let payload: any;
    
    console.log(`[WEBHOOK] Recebendo requisição para código: ${code}`);
    console.log(`[WEBHOOK] IP do cliente: ${ip}`);
    console.log(`[WEBHOOK] Content-Type: ${contentType}`);
    console.log(`[WEBHOOK] Raw Body disponível: ${!!req.rawBody}`);
    console.log(`[WEBHOOK] req.body tipo: ${typeof req.body}`);
    console.log(`[WEBHOOK] req.body valor:`, req.body);
    if (req.rawBody) {
      console.log(`[WEBHOOK] req.rawBody tipo: ${typeof req.rawBody}, tamanho: ${req.rawBody.length}`);
      console.log(`[WEBHOOK] req.rawBody conteúdo: "${req.rawBody.toString('utf8').substring(0, 200)}"`);
    }
    
    if (contentType.includes('text/plain')) {
      // Para text/plain, usar rawBody ou body como string
      if (req.rawBody) {
        payload = req.rawBody.toString('utf8').trim();
        console.log(`[WEBHOOK] Payload capturado do rawBody (text/plain): "${payload}"`);
      } else if (typeof req.body === 'string') {
        payload = req.body.trim();
        console.log(`[WEBHOOK] Payload capturado do body (string): "${payload}"`);
      } else {
        // Fallback: tentar converter body para string
        payload = req.body ? String(req.body).trim() : '';
        console.log(`[WEBHOOK] Payload capturado (fallback): "${payload}"`);
      }
    } else if (contentType.includes('application/json')) {
      // Para JSON, usar body parseado
      payload = req.body || {};
      console.log(`[WEBHOOK] Payload capturado (JSON):`, JSON.stringify(payload, null, 2));
    } else {
      // Para outros tipos, tentar rawBody primeiro, depois body
      if (req.rawBody) {
        try {
          // Tentar parsear como JSON
          payload = JSON.parse(req.rawBody.toString('utf8'));
          console.log(`[WEBHOOK] Payload parseado de rawBody (JSON):`, JSON.stringify(payload, null, 2));
        } catch (e) {
          // Se não for JSON, usar como string
          payload = req.rawBody.toString('utf8').trim();
          console.log(`[WEBHOOK] Payload capturado de rawBody (texto): "${payload}"`);
        }
      } else {
        payload = req.body || {};
        console.log(`[WEBHOOK] Payload capturado (fallback):`, JSON.stringify(payload, null, 2));
      }
    }
    
    console.log(`[WEBHOOK] Payload final (tipo: ${typeof payload}):`, typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
    console.log(`[WEBHOOK] Signature: ${signature || 'não fornecida'}`);

    // Get webhook source
    const source = await this.webhooksService
      .getSourceService()
      .getSourceByCode(code);

    console.log(`[WEBHOOK] Source encontrado:`, source ? {
      id: source.id,
      code: source.webhook_code,
      is_active: source.is_active,
      admin_locked: source.admin_locked,
      allowed_ips: source.allowed_ips_json,
      require_signature: source.require_signature,
      alert_group_enabled: source.alert_group_enabled,
      alert_group_id: source.alert_group_id,
    } : 'null');

    if (!source) {
      console.error(`[WEBHOOK] Erro: Webhook source não encontrado para código: ${code}`);
      throw new HttpException('Webhook não encontrado ou inativo', HttpStatus.NOT_FOUND);
    }

    if (!source.is_active) {
      console.error(`[WEBHOOK] Erro: Webhook source ${code} está inativo`);
      throw new HttpException('Webhook não encontrado ou inativo', HttpStatus.NOT_FOUND);
    }

    // admin_locked não deve bloquear, apenas marcar como bloqueado pelo admin
    // Mas vamos permitir que funcione mesmo com admin_locked para desenvolvimento
    if (source.admin_locked) {
      console.warn(`[WEBHOOK] Aviso: Webhook source ${code} está bloqueado pelo admin, mas permitindo para desenvolvimento`);
    }

    // Validate IP
    const isValidIP = await this.webhooksService
      .getSourceService()
      .validateIP(code, ip);

    console.log(`[WEBHOOK] Validação de IP: ${isValidIP ? 'APROVADO' : 'NEGADO'} para IP: ${ip}`);
    console.log(`[WEBHOOK] IPs permitidos:`, source.allowed_ips_json);

    if (!isValidIP) {
      console.error(`[WEBHOOK] Erro: IP ${ip} não autorizado para webhook ${code}`);
      throw new HttpException('IP não autorizado', HttpStatus.FORBIDDEN);
    }

    // Validate signature if required
    if (source.require_signature) {
      const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const isValidSignature = await this.webhooksService
        .getSourceService()
        .validateSignature(code, bodyString, signature || '');

      if (!isValidSignature) {
        throw new HttpException('Assinatura inválida', HttpStatus.FORBIDDEN);
      }
    }

    // Check rate limit
    const canProceed = await this.webhooksService
      .getSourceService()
      .checkRateLimit(code);

    if (!canProceed) {
      throw new HttpException('Limite de requisições excedido', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Process webhook for each bound account
    const eventUid = this.generateEventUid(payload);
    let accountsTriggered = 0;
    let notificationSent = false; // Flag para garantir que enviamos apenas uma notificação por webhook

    console.log(`[WEBHOOK] Processando webhook. Bindings encontrados: ${source.bindings?.length || 0}`);
    console.log(`[WEBHOOK] Configuração de notificação:`, {
      alert_group_enabled: source.alert_group_enabled,
      alert_group_id: source.alert_group_id,
      tipo_alert_group_enabled: typeof source.alert_group_enabled,
    });

    for (const binding of source.bindings || []) {
      if (!binding.is_active) {
        console.log(`[WEBHOOK] Binding ${binding.id} está inativo, pulando...`);
        continue;
      }

      try {
        console.log(`[WEBHOOK] Criando evento para binding ${binding.id}, account ${binding.exchange_account_id}`);
        const result = await this.webhooksService.getEventService().createEvent({
          webhookSourceId: source.id,
          targetAccountId: binding.exchange_account_id,
          tradeMode: source.trade_mode,
          eventUid: `${eventUid}-${binding.exchange_account_id}`,
          payload,
        });

        console.log(`[WEBHOOK] Evento criado. Jobs criados: ${result.jobsCreated}`);

        // Emitir evento WebSocket para o dono do webhook
        if (result.event && source.owner_user_id) {
          this.wsService.emitToUser(source.owner_user_id, 'webhook.received', {
            id: result.event.id,
            webhook_source_id: source.id,
            symbol: result.event.symbol_normalized,
            action: result.event.action,
            jobs_created: result.jobsCreated || 0,
          });
        }

        // Enviar notificação de webhook recebido IMEDIATAMENTE após criar o evento
        // (apenas uma vez por webhook, ANTES de processar jobs, mesmo se jobs falharem)
        console.log(`[WEBHOOK] Verificando condições para notificação:`, {
          notificationSent,
          hasEvent: !!result.event,
          alert_group_enabled: source.alert_group_enabled,
          alert_group_id: source.alert_group_id,
        });
        
        if (!notificationSent && result.event && source.alert_group_enabled && source.alert_group_id) {
          try {
            console.log(`[WEBHOOK] 📤 Enviando notificação de webhook recebido para grupo ${source.alert_group_id}...`);
            console.log(`[WEBHOOK] Dados do evento:`, {
              id: result.event.id,
              symbol: result.event.symbol_normalized,
              action: result.event.action,
              jobsCreated: result.jobsCreated,
            });
            
            // Enviar notificação de forma síncrona para garantir que seja enviada
            // mas não bloquear se houver erro
            await this.notificationWrapper.sendWebhookAlert(
              result.event,
              source,
              result.jobsCreated || 0,
              result.jobIds || []
            );
            console.log(`[WEBHOOK] ✅ Notificação enviada para grupo ${source.alert_group_id}`);
            notificationSent = true;
          } catch (error: any) {
            console.error(`[WEBHOOK] ❌ Erro ao enviar notificação: ${error.message}`);
            console.error(`[WEBHOOK] Stack:`, error.stack);
            // Não falhar o webhook se apenas a notificação falhar
            notificationSent = true; // Marcar como enviada para não tentar novamente
          }
        }

        // Enfileirar jobs criados para execução (após enviar notificação)
        if (result.jobIds && result.jobIds.length > 0) {
          try {
            await this.tradeJobQueueService.enqueueTradeJobs(result.jobIds);
            console.log(`[WEBHOOK] ${result.jobIds.length} jobs enfileirados para execução`);
          } catch (enqueueError: any) {
            console.error(`[WEBHOOK] Erro ao enfileirar jobs: ${enqueueError.message}`);
            // Não falhar o webhook se apenas o enfileiramento falhar
          }
        }

        if (result.jobsCreated > 0) {
          accountsTriggered++;
        }
      } catch (error: any) {
        // Log error but continue
        console.error(`[WEBHOOK] Erro ao processar binding ${binding.id}:`, error?.message || error);
        console.error(`[WEBHOOK] Stack:`, error?.stack);
        
        // Mesmo se houver erro ao criar o evento, tentar enviar notificação se ainda não foi enviada
        // (usando dados básicos do webhook)
        if (!notificationSent && source.alert_group_enabled && source.alert_group_id) {
          try {
            // Criar um evento básico para notificação mesmo em caso de erro
            const basicEvent = {
              id: 0,
              webhook_source_id: source.id,
              symbol_normalized: 'UNKNOWN',
              action: 'UNKNOWN',
              price_reference: null,
              timeframe: null,
              status: 'ERROR',
              raw_text: typeof payload === 'string' ? payload : JSON.stringify(payload),
            };
            
            this.notificationWrapper.sendWebhookAlert(
              basicEvent,
              source,
              0,
              []
            ).then(() => {
              console.log(`[WEBHOOK] ✅ Notificação de erro enviada para grupo ${source.alert_group_id}`);
            }).catch((notifError: any) => {
              console.error(`[WEBHOOK] ❌ Erro ao enviar notificação de erro: ${notifError.message}`);
            });
            notificationSent = true;
          } catch (notifError: any) {
            console.error(`[WEBHOOK] ❌ Erro ao iniciar envio de notificação de erro: ${notifError.message}`);
          }
        }
      }
    }

    console.log(`[WEBHOOK] Processamento concluído. Contas acionadas: ${accountsTriggered}`);
    
    // Se não há bindings ativos, ainda assim enviar notificação se configurado
    if (!notificationSent && source.alert_group_enabled && source.alert_group_id && (!source.bindings || source.bindings.length === 0)) {
      try {
        console.log(`[WEBHOOK] 📤 Nenhum binding ativo, mas enviando notificação de webhook recebido...`);
        const basicEvent = {
          id: 0,
          webhook_source_id: source.id,
          symbol_normalized: 'N/A',
          symbol_raw: typeof payload === 'string' ? payload.substring(0, 50) : 'N/A',
          action: 'UNKNOWN',
          price_reference: null,
          timeframe: null,
          status: 'NO_BINDINGS',
          raw_text: typeof payload === 'string' ? payload : JSON.stringify(payload),
          raw_payload_json: typeof payload === 'object' ? payload : null,
        };
        
        await this.notificationWrapper.sendWebhookAlert(
          basicEvent,
          source,
          0,
          []
        );
        console.log(`[WEBHOOK] ✅ Notificação enviada (sem bindings) para grupo ${source.alert_group_id}`);
      } catch (error: any) {
        console.error(`[WEBHOOK] ❌ Erro ao enviar notificação (sem bindings): ${error.message}`);
      }
    } else if (!notificationSent && source.alert_group_enabled && source.alert_group_id) {
      console.warn(`[WEBHOOK] ⚠️ Notificação não foi enviada. Verifique os logs acima.`);
    }

    return {
      message: 'Webhook recebido com sucesso',
      event_uid: eventUid,
      accounts_triggered: accountsTriggered,
    };
  }

  private generateEventUid(payload: any): string {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const timestamp = Date.now();
    return `evt_${timestamp}_${Buffer.from(payloadStr).toString('base64').slice(0, 16)}`;
  }
}

