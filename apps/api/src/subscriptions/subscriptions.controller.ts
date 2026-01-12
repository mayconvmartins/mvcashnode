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
import { MvmPayService } from './mvm-pay.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from './guards/subscription.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { validateCpf } from '../common/utils/cpf-validation';
import { PrismaService } from '@mvcashnode/db';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(
    private subscriptionsService: SubscriptionsService,
    private mercadoPagoService: MercadoPagoService,
    private transfiService: TransFiService,
    private mvmPayService: MvmPayService,
    private prisma: PrismaService,
    private configService: ConfigService,
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
    // Se o provider for MvM Pay, o checkout é externo (redirect)
    const providerSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'subscription_provider' },
    });
    const provider = providerSetting?.value || 'native';

    if (provider === 'mvm_pay') {
      if (!dto.email) {
        throw new BadRequestException('Email é obrigatório');
      }

      const plan = await this.prisma.subscriptionPlan.findUnique({
        where: { id: dto.plan_id },
      });
      if (!plan || !plan.is_active) {
        throw new BadRequestException('Plano inválido ou inativo');
      }
      if (!plan.mvm_pay_plan_id) {
        throw new BadRequestException('Plano sem mapeamento para MvM Pay (mvm_pay_plan_id)');
      }

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
      const returnUrl = `${frontendUrl}/subscribe/mvm-pay/return`;
      const state = crypto.randomUUID();

      const checkoutUrl = await this.mvmPayService.buildSignedCheckoutUrl({
        email: dto.email,
        planId: plan.mvm_pay_plan_id,
        returnUrl,
        state,
      });

      return {
        provider: 'mvm_pay',
        checkout_url: checkoutUrl,
        state,
      };
    }

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
  @UseGuards(JwtAuthGuard) // Removido SubscriptionGuard para permitir acesso mesmo com assinatura inativa
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter minha assinatura' })
  @ApiResponse({ status: 200, description: 'Detalhes da assinatura do usuário' })
  async getMySubscription(@CurrentUser() user: any): Promise<any> {
    // Permitir acesso mesmo se assinatura estiver inativa/expirada
    // Retorna null se não encontrar assinatura
    return await this.subscriptionsService.getMySubscription(user.userId);
  }

  @Get('my-plan')
  @UseGuards(JwtAuthGuard) // Removido SubscriptionGuard para permitir acesso mesmo com assinatura inativa
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter detalhes do meu plano' })
  @ApiResponse({ status: 200, description: 'Detalhes do plano atual' })
  async getMyPlan(@CurrentUser() user: any): Promise<any> {
    // Permitir acesso mesmo se assinatura estiver inativa/expirada
    const subscription = await this.subscriptionsService.getMySubscription(user.userId);
    
    if (!subscription) {
      return null;
    }
    
    return {
      plan: subscription.plan,
      status: subscription.status,
      start_date: subscription.start_date,
      end_date: subscription.end_date,
      auto_renew: subscription.auto_renew,
    };
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard) // Removido SubscriptionGuard - assinante pode cancelar mesmo com assinatura inativa
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancelar assinatura' })
  @ApiResponse({ status: 200, description: 'Assinatura cancelada com sucesso' })
  async cancelSubscription(@CurrentUser() user: any) {
    return this.subscriptionsService.cancelSubscription(user.userId);
  }

  @Post('renew')
  @UseGuards(JwtAuthGuard) // Removido SubscriptionGuard - assinante pode renovar mesmo com assinatura inativa
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
  async completeRegistration(@Body() dto: { token?: string; password: string; email?: string }) {
    return this.subscriptionsService.completeRegistration(dto.token || '', dto.password, dto.email);
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
      // A ferramenta de teste do Mercado Pago pode não enviar headers de assinatura
      const xSignature = req.headers['x-signature'] || req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'] || req.headers['x-request-id'];
      
      // Só validar se ambos os headers estiverem presentes
      // Se não estiverem presentes, assumir que é um teste ou ambiente de desenvolvimento
      if (xSignature && xRequestId && paymentId) {
        try {
          const isValid = await this.mercadoPagoService.validateWebhookSignature(
            xSignature as string,
            xRequestId as string,
            paymentId
          );
          
          if (!isValid) {
            this.logger.warn(`Assinatura do webhook inválida para payment ${paymentId}`);
            // Em ambiente de teste/desenvolvimento, apenas logar o aviso
            // Em produção, você pode querer lançar o erro
            const isProduction = process.env.NODE_ENV === 'production';
            if (isProduction) {
              throw new BadRequestException('Assinatura do webhook inválida');
            } else {
              this.logger.warn('Assinatura inválida, mas continuando em ambiente não-produção');
            }
          }
        } catch (error: any) {
          // Se houver erro na validação, logar mas não bloquear em ambiente de teste
          this.logger.warn(`Erro ao validar assinatura: ${error.message}`);
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction && error instanceof BadRequestException) {
            throw error;
          }
        }
      } else {
        this.logger.debug('Webhook recebido sem headers de assinatura (pode ser teste)');
      }

      // Processar webhook
      // Garantir que IDs sejam strings (o Mercado Pago pode enviar como número)
      const event = {
        id: body.id ? String(body.id) : `event-${Date.now()}`,
        type: eventType || 'payment',
        action: body.action || 'payment.updated',
        data: { id: String(paymentId) },
      };

      try {
        await this.mercadoPagoService.processWebhook(event);
      } catch (error: any) {
        // Logar erro mas não bloquear o webhook
        this.logger.error(`Erro ao processar webhook no service: ${error.message}`, error);
        // Continuar processamento mesmo se houver erro ao salvar o evento
      }

      // Se for evento de pagamento, processar pagamento (verificar status real)
      if ((eventType === 'payment' || !eventType) && paymentId) {
        try {
          this.logger.log(`Processando pagamento ${paymentId} do webhook`);
          
          // Buscar status real do pagamento no Mercado Pago
          const payment = await this.mercadoPagoService.getPayment(paymentId);
          this.logger.log(`Status do pagamento ${paymentId} no Mercado Pago: ${payment.status}, Preference ID: ${payment.preference_id || 'N/A'}`);
          
          // Processar pagamento (criar registro, atualizar mp_payment_id na assinatura e ativar se aprovado)
          // O método processApprovedPayment já atualiza o mp_payment_id na assinatura quando encontra
          await this.subscriptionsService.processApprovedPayment(paymentId);
          
          this.logger.log(`Pagamento ${paymentId} processado com sucesso do webhook`);
        } catch (error: any) {
          // Logar erro mas não bloquear o webhook
          this.logger.error(`Erro ao processar pagamento: ${error.message}`, error);
          this.logger.error(`Stack trace: ${error.stack}`);
          // Em ambiente de teste, não bloquear
          const isProduction = process.env.NODE_ENV === 'production';
          if (isProduction && error instanceof BadRequestException) {
            throw error;
          }
        }
      }

      return { status: 'ok', message: 'Webhook processado com sucesso' };
    } catch (error: any) {
      this.logger.error('Erro ao processar webhook do Mercado Pago:', error);
      // Retornar erro mais detalhado para debug
      const errorMessage = error?.message || 'Erro ao processar webhook do Mercado Pago';
      const errorDetails = error?.stack ? error.stack.split('\n')[0] : '';
      throw new BadRequestException(
        `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`
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
