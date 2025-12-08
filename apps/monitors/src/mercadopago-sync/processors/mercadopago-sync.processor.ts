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

      // Buscar TODOS os pagamentos para sincronização (não apenas pendentes)
      // Verificar pagamentos dos últimos 7 dias
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Debug: verificar quantos pagamentos existem no total
      const totalPayments = await this.prisma.subscriptionPayment.count();
      const paymentsWithMpId = await this.prisma.subscriptionPayment.count({
        where: {
          mp_payment_id: {
            not: null,
          },
        },
      });
      const recentPayments = await this.prisma.subscriptionPayment.count({
        where: {
          created_at: {
            gte: sevenDaysAgo,
          },
        },
      });
      
      this.logger.log(`Debug: Total de pagamentos no banco: ${totalPayments}, com mp_payment_id: ${paymentsWithMpId}, dos últimos 7 dias: ${recentPayments}`);

      // Buscar todos os pagamentos dos últimos 7 dias (qualquer status)
      let allPayments = await this.prisma.subscriptionPayment.findMany({
        where: {
          mp_payment_id: {
            not: null, // Apenas pagamentos que têm ID do Mercado Pago
          },
          created_at: {
            gte: sevenDaysAgo,
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
        orderBy: {
          created_at: 'desc', // Buscar os mais recentes primeiro
        },
      });

      this.logger.log(`Encontrados ${allPayments.length} pagamentos dos últimos 7 dias para sincronizar`);

      // Se não encontrou nenhum pagamento recente, buscar TODOS os pagamentos com mp_payment_id (sem limite de data)
      // para garantir que não perdemos nenhum pagamento
      if (allPayments.length === 0) {
        this.logger.log('Nenhum pagamento encontrado nos últimos 7 dias. Buscando todos os pagamentos com mp_payment_id...');
        
        const allPaymentsWithMpId = await this.prisma.subscriptionPayment.findMany({
          where: {
            mp_payment_id: {
              not: null,
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
          take: 100, // Limitar a 100 para não sobrecarregar
          orderBy: {
            created_at: 'desc',
          },
        });
        
        if (allPaymentsWithMpId.length > 0) {
          this.logger.log(`Encontrados ${allPaymentsWithMpId.length} pagamentos com mp_payment_id (sem filtro de data)`);
          allPayments = allPaymentsWithMpId;
        }
      }

      // Se não encontrou muitos, buscar também pagamentos mais antigos (até 30 dias)
      // mas priorizar pendentes e aprovados que podem ter mudado
      if (allPayments.length < 50) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const olderPayments = await this.prisma.subscriptionPayment.findMany({
          where: {
            mp_payment_id: {
              not: null,
            },
            created_at: {
              gte: thirtyDaysAgo,
              lt: sevenDaysAgo,
            },
            // Priorizar pendentes e aprovados que podem ter mudado
            status: {
              in: ['PENDING', 'APPROVED'],
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
          take: 50, // Limitar a 50 para não sobrecarregar
          orderBy: {
            created_at: 'desc',
          },
        });

        if (olderPayments.length > 0) {
          this.logger.log(`Adicionando ${olderPayments.length} pagamentos mais antigos (7-30 dias) para sincronizar`);
          allPayments = [...allPayments, ...olderPayments];
        }
      }

      // Usar allPayments como pendingPayments para manter compatibilidade com o código abaixo
      const pendingPayments = allPayments;

      let synced = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ paymentId: number; error: string }> = [];

      for (const payment of pendingPayments) {
        try {
          if (!payment.mp_payment_id) {
            this.logger.warn(`Pagamento ${payment.id} não tem mp_payment_id, pulando...`);
            continue;
          }

          this.logger.debug(`Verificando pagamento ${payment.id} (MP: ${payment.mp_payment_id})`);
          
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

          this.logger.debug(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Status no MP: ${mpPayment.status}, Status no DB: ${payment.status}`);

          // Verificar se o status mudou
          const newStatus = this.mapMpStatusToDbStatus(mpPayment.status);
          
          // Sempre atualizar informações do pagamento (pode ter mudado valor, método, etc.)
          const updateData: any = {
            status: newStatus,
            amount: mpPayment.transaction_amount,
            payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
          };

          // Verificar se houve mudança de status
          const statusChanged = newStatus !== payment.status;
          
          if (statusChanged) {
            // Atualizar status e outras informações do pagamento
            await this.prisma.subscriptionPayment.update({
              where: { id: payment.id },
              data: updateData,
            });

            this.logger.log(
              `Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) atualizado: ${payment.status} -> ${newStatus}`
            );

            // Se pagamento foi aprovado, processar assinatura
            if (newStatus === 'APPROVED' && payment.subscription && payment.mp_payment_id) {
              // Só processar se a assinatura ainda estiver pendente
              if (payment.subscription.status === 'PENDING_PAYMENT') {
                this.logger.log(`Processando pagamento aprovado para assinatura ${payment.subscription.id}`);
              await this.processApprovedPayment(payment.subscription.id, payment.mp_payment_id, mpPayment);
              } else {
                this.logger.debug(`Assinatura ${payment.subscription.id} já foi processada (status: ${payment.subscription.status})`);
              }
            }

            // Se pagamento foi estornado ou reembolsado, desativar assinatura se estiver ativa
            if ((newStatus === 'REFUNDED' || newStatus === 'CANCELLED') && payment.subscription) {
              if (payment.subscription.status === 'ACTIVE') {
                this.logger.log(`Pagamento ${payment.id} foi ${newStatus.toLowerCase()}, desativando assinatura ${payment.subscription.id}`);
                await this.prisma.subscription.update({
                  where: { id: payment.subscription.id },
                  data: {
                    status: 'CANCELLED',
                    end_date: new Date(), // Finalizar imediatamente
                  },
                });
                
                // Remover role de subscriber do usuário
                await this.prisma.userRole.deleteMany({
                  where: {
                    user_id: payment.subscription.user_id,
                    role: 'subscriber',
                  },
                });
                
                this.logger.log(`Assinatura ${payment.subscription.id} cancelada devido a ${newStatus.toLowerCase()} do pagamento`);
              }
            }

            updated++;
          } else {
            // Mesmo que o status não tenha mudado, atualizar outras informações que podem ter mudado
            const paymentAmount = payment.amount.toNumber ? payment.amount.toNumber() : Number(payment.amount);
            const needsUpdate = 
              paymentAmount !== mpPayment.transaction_amount ||
              payment.payment_method !== (mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD');

            if (needsUpdate) {
              await this.prisma.subscriptionPayment.update({
                where: { id: payment.id },
                data: updateData,
              });
              this.logger.debug(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Informações atualizadas (status mantido: ${payment.status})`);
              updated++;
            } else {
              this.logger.debug(`Pagamento ${payment.id} (MP: ${payment.mp_payment_id}) - Sem alterações (status: ${payment.status})`);
            }
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
      // Buscar assinaturas dos últimos 7 dias (reutilizar a variável já declarada acima)

      // Debug: verificar quantas assinaturas existem
      const totalSubscriptions = await this.prisma.subscription.count();
      const subscriptionsWithMpId = await this.prisma.subscription.count({
        where: {
          mp_payment_id: {
            not: null,
          },
        },
      });
      const pendingSubscriptionsCount = await this.prisma.subscription.count({
        where: {
          status: 'PENDING_PAYMENT',
          mp_payment_id: {
            not: null,
          },
        },
      });
      
      this.logger.log(`Debug: Total de assinaturas: ${totalSubscriptions}, com mp_payment_id: ${subscriptionsWithMpId}, pendentes com mp_payment_id: ${pendingSubscriptionsCount}`);

      let pendingSubscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'PENDING_PAYMENT',
          mp_payment_id: {
            not: null,
          },
          created_at: {
            gte: sevenDaysAgo,
          },
        },
        include: {
          plan: true,
          user: true,
        },
        take: 50,
      });

      this.logger.log(`Verificando ${pendingSubscriptions.length} assinaturas pendentes dos últimos 7 dias`);

      // Se não encontrou nenhuma, buscar também assinaturas mais antigas (até 30 dias)
      if (pendingSubscriptions.length === 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        pendingSubscriptions = await this.prisma.subscription.findMany({
          where: {
            status: 'PENDING_PAYMENT',
            mp_payment_id: {
              not: null,
            },
            created_at: {
              gte: thirtyDaysAgo,
            },
          },
          include: {
            plan: true,
            user: true,
          },
          take: 30,
          orderBy: {
            created_at: 'desc', // Buscar as mais recentes primeiro
          },
        });

        this.logger.log(`Verificando ${pendingSubscriptions.length} assinaturas pendentes dos últimos 30 dias`);
      }

      // Se ainda não encontrou nenhuma, buscar TODAS as assinaturas pendentes com mp_payment_id (sem limite de data)
      if (pendingSubscriptions.length === 0) {
        this.logger.log('Nenhuma assinatura pendente encontrada nos últimos 30 dias. Buscando todas as assinaturas pendentes com mp_payment_id...');
        
        pendingSubscriptions = await this.prisma.subscription.findMany({
          where: {
            status: 'PENDING_PAYMENT',
            mp_payment_id: {
              not: null,
            },
          },
          include: {
            plan: true,
            user: true,
          },
          take: 50,
          orderBy: {
            created_at: 'desc',
          },
        });

        if (pendingSubscriptions.length > 0) {
          this.logger.log(`Encontradas ${pendingSubscriptions.length} assinaturas pendentes com mp_payment_id (sem filtro de data)`);
        }
      }

      // Buscar também assinaturas que têm mp_payment_id mas não têm registro de pagamento correspondente
      // Isso pode acontecer se o pagamento foi criado mas o registro não foi salvo no banco
      if (pendingSubscriptions.length === 0 && pendingPayments.length === 0) {
        this.logger.log('Buscando assinaturas com mp_payment_id mas sem registro de pagamento...');
        
        const subscriptionsWithPaymentId = await this.prisma.subscription.findMany({
          where: {
            status: 'PENDING_PAYMENT',
            mp_payment_id: {
              not: null,
            },
            created_at: {
              gte: sevenDaysAgo,
            },
          },
          include: {
            plan: true,
            user: true,
          },
          take: 20,
          orderBy: {
            created_at: 'desc',
          },
        });

        // Verificar quais não têm registro de pagamento
        for (const sub of subscriptionsWithPaymentId) {
          if (!sub.mp_payment_id) continue;
          
          const existingPayment = await this.prisma.subscriptionPayment.findFirst({
            where: {
              mp_payment_id: sub.mp_payment_id,
            },
          });

          if (!existingPayment) {
            this.logger.log(`Assinatura ${sub.id} tem mp_payment_id (${sub.mp_payment_id}) mas não tem registro de pagamento. Adicionando à lista de verificação.`);
            pendingSubscriptions.push(sub);
          }
        }

        if (pendingSubscriptions.length > 0) {
          this.logger.log(`Encontradas ${pendingSubscriptions.length} assinaturas com mp_payment_id mas sem registro de pagamento`);
        }
      }

      for (const subscription of pendingSubscriptions) {
        if (!subscription.mp_payment_id) {
          this.logger.debug(`Assinatura ${subscription.id} não tem mp_payment_id, pulando...`);
          continue;
        }

        try {
          this.logger.debug(`Verificando assinatura ${subscription.id} com pagamento MP: ${subscription.mp_payment_id}`);
          
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
            
            this.logger.debug(`Assinatura ${subscription.id} - Status no MP: ${mpPayment.status}, Status no DB: ${subscription.status}`);
            
            // Verificar se existe registro de pagamento, se não, criar
            const existingPayment = await this.prisma.subscriptionPayment.findFirst({
              where: {
                mp_payment_id: subscription.mp_payment_id,
              },
            });

            if (!existingPayment) {
              this.logger.log(`Criando registro de pagamento para assinatura ${subscription.id} (MP: ${subscription.mp_payment_id})`);
              const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
              await this.prisma.subscriptionPayment.create({
                data: {
                  subscription_id: subscription.id,
                  mp_payment_id: subscription.mp_payment_id,
                  amount: mpPayment.transaction_amount,
                  status: paymentStatus,
                  payment_method: mpPayment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
                },
              });
              synced++;
            } else {
              // Atualizar status do pagamento se mudou
              const paymentStatus = this.mapMpStatusToDbStatus(mpPayment.status);
              if (existingPayment.status !== paymentStatus) {
                this.logger.log(`Atualizando status do pagamento ${existingPayment.id}: ${existingPayment.status} -> ${paymentStatus}`);
                await this.prisma.subscriptionPayment.update({
                  where: { id: existingPayment.id },
                  data: { status: paymentStatus },
                });
                synced++;
              }
            }
            
            if (mpPayment.status === 'approved' && subscription.status === 'PENDING_PAYMENT') {
              this.logger.log(`Processando assinatura ${subscription.id} com pagamento aprovado`);
              await this.processApprovedPayment(subscription.id, subscription.mp_payment_id, mpPayment);
              updated++;
            } else if (mpPayment.status !== 'approved') {
              this.logger.debug(`Assinatura ${subscription.id} - Pagamento ainda não aprovado (status: ${mpPayment.status})`);
            }
          } else {
            const error = await response.json();
            this.logger.warn(`Erro ao buscar pagamento ${subscription.mp_payment_id} para assinatura ${subscription.id}:`, error);
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
      // Status adicionais do Mercado Pago
      refunded_partially: 'REFUNDED',
      cancelled_by_user: 'CANCELLED',
      cancelled_by_admin: 'CANCELLED',
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
