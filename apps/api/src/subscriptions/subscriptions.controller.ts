import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { MercadoPagoService } from './mercadopago.service';
import { TransFiService } from './transfi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from './guards/subscription.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { validateCpf } from '../common/utils/cpf-validation';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(
    private subscriptionsService: SubscriptionsService,
    private mercadoPagoService: MercadoPagoService,
    private transfiService: TransFiService,
    private prisma: PrismaService
  ) {}

  @Get('mercadopago/public-key')
  @ApiOperation({ summary: 'Obter public key do Mercado Pago (público)' })
  @ApiResponse({ status: 200, description: 'Public key do Mercado Pago' })
  async getMercadoPagoPublicKey(): Promise<{ public_key: string }> {
    const config = await this.prisma.mercadoPagoConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      throw new NotFoundException('Configuração do Mercado Pago não encontrada');
    }

    return {
      public_key: config.public_key,
    };
  }

  @Get('plans')
  @ApiOperation({ summary: 'Listar planos ativos' })
  @ApiResponse({ status: 200, description: 'Lista de planos disponíveis' })
  async getPlans(): Promise<any[]> {
    return this.subscriptionsService.getActivePlans();
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Criar checkout de assinatura' })
  @ApiResponse({ status: 201, description: 'Checkout criado com sucesso' })
  async createCheckout(@Body() dto: any) {
    // Validar CPF
    if (dto.cpf && !validateCpf(dto.cpf)) {
      throw new BadRequestException('CPF inválido. Verifique os dígitos verificadores.');
    }

    const billingPeriod = dto.billing_period as 'monthly' | 'quarterly';
    
    return this.subscriptionsService.createCheckout({
      planId: dto.plan_id,
      billingPeriod,
      subscriberData: {
        email: dto.email,
        fullName: dto.full_name,
        cpf: dto.cpf,
        birthDate: dto.birth_date ? new Date(dto.birth_date) : new Date(),
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        address: {
          street: dto.address_street,
          number: dto.address_number,
          complement: dto.address_complement,
          neighborhood: dto.address_neighborhood,
          city: dto.address_city,
          state: dto.address_state,
          zipcode: dto.address_zipcode,
        },
      },
    });
  }

  @Get('my-subscription')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter minha assinatura' })
  @ApiResponse({ status: 200, description: 'Detalhes da assinatura do usuário' })
  async getMySubscription(@CurrentUser() user: any): Promise<any> {
    return this.subscriptionsService.getMySubscription(user.userId);
  }

  @Get('my-plan')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter detalhes do meu plano' })
  @ApiResponse({ status: 200, description: 'Detalhes do plano atual' })
  async getMyPlan(@CurrentUser() user: any): Promise<any> {
    const subscription = await this.subscriptionsService.getMySubscription(user.userId);
    return {
      plan: subscription.plan,
      status: subscription.status,
      start_date: subscription.start_date,
      end_date: subscription.end_date,
      auto_renew: subscription.auto_renew,
    };
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancelar assinatura' })
  @ApiResponse({ status: 200, description: 'Assinatura cancelada com sucesso' })
  async cancelSubscription(@CurrentUser() user: any) {
    return this.subscriptionsService.cancelSubscription(user.userId);
  }

  @Post('renew')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renovar assinatura' })
  @ApiResponse({ status: 200, description: 'Renovação iniciada' })
  async renewSubscription(
    @CurrentUser() user: any,
    @Body() body: { billing_period: 'monthly' | 'quarterly' }
  ) {
    return this.subscriptionsService.renewSubscription(user.userId, body.billing_period);
  }

  @Post('register')
  @ApiOperation({ summary: 'Finalizar registro após pagamento' })
  @ApiResponse({ status: 200, description: 'Registro concluído' })
  async completeRegistration(@Body() dto: { token: string; password: string; email: string }) {
    return this.subscriptionsService.completeRegistration(dto.token, dto.password, dto.email);
  }

  @Post('webhooks/mercadopago')
  @ApiOperation({ summary: 'Webhook do Mercado Pago para notificações de pagamento' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  async handleMercadoPagoWebhook(
    @Request() req: any,
    @Body() body: any
  ) {
    try {
      // Log do webhook recebido para debug
      this.logger.log(`Webhook Mercado Pago recebido: ${JSON.stringify(body)}`);
      
      // O Mercado Pago pode enviar webhooks em diferentes formatos
      // Formato 1: { type: 'payment', action: 'payment.created', data: { id: '123' } }
      // Formato 2: { action: 'payment.created', data: { id: '123' } }
      // Formato 3: { type: 'payment', data: { id: '123' } }
      // Formato 4: Query string com data_id
      
      let paymentId: string | null = null;
      let eventType: string | null = null;
      
      // Tentar extrair payment_id de diferentes formatos
      // O Mercado Pago pode enviar como número, então converter para string
      if (body.data?.id) {
        paymentId = String(body.data.id);
      } else if (body.data_id) {
        paymentId = String(body.data_id);
      } else if (req.query?.data_id) {
        paymentId = String(req.query.data_id);
      } else if (body.id && body.type === 'payment') {
        paymentId = String(body.id);
      }
      
      if (body.type) {
        eventType = body.type;
      } else if (body.action) {
        // Extrair tipo do action (ex: 'payment.created' -> 'payment')
        eventType = body.action.split('.')[0];
      }
      
      if (!paymentId) {
        this.logger.warn('Webhook recebido sem payment_id identificável');
        return { status: 'ok', message: 'Webhook recebido mas sem payment_id' };
      }
      
      // Validar assinatura do webhook se configurado
      const xSignature = req.headers['x-signature'] || req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'] || req.headers['x-request-id'];
      
      if (xSignature && xRequestId && paymentId) {
        const isValid = await this.mercadoPagoService.validateWebhookSignature(
          xSignature as string,
          xRequestId as string,
          paymentId
        );
        
        if (!isValid) {
          this.logger.warn(`Assinatura do webhook inválida para payment ${paymentId}`);
          // Se a validação falhou mas temos os headers, provavelmente o secret está configurado
          // Se não tiver secret configurado, validateWebhookSignature retorna true
          // Então se chegou aqui e isValid é false, o secret está configurado e a assinatura é inválida
          throw new BadRequestException('Assinatura do webhook inválida');
        }
      }

      // Processar webhook
      // Garantir que IDs sejam strings (o Mercado Pago pode enviar como número)
      const event = {
        id: body.id ? String(body.id) : `event-${Date.now()}`,
        type: eventType || 'payment',
        action: body.action || 'payment.updated',
        data: { id: String(paymentId) },
      };

      await this.mercadoPagoService.processWebhook(event);

      // Se for evento de pagamento, processar pagamento aprovado
      if ((eventType === 'payment' || !eventType) && paymentId) {
        this.logger.log(`Processando pagamento ${paymentId} do webhook`);
        await this.subscriptionsService.processApprovedPayment(paymentId);
      }

      return { status: 'ok', message: 'Webhook processado com sucesso' };
    } catch (error: any) {
      this.logger.error('Erro ao processar webhook do Mercado Pago:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao processar webhook do Mercado Pago'
      );
    }
  }

  @Post('webhook/mercadopago')
  @ApiOperation({ summary: 'Webhook do Mercado Pago para notificações de pagamento (rota alternativa)' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  async handleMercadoPagoWebhookAlt(
    @Request() req: any,
    @Body() body: any
  ) {
    // Chamar o mesmo handler
    return this.handleMercadoPagoWebhook(req, body);
  }

  @Post('webhooks/transfi')
  @ApiOperation({ summary: 'Webhook do TransFi para notificações de pagamento' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  async handleTransFiWebhook(
    @Request() req: any,
    @Body() body: {
      id: string;
      type: string;
      orderId: string;
      status: string;
      data?: any;
    }
  ) {
    try {
      // Validar assinatura do webhook se configurado
      const signature = req.headers['x-transfi-signature'] || req.headers['x-signature'];
      const rawBody = JSON.stringify(body);
      
      if (signature) {
        const config = await this.prisma.transFiConfig.findFirst({
          where: { is_active: true },
          orderBy: { created_at: 'desc' },
        });

        if (config?.webhook_secret_enc) {
          const encryptionService = new (await import('@mvcashnode/shared')).EncryptionService(
            process.env.ENCRYPTION_KEY || ''
          );
          const webhookSecret = await encryptionService.decrypt(config.webhook_secret_enc);
          
          const isValid = await this.transfiService.validateWebhookSignature(
            signature,
            rawBody,
            webhookSecret
          );
          
          if (!isValid) {
            throw new BadRequestException('Assinatura do webhook inválida');
          }
        }
      }

      // Processar webhook
      const event = {
        id: body.id || `event-${Date.now()}`,
        type: body.type,
        orderId: body.orderId,
        status: body.status,
        data: body.data,
      };

      await this.transfiService.processWebhook(event);

      // Se for evento de pagamento aprovado, processar pagamento
      if ((body.type === 'order.status_changed' || body.type === 'payment.completed') && 
          (body.status === 'completed' || body.status === 'approved')) {
        await this.subscriptionsService.processApprovedTransFiPayment(body.orderId);
      }

      return { status: 'ok', message: 'Webhook processado com sucesso' };
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Erro ao processar webhook do TransFi'
      );
    }
  }

  @Post('webhook/transfi')
  @ApiOperation({ summary: 'Webhook do TransFi para notificações de pagamento (rota alternativa)' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  async handleTransFiWebhookAlt(
    @Request() req: any,
    @Body() body: {
      id: string;
      type: string;
      orderId: string;
      status: string;
      data?: any;
    }
  ) {
    // Chamar o mesmo handler
    return this.handleTransFiWebhook(req, body);
  }
}
