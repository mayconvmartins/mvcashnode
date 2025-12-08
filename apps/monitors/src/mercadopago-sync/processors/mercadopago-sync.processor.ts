import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';

@Processor('mercadopago-sync')
export class MercadoPagoSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MercadoPagoSyncProcessor.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    this.logger.log('Iniciando sincronização de pagamentos do Mercado Pago...');

    try {
      // Buscar configuração ativa do Mercado Pago
      const config = await this.prisma.mercadoPagoConfig.findFirst({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
      });

      if (!config) {
        this.logger.warn('Configuração do Mercado Pago não encontrada ou inativa');
        return {
          success: false,
          message: 'Configuração do Mercado Pago não encontrada',
          synced: 0,
          updated: 0,
          errors: 0,
        };
      }

      // Descriptografar access token
      const accessToken = await this.encryptionService.decrypt(config.access_token_enc);
      const baseUrl = 'https://api.mercadopago.com';

      // Buscar pagamentos pendentes ou que precisam ser verificados
      // Verificar pagamentos das últimas 24 horas que estão pendentes
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const pendingPayments = await this.prisma.subscriptionPayment.findMany({
        where: {
          status: {
            in: ['PENDING'],
          },
          created_at: {
            gte: yesterday,
          },
        },
        include: {
          subscription: {
            include: {
              user: true,
              plan: true,
            },
          },
        },
        take: 100, // Limitar a 100 por execução para não sobrecarregar
      });

      this.logger.log(`Encontrados ${pendingPayments.length} pagamentos pendentes para sincronizar`);

      let synced = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ paymentId: number; error: string }> = [];

      for (const payment of pendingPayments) {
        try {
          // Buscar status atualizado do Mercado Pago
          const response = await fetch(`${baseUrl}/v1/payments/${payment.mp_payment_id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            this.logger.warn(`Erro ao buscar pagamento ${payment.mp_payment_id}:`, error);
            errors++;
            errorDetails.push({
              paymentId: payment.id,
              error: (error && typeof error === 'object' && 'message' in error)
                ? String(error.message)
                : 'Erro desconhecido',
            });
            continue;
          }

          const mpPayment = await response.json() as {
            id: string;
            status: string;
            transaction_amount: number;
            payment_method_id: string;
            preference_id?: string;
          };
          synced++;

          // Verificar se o status mudou
          const newStatus = this.mapMpStatusToDbStatus(mpPayment.status);
          
          if (newStatus !== payment.status) {
            // Atualizar status do pagamento
            await this.prisma.subscriptionPayment.update({
              where: { id: payment.id },
              data: { status: newStatus },
            });

            // Se pagamento foi aprovado, processar assinatura
            if (newStatus === 'APPROVED' && payment.subscription && payment.mp_payment_id) {
              await this.processApprovedPayment(payment.subscription.id, payment.mp_payment_id, mpPayment);
            }

            updated++;
            this.logger.log(
              `Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) atualizado: ${payment.status} -> ${newStatus}`
            );
          }
        } catch (error: any) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          errorDetails.push({
            paymentId: payment.id,
            error: errorMessage,
          });
          this.logger.error(`Erro ao processar pagamento ${payment.id}:`, error);
        }
      }

      // Também verificar assinaturas pendentes que podem ter pagamentos aprovados
      const pendingSubscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'PENDING_PAYMENT',
          mp_payment_id: {
            not: null,
          },
          created_at: {
            gte: yesterday,
          },
        },
        include: {
          plan: true,
          user: true,
        },
        take: 50,
      });

      this.logger.log(`Verificando ${pendingSubscriptions.length} assinaturas pendentes`);

      for (const subscription of pendingSubscriptions) {
        if (!subscription.mp_payment_id) continue;

        try {
          const response = await fetch(`${baseUrl}/v1/payments/${subscription.mp_payment_id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (response.ok) {
            const mpPayment = await response.json() as {
              id: string;
              status: string;
              transaction_amount: number;
              payment_method_id: string;
              preference_id?: string;
            };
            
            if (mpPayment.status === 'approved' && subscription.status === 'PENDING_PAYMENT') {
              await this.processApprovedPayment(subscription.id, subscription.mp_payment_id, mpPayment);
              updated++;
            }
          }
        } catch (error: any) {
          this.logger.error(`Erro ao verificar assinatura ${subscription.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Sincronização concluída: ${synced} verificados, ${updated} atualizados, ${errors} erros (${duration}ms)`
      );

      return {
        success: true,
        message: 'Sincronização concluída',
        synced,
        updated,
        errors,
        error_details: errorDetails.length > 0 ? errorDetails : undefined,
        duration_ms: duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('Erro na sincronização de pagamentos:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        synced: 0,
        updated: 0,
        errors: 1,
        duration_ms: duration,
      };
    }
  }

  private mapMpStatusToDbStatus(mpStatus: string): string {
    const statusMap: Record<string, string> = {
      pending: 'PENDING',
      approved: 'APPROVED',
      authorized: 'APPROVED',
      in_process: 'PENDING',
      in_mediation: 'PENDING',
      rejected: 'REJECTED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      charged_back: 'REJECTED',
    };
    return statusMap[mpStatus.toLowerCase()] || 'PENDING';
  }

  private async processApprovedPayment(
    subscriptionId: number,
    mpPaymentId: string,
    mpPayment: {
      id: string;
      status: string;
      transaction_amount: number;
      payment_method_id: string;
      preference_id?: string;
    }
  ): Promise<void> {
    try {
      const subscription = await this.prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: true,
          user: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`Assinatura ${subscriptionId} não encontrada`);
        return;
      }

      if (subscription.status === 'ACTIVE') {
        // Já está ativa, não precisa processar novamente
        return;
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + subscription.plan.duration_days);

      // Atualizar assinatura
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'ACTIVE',
          start_date: startDate,
          end_date: endDate,
          mp_payment_id: mpPaymentId,
          payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
        },
      });

      // Verificar se pagamento já existe, se não, criar
      const existingPayment = await this.prisma.subscriptionPayment.findFirst({
        where: { mp_payment_id: mpPaymentId },
      });

      if (!existingPayment) {
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscriptionId,
            mp_payment_id: mpPaymentId,
            amount: mpPayment.transaction_amount,
            status: 'APPROVED',
            payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
          },
        });
      } else if (existingPayment.status !== 'APPROVED') {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: { status: 'APPROVED' },
        });
      }

      // Ativar usuário e adicionar role de subscriber
      await this.prisma.user.update({
        where: { id: subscription.user_id },
        data: { is_active: true },
      });

      const hasSubscriberRole = await this.prisma.userRole.findFirst({
        where: {
          user_id: subscription.user_id,
          role: 'subscriber',
        },
      });

      if (!hasSubscriberRole) {
        await this.prisma.userRole.create({
          data: {
            user_id: subscription.user_id,
            role: 'subscriber',
          },
        });
      }

      this.logger.log(`Assinatura ${subscriptionId} ativada via sincronização`);
    } catch (error: any) {
      this.logger.error(`Erro ao processar pagamento aprovado para assinatura ${subscriptionId}:`, error);
      throw error;
    }
  }
}
