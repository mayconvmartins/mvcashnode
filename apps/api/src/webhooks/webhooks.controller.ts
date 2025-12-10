import {
  Controller,
  Post,
  Param,
  Headers,
  Request,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
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
  private readonly logger = new Logger(WebhooksController.name);

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
    // ✅ BUG-CRIT-004 FIX: Validar tamanho do payload antes de processar
    const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB
    const payloadSize = req.rawBody?.length || (typeof req.body === 'string' ? Buffer.byteLength(req.body, 'utf8') : JSON.stringify(req.body || {}).length);
    
    if (payloadSize > MAX_PAYLOAD_SIZE) {
      throw new HttpException(
        `Payload size (${(payloadSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (10MB)`,
        HttpStatus.PAYLOAD_TOO_LARGE
      );
    }
    
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
    
    // ✅ BUG-CRIT-002 FIX: Usar logger estruturado ao invés de console.log
    this.logger.debug(`Recebendo requisição para código: ${code}`, {
      ip,
      contentType,
      payloadSize,
      hasRawBody: !!req.rawBody,
      hasSignature: !!signature,
    });
    
    if (contentType.includes('text/plain')) {
      // Para text/plain, usar rawBody ou body como string
      if (req.rawBody) {
        payload = req.rawBody.toString('utf8').trim();
      } else if (typeof req.body === 'string') {
        payload = req.body.trim();
      } else {
        // Fallback: tentar converter body para string
        payload = req.body ? String(req.body).trim() : '';
      }
    } else if (contentType.includes('application/json')) {
      // Para JSON, usar body parseado
      payload = req.body || {};
    } else {
      // Para outros tipos, tentar rawBody primeiro, depois body
      if (req.rawBody) {
        try {
          // Tentar parsear como JSON
          payload = JSON.parse(req.rawBody.toString('utf8'));
        } catch (e) {
          // Se não for JSON, usar como string
          payload = req.rawBody.toString('utf8').trim();
        }
      } else {
        payload = req.body || {};
      }
    }
    
    // Log apenas tipo do payload em produção, não o conteúdo completo
    this.logger.debug(`Payload processado`, {
      payloadType: typeof payload,
      payloadSize: typeof payload === 'string' ? payload.length : JSON.stringify(payload).length,
    });

    // Get webhook source
    const source = await this.webhooksService
      .getSourceService()
      .getSourceByCode(code);

    if (!source) {
      this.logger.error(`Webhook source não encontrado para código: ${code}`);
      throw new HttpException('Webhook não encontrado ou inativo', HttpStatus.NOT_FOUND);
    }

    if (!source.is_active) {
      this.logger.error(`Webhook source ${code} está inativo`);
      throw new HttpException('Webhook não encontrado ou inativo', HttpStatus.NOT_FOUND);
    }

    // admin_locked não deve bloquear, apenas marcar como bloqueado pelo admin
    // Mas vamos permitir que funcione mesmo com admin_locked para desenvolvimento
    if (source.admin_locked) {
      this.logger.warn(`Webhook source ${code} está bloqueado pelo admin, mas permitindo para desenvolvimento`);
    }

    // Validate IP
    const isValidIP = await this.webhooksService
      .getSourceService()
      .validateIP(code, ip);

    this.logger.debug(`Validação de IP: ${isValidIP ? 'APROVADO' : 'NEGADO'}`, {
      ip,
      webhookCode: code,
    });

    if (!isValidIP) {
      this.logger.error(`IP ${ip} não autorizado para webhook ${code}`);
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

    // Process webhook - criar apenas UM evento por webhook recebido
    const eventUid = this.generateEventUid(payload);
    let accountsTriggered = 0;
    let notificationSent = false; // Flag para garantir que enviamos apenas uma notificação por webhook

    this.logger.debug(`Processando webhook`, {
      webhookCode: code,
      bindingsCount: source.bindings?.length || 0,
      alertGroupEnabled: source.alert_group_enabled,
      alertGroupId: source.alert_group_id,
    });

    // Encontrar o primeiro binding ativo para usar como targetAccountId do evento
    // O evento será criado uma vez, mas os jobs serão criados para todos os bindings
    const firstActiveBinding = source.bindings?.find(b => b.is_active);
    
    if (!firstActiveBinding) {
      this.logger.warn(`Nenhum binding ativo encontrado para webhook ${code}`);
      // Ainda assim enviar notificação se configurado
      if (source.alert_group_enabled && source.alert_group_id) {
        try {
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
          this.logger.log(`Notificação enviada (sem bindings) para grupo ${source.alert_group_id}`);
        } catch (error: any) {
          this.logger.error(`Erro ao enviar notificação (sem bindings): ${error.message}`, error.stack);
        }
      }
      
      return {
        message: 'Webhook recebido com sucesso',
        event_uid: eventUid,
        accounts_triggered: 0,
      };
    }

    // Criar UM único evento usando o primeiro binding ativo
    // O eventUid será único por webhook (sem sufixo de account_id)
    // Os jobs serão criados para todos os bindings dentro do createJobsFromEvent
    try {
      this.logger.debug(`Criando evento único para webhook`, {
        bindingId: firstActiveBinding.id,
        webhookCode: code,
      });
      const result = await this.webhooksService.getEventService().createEvent({
        webhookSourceId: source.id,
        targetAccountId: firstActiveBinding.exchange_account_id,
        tradeMode: source.trade_mode,
        eventUid: eventUid, // UID único por webhook, sem sufixo de account
        payload,
      });

      this.logger.log(`Evento criado: ID=${result.event?.id}, Jobs criados: ${result.jobsCreated}`, {
        eventId: result.event?.id,
        jobsCreated: result.jobsCreated,
        webhookCode: code,
      });

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

      // Enviar notificação de webhook recebido (apenas uma vez por webhook)
      if (!notificationSent && result.event && source.alert_group_enabled && source.alert_group_id) {
        try {
          this.logger.debug(`Enviando notificação de webhook recebido`, {
            alertGroupId: source.alert_group_id,
            eventId: result.event.id,
            symbol: result.event.symbol_normalized,
            action: result.event.action,
            jobsCreated: result.jobsCreated,
          });
          
          await this.notificationWrapper.sendWebhookAlert(
            result.event,
            source,
            result.jobsCreated || 0,
            result.jobIds || []
          );
          this.logger.log(`Notificação enviada para grupo ${source.alert_group_id}`);
          notificationSent = true;
        } catch (error: any) {
          this.logger.error(`Erro ao enviar notificação: ${error.message}`, error.stack);
          notificationSent = true; // Marcar como enviada para não tentar novamente
        }
      }

      // Enfileirar jobs criados para execução (após enviar notificação)
      if (result.jobIds && result.jobIds.length > 0) {
        try {
          await this.tradeJobQueueService.enqueueTradeJobs(result.jobIds);
          this.logger.log(`${result.jobIds.length} jobs enfileirados para execução`);
        } catch (enqueueError: any) {
          this.logger.error(`Erro ao enfileirar jobs: ${enqueueError.message}`, enqueueError.stack);
        }
      }

      // Contar contas acionadas baseado nos jobs criados
      accountsTriggered = result.jobsCreated > 0 ? (source.bindings?.filter(b => b.is_active).length || 0) : 0;
      
    } catch (error: any) {
      this.logger.error(`Erro ao criar evento: ${error?.message || error}`, error?.stack);
      
      // Tentar enviar notificação de erro se ainda não foi enviada
      if (!notificationSent && source.alert_group_enabled && source.alert_group_id) {
        try {
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
            this.logger.log(`Notificação de erro enviada para grupo ${source.alert_group_id}`);
          }).catch((notifError: any) => {
            this.logger.error(`Erro ao enviar notificação de erro: ${notifError.message}`, notifError.stack);
          });
          notificationSent = true;
        } catch (notifError: any) {
          this.logger.error(`Erro ao iniciar envio de notificação de erro: ${notifError.message}`, notifError.stack);
        }
      }
    }

    this.logger.debug(`Processamento concluído`, {
      webhookCode: code,
      accountsTriggered,
    });
    
    // Se não há bindings ativos, ainda assim enviar notificação se configurado
    if (!notificationSent && source.alert_group_enabled && source.alert_group_id && (!source.bindings || source.bindings.length === 0)) {
      try {
        this.logger.debug(`Nenhum binding ativo, mas enviando notificação de webhook recebido`);
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
        this.logger.log(`Notificação enviada (sem bindings) para grupo ${source.alert_group_id}`);
      } catch (error: any) {
        this.logger.error(`Erro ao enviar notificação (sem bindings): ${error.message}`, error.stack);
      }
    } else if (!notificationSent && source.alert_group_enabled && source.alert_group_id) {
      this.logger.warn(`Notificação não foi enviada. Verifique os logs acima.`, {
        webhookCode: code,
        alertGroupId: source.alert_group_id,
      });
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

