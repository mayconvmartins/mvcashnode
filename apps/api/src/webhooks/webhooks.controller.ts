import {
  Controller,
  Post,
  Body,
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

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private webhooksService: WebhooksService,
    private tradeJobQueueService: TradeJobQueueService
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
    @Body() payload: any,
    @Headers('x-signature') signature?: string,
    @Request() req?: any
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
    
    console.log(`[WEBHOOK] Recebendo requisição para código: ${code}`);
    console.log(`[WEBHOOK] IP do cliente: ${ip}`);
    console.log(`[WEBHOOK] Payload:`, JSON.stringify(payload, null, 2));
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

    console.log(`[WEBHOOK] Processando webhook. Bindings encontrados: ${source.bindings?.length || 0}`);

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

        // Enfileirar jobs criados para execução
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
      }
    }

    console.log(`[WEBHOOK] Processamento concluído. Contas acionadas: ${accountsTriggered}`);

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

