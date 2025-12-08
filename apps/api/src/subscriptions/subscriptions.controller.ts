import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { MercadoPagoService } from './mercadopago.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from './guards/subscription.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { validateCpf } from '../common/utils/cpf-validation';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private subscriptionsService: SubscriptionsService,
    private mercadoPagoService: MercadoPagoService,
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
    @Body() body: {
      type: string;
      action: string;
      data: { id: string };
      id?: string;
    }
  ) {
    try {
      // Validar assinatura do webhook se configurado
      const xSignature = req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'];
      
      if (xSignature && xRequestId && body.data?.id) {
        const isValid = await this.mercadoPagoService.validateWebhookSignature(
          xSignature,
          xRequestId,
          body.data.id
        );
        
        if (!isValid) {
          throw new BadRequestException('Assinatura do webhook inválida');
        }
      }

      // Processar webhook
      const event = {
        id: body.id || `event-${Date.now()}`,
        type: body.type,
        action: body.action,
        data: body.data,
      };

      await this.mercadoPagoService.processWebhook(event);

      // Se for evento de pagamento, processar pagamento aprovado
      if (body.type === 'payment' && body.data?.id) {
        await this.subscriptionsService.processApprovedPayment(body.data.id);
      }

      return { status: 'ok', message: 'Webhook processado com sucesso' };
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Erro ao processar webhook do Mercado Pago'
      );
    }
  }
}
