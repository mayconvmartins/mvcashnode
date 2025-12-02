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

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

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
    const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';

    // Get webhook source
    const source = await this.webhooksService
      .getSourceService()
      .getSourceByCode(code);

    if (!source || !source.is_active || source.admin_locked) {
      throw new HttpException('Webhook source not found or inactive', HttpStatus.NOT_FOUND);
    }

    // Validate IP
    const isValidIP = await this.webhooksService
      .getSourceService()
      .validateIP(code, ip);

    if (!isValidIP) {
      throw new HttpException('IP not authorized', HttpStatus.FORBIDDEN);
    }

    // Validate signature if required
    if (source.require_signature) {
      const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const isValidSignature = await this.webhooksService
        .getSourceService()
        .validateSignature(code, bodyString, signature || '');

      if (!isValidSignature) {
        throw new HttpException('Invalid signature', HttpStatus.FORBIDDEN);
      }
    }

    // Check rate limit
    const canProceed = await this.webhooksService
      .getSourceService()
      .checkRateLimit(code);

    if (!canProceed) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Process webhook for each bound account
    const eventUid = this.generateEventUid(payload);
    let accountsTriggered = 0;

    for (const binding of source.bindings || []) {
      if (!binding.is_active) continue;

      try {
        const result = await this.webhooksService.getEventService().createEvent({
          webhookSourceId: source.id,
          targetAccountId: binding.exchange_account_id,
          tradeMode: source.trade_mode,
          eventUid: `${eventUid}-${binding.exchange_account_id}`,
          payload,
        });

        if (result.jobsCreated > 0) {
          accountsTriggered++;
        }
      } catch (error) {
        // Log error but continue
        console.error(`Failed to process webhook for binding ${binding.id}:`, error);
      }
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

