import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { MercadoPagoService, MercadoPagoPayment } from './mercadopago.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Subscriptions - Payments')
@Controller('subscriptions/payments')
export class SubscriptionPaymentsController {
  constructor(
    private subscriptionsService: SubscriptionsService,
    private mercadoPagoService: MercadoPagoService
  ) {}

  @Post('card')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Processar pagamento com cartão' })
  @ApiResponse({ status: 200, description: 'Pagamento processado' })
  async processCardPayment(
    @CurrentUser() user: any,
    @Body()
    body: {
      token: string;
      issuer_id: string;
      payment_method_id: string;
      transaction_amount: number;
      installments: number;
      description: string;
      payer: {
        email: string;
        identification: {
          type: string;
          number: string;
        };
      };
      subscription_id?: number;
    }
  ) {
    try {
      const payment = await this.mercadoPagoService.createCardPayment({
        token: body.token,
        issuerId: body.issuer_id,
        paymentMethodId: body.payment_method_id,
        transactionAmount: body.transaction_amount,
        installments: body.installments,
        description: body.description,
        payer: body.payer,
      });

      // Processar pagamento aprovado
      if (payment.status === 'approved') {
        if (body.subscription_id) {
          await this.subscriptionsService.processApprovedPayment(payment.id);
        } else {
          // Se não tiver subscription_id, tentar encontrar pela preferência
          await this.subscriptionsService.processApprovedPayment(payment.id);
        }
      }

      return payment;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao processar pagamento');
    }
  }

  @Post('pix')
  @ApiOperation({ summary: 'Criar pagamento PIX' })
  @ApiResponse({ status: 200, description: 'Pagamento PIX criado' })
  async createPixPayment(
    @Body()
    body: {
      transaction_amount: number;
      description: string;
      payer: {
        email: string;
        first_name?: string;
        last_name?: string;
        identification: {
          type: string;
          number: string;
        };
      };
      subscription_id?: number;
      mp_preference_id?: string;
    }
  ): Promise<MercadoPagoPayment & { point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } } }> {
    try {
      const payment = await this.mercadoPagoService.createPixPayment({
        transactionAmount: body.transaction_amount,
        description: body.description,
        payer: body.payer,
      });

      // Buscar assinatura relacionada
      let subscription = null;
      if (body.subscription_id) {
        subscription = await this.subscriptionsService.getSubscriptionById(body.subscription_id);
      } else if (body.mp_preference_id) {
        subscription = await this.subscriptionsService.getSubscriptionByPreferenceId(body.mp_preference_id);
      }

      if (!subscription) {
        // Se não encontrar assinatura, tentar buscar pela preferência do pagamento
        if (payment.preference_id) {
          subscription = await this.subscriptionsService.getSubscriptionByPreferenceId(payment.preference_id);
        }
      }

      // Salvar pagamento no banco imediatamente
      if (subscription) {
        // Verificar se pagamento já existe
        const existingPayment = await this.subscriptionsService.getPaymentByMpId(payment.id);
        
        if (!existingPayment) {
          // Criar registro de pagamento
          await this.subscriptionsService.createPaymentRecord({
            subscription_id: subscription.id,
            mp_payment_id: payment.id,
            amount: payment.transaction_amount,
            status: payment.status === 'approved' ? 'APPROVED' : payment.status === 'pending' ? 'PENDING' : 'REJECTED',
            payment_method: 'PIX',
          });

          // Atualizar mp_payment_id na assinatura
          await this.subscriptionsService.updateSubscriptionPaymentId(subscription.id, payment.id);
        } else {
          // Atualizar status do pagamento existente
          await this.subscriptionsService.updatePaymentStatus(existingPayment.id, 
            payment.status === 'approved' ? 'APPROVED' : payment.status === 'pending' ? 'PENDING' : 'REJECTED'
          );
        }
      }

      // Se pagamento foi aprovado imediatamente, processar
      if (payment.status === 'approved' && subscription) {
        await this.subscriptionsService.processApprovedPayment(payment.id);
      }

      return payment;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao criar pagamento PIX');
    }
  }

  @Get(':paymentId/status')
  @ApiOperation({ summary: 'Verificar status do pagamento' })
  @ApiParam({ name: 'paymentId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Status do pagamento' })
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    try {
      return await this.mercadoPagoService.getPaymentStatus(paymentId);
    } catch (error: any) {
      throw new NotFoundException('Pagamento não encontrado');
    }
  }

  @Post('callback')
  @ApiOperation({ summary: 'Callback de pagamento (webhook alternativo)' })
  @ApiResponse({ status: 200, description: 'Callback processado' })
  async handlePaymentCallback(
    @Body()
    body: {
      type: string;
      data: {
        id: string;
      };
    }
  ) {
    try {
      if (body.type === 'payment') {
        await this.subscriptionsService.processApprovedPayment(body.data.id);
      }
      return { status: 'ok' };
    } catch (error: any) {
      throw new BadRequestException('Erro ao processar callback');
    }
  }
}
