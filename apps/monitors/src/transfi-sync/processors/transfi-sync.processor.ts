import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';

@Processor('transfi-sync')
export class TransFiSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(TransFiSyncProcessor.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    super();
  }

  async process(_job: Job<any>): Promise<any> {
    const startTime = Date.now();
    this.logger.log('Iniciando sincronização de pagamentos do TransFi...');

    try {
      // Buscar configuração ativa do TransFi
      const config = await this.prisma.transFiConfig.findFirst({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
      });

      if (!config) {
        this.logger.warn('Configuração do TransFi não encontrada ou inativa');
        return {
          success: false,
          message: 'Configuração do TransFi não encontrada',
          synced: 0,
          updated: 0,
          errors: 0,
        };
      }

      // Descriptografar authorization token
      const authorizationToken = await this.encryptionService.decrypt(config.authorization_token_enc);
      const baseUrl = config.environment === 'production'
        ? 'https://api.transfi.com'
        : 'https://sandbox-api.transfi.com';

      // Buscar pagamentos pendentes ou que precisam ser verificados
      // Verificar pagamentos das últimas 24 horas que estão pendentes
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const pendingPayments = await this.prisma.subscriptionPayment.findMany({
        where: {
          status: {
            in: ['PENDING'],
          },
          transfi_order_id: {
            not: null,
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

      // Criar header de autenticação Basic Auth
      const credentials = `${config.merchant_id}:${authorizationToken}`;
      const authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

      for (const payment of pendingPayments) {
        if (!payment.transfi_order_id) continue;

        try {
          // Buscar status atualizado do TransFi
          const response = await fetch(`${baseUrl}/v2/fiat-order/${payment.transfi_order_id}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'MID': config.merchant_id,
              'Authorization': authHeader,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            this.logger.warn(`Erro ao buscar pedido ${payment.transfi_order_id}:`, error);
            errors++;
            errorDetails.push({
              paymentId: payment.id,
              error: (error && typeof error === 'object' && 'message' in error)
                ? String(error.message)
                : 'Erro desconhecido',
            });
            continue;
          }

          const transfiOrder = await response.json() as {
            id: string;
            orderId: string;
            status: string;
            amount: number;
            currency: string;
            paymentMethod: string;
          };
          synced++;

          // Verificar se o status mudou
          const newStatus = this.mapTransFiStatusToDbStatus(transfiOrder.status);
          
          if (newStatus !== payment.status) {
            // Atualizar status do pagamento
            await this.prisma.subscriptionPayment.update({
              where: { id: payment.id },
              data: { 
                status: newStatus,
                transfi_payment_id: transfiOrder.id,
              },
            });

            // Se pagamento foi aprovado, processar assinatura
            if (newStatus === 'APPROVED' && payment.subscription) {
              await this.processApprovedPayment(
                payment.subscription.id,
                payment.transfi_order_id,
                transfiOrder
              );
            }

            updated++;
            this.logger.log(
              `Pagamento ${payment.id} (TransFi: ${payment.transfi_order_id}) atualizado: ${payment.status} -> ${newStatus}`
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
          created_at: {
            gte: yesterday,
          },
        },
        include: {
          plan: true,
          user: true,
          payments: {
            where: {
              transfi_order_id: { not: null },
            },
            take: 1,
          },
        },
        take: 50,
      });

      this.logger.log(`Verificando ${pendingSubscriptions.length} assinaturas pendentes`);

      for (const subscription of pendingSubscriptions) {
        const transfiPayment = subscription.payments.find(p => p.transfi_order_id);
        if (!transfiPayment?.transfi_order_id) continue;

        try {
          const response = await fetch(`${baseUrl}/v2/fiat-order/${transfiPayment.transfi_order_id}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'MID': config.merchant_id,
              'Authorization': authHeader,
            },
          });

          if (response.ok) {
            const transfiOrder = await response.json() as {
              id: string;
              orderId: string;
              status: string;
              amount: number;
              currency: string;
              paymentMethod: string;
            };
            
            if ((transfiOrder.status === 'completed' || transfiOrder.status === 'approved') && 
                subscription.status === 'PENDING_PAYMENT') {
              await this.processApprovedPayment(
                subscription.id,
                transfiPayment.transfi_order_id,
                transfiOrder
              );
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

  private mapTransFiStatusToDbStatus(transfiStatus: string): string {
    const statusMap: Record<string, string> = {
      pending: 'PENDING',
      processing: 'PENDING',
      completed: 'APPROVED',
      approved: 'APPROVED',
      failed: 'REJECTED',
      rejected: 'REJECTED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
    };
    return statusMap[transfiStatus.toLowerCase()] || 'PENDING';
  }

  private async processApprovedPayment(
    subscriptionId: number,
    transfiOrderId: string,
    transfiOrder: {
      id: string;
      orderId: string;
      status: string;
      amount: number;
      currency: string;
      paymentMethod: string;
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

      // Determinar método de pagamento
      let paymentMethod = 'CARD';
      if (transfiOrder.paymentMethod?.toLowerCase().includes('pix')) {
        paymentMethod = 'PIX';
      } else if (transfiOrder.paymentMethod?.toLowerCase().includes('crypto')) {
        paymentMethod = 'CRYPTO';
      }

      // Atualizar assinatura
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'ACTIVE',
          start_date: startDate,
          end_date: endDate,
          payment_method: paymentMethod,
        },
      });

      // Verificar se pagamento já existe, se não, criar
      const existingPayment = await this.prisma.subscriptionPayment.findFirst({
        where: { transfi_order_id: transfiOrderId },
      });

      if (!existingPayment) {
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscriptionId,
            transfi_order_id: transfiOrderId,
            transfi_payment_id: transfiOrder.id,
            amount: transfiOrder.amount,
            status: 'APPROVED',
            payment_method: paymentMethod,
          },
        });
      } else if (existingPayment.status !== 'APPROVED') {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: { 
            status: 'APPROVED',
            transfi_payment_id: transfiOrder.id,
          },
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

      this.logger.log(`Assinatura ${subscriptionId} ativada via sincronização TransFi`);
    } catch (error: any) {
      this.logger.error(`Erro ao processar pagamento aprovado para assinatura ${subscriptionId}:`, error);
      throw error;
    }
  }
}
