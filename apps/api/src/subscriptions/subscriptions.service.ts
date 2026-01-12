import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { EmailService } from '@mvcashnode/notifications';
import { MercadoPagoService } from './mercadopago.service';
import { TransFiService } from './transfi.service';
import { MvmPayService } from './mvm-pay.service';
import * as crypto from 'crypto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private emailService: EmailService | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private mercadoPagoService: MercadoPagoService,
    private transfiService: TransFiService,
    private mvmPayService: MvmPayService,
  ) {
    // Inicializar EmailService se configurado
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    
    if (smtpHost && smtpUser && smtpPass) {
      this.emailService = new EmailService(this.prisma as any, {
        host: smtpHost,
        port: parseInt(this.configService.get<string>('SMTP_PORT') || '2525'),
        user: smtpUser,
        password: smtpPass,
        from: this.configService.get<string>('SMTP_FROM') || 'noreply.mvcash@mvmdev.com',
      });
      this.logger.log('EmailService configurado com sucesso');
    } else {
      this.logger.warn('EmailService não configurado - variáveis SMTP não encontradas');
    }
  }

  /**
   * Lista todos os planos ativos
   */
  async getActivePlans(): Promise<any[]> {
    return this.prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { price_monthly: 'asc' },
    });
  }

  /**
   * Busca um plano por ID
   */
  async getPlanById(planId: number): Promise<any> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }
    return plan;
  }

  /**
   * Cria uma preferência de pagamento e inicia o processo de checkout
   */
  async createCheckout(data: {
    planId: number;
    billingPeriod: 'monthly' | 'quarterly';
    subscriberData: {
      email: string;
      fullName: string;
      cpf: string;
      birthDate: Date;
      phone?: string;
      whatsapp?: string;
      address: {
        street: string;
        number: string;
        complement?: string;
        neighborhood: string;
        city: string;
        state: string;
        zipcode: string;
      };
    };
  }) {
    const plan = await this.getPlanById(data.planId);

    if (!plan.is_active) {
      throw new BadRequestException('Plano não está ativo');
    }

    const amount = data.billingPeriod === 'monthly' 
      ? Number(plan.price_monthly) 
      : Number(plan.price_quarterly);

    const durationDays = data.billingPeriod === 'monthly' ? 30 : 90;

    // Verificar se já existe usuário com este email
    let user = await this.prisma.user.findUnique({
      where: { email: data.subscriberData.email },
    });

    // Se não existir, criar usuário temporário (será ativado após pagamento)
    if (!user) {
      // Gerar senha temporária (será alterada no registro)
      const tempPassword = crypto.randomBytes(16).toString('hex');
      // Usar bcrypt diretamente já que hashPassword não é exportado
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      user = await this.prisma.user.create({
        data: {
          email: data.subscriberData.email,
          password_hash: passwordHash,
          is_active: false, // Inativo até pagamento ser confirmado
          must_change_password: true,
        },
      });

      // Criar perfil básico
      await this.prisma.profile.create({
        data: {
          user_id: user.id,
          full_name: data.subscriberData.fullName,
          phone: data.subscriberData.phone,
          whatsapp_phone: data.subscriberData.whatsapp,
        },
      });
    } else {
      // Usuário já existe - atualizar profile com dados do checkout (incluindo whatsapp)
      await this.prisma.profile.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          full_name: data.subscriberData.fullName,
          phone: data.subscriberData.phone,
          whatsapp_phone: data.subscriberData.whatsapp,
        },
        update: {
          // Só atualizar se os valores forem fornecidos (não sobrescrever com null)
          ...(data.subscriberData.fullName && { full_name: data.subscriberData.fullName }),
          ...(data.subscriberData.phone && { phone: data.subscriberData.phone }),
          ...(data.subscriberData.whatsapp && { whatsapp_phone: data.subscriberData.whatsapp }),
        },
      });
    }

    // Salvar dados do assinante (temporário, será confirmado após pagamento)
    const encryptedCpf = await this.encryptCpf(data.subscriberData.cpf);
    await this.prisma.subscriberProfile.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        cpf_enc: encryptedCpf,
        birth_date: data.subscriberData.birthDate,
        address_street: data.subscriberData.address.street,
        address_number: data.subscriberData.address.number,
        address_complement: data.subscriberData.address.complement,
        address_neighborhood: data.subscriberData.address.neighborhood,
        address_city: data.subscriberData.address.city,
        address_state: data.subscriberData.address.state,
        address_zipcode: data.subscriberData.address.zipcode,
      },
      update: {
        cpf_enc: encryptedCpf,
        birth_date: data.subscriberData.birthDate,
        address_street: data.subscriberData.address.street,
        address_number: data.subscriberData.address.number,
        address_complement: data.subscriberData.address.complement,
        address_neighborhood: data.subscriberData.address.neighborhood,
        address_city: data.subscriberData.address.city,
        address_state: data.subscriberData.address.state,
        address_zipcode: data.subscriberData.address.zipcode,
      },
    });

    // Verificar qual gateway usar
    const gatewaySetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'payment_gateway' },
    });
    const defaultGateway = (gatewaySetting?.value || 'mercadopago') as 'mercadopago' | 'transfi';

    const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';

    // Usar TransFi se configurado
    if (defaultGateway === 'transfi') {
      const transfiConfig = await this.prisma.transFiConfig.findFirst({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
      });

      if (transfiConfig) {
        // Criar payin no TransFi
        const order = await this.transfiService.createPayin({
          amount,
          currency: 'BRL',
          paymentMethod: 'PIX', // Pode ser alterado depois
          description: `Assinatura ${plan.name} - ${data.billingPeriod === 'monthly' ? 'Mensal' : 'Trimestral'}`,
          customerData: {
            email: data.subscriberData.email,
            fullName: data.subscriberData.fullName,
            cpf: data.subscriberData.cpf,
            phone: data.subscriberData.phone,
            birthDate: data.subscriberData.birthDate,
            address: {
              street: data.subscriberData.address.street,
              number: data.subscriberData.address.number,
              complement: data.subscriberData.address.complement,
              neighborhood: data.subscriberData.address.neighborhood,
              city: data.subscriberData.address.city,
              state: data.subscriberData.address.state,
              zipcode: data.subscriberData.address.zipcode,
            },
          },
        });

        // Criar assinatura com status PENDING_PAYMENT
        const subscription = await this.prisma.subscription.create({
          data: {
            user_id: user.id,
            plan_id: plan.id,
            status: 'PENDING_PAYMENT',
            start_date: null,
            end_date: null,
            auto_renew: false,
            payment_method: 'PIX',
          },
        });

        // Criar registro de pagamento
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscription.id,
            transfi_order_id: order.orderId,
            transfi_payment_id: order.id,
            amount,
            status: 'PENDING',
            payment_method: 'PIX',
          },
        });

        return {
          order_id: order.orderId,
          payment_url: order.paymentData?.paymentUrl,
          qr_code: order.paymentData?.qrCode,
          qr_code_base64: order.paymentData?.qrCodeBase64,
          gateway: 'transfi',
          subscription_id: subscription.id,
        };
      }
    }

    // Fallback para Mercado Pago
    const preference = await this.mercadoPagoService.createPreference({
      planId: plan.id,
      planName: plan.name,
      amount,
      billingPeriod: data.billingPeriod,
      subscriberData: {
        email: data.subscriberData.email,
        fullName: data.subscriberData.fullName,
        cpf: data.subscriberData.cpf,
      },
      backUrls: {
        success: `${baseUrl}/subscribe/success?preference_id={preference_id}`,
        failure: `${baseUrl}/subscribe/failure`,
        pending: `${baseUrl}/subscribe/pending`,
      },
    });

    // Criar assinatura com status PENDING_PAYMENT
    const subscription = await this.prisma.subscription.create({
      data: {
        user_id: user.id,
        plan_id: plan.id,
        status: 'PENDING_PAYMENT',
        start_date: null,
        end_date: null,
        auto_renew: false,
        mp_preference_id: preference.id,
      },
    });

    return {
      preference_id: preference.id,
      init_point: this.configService.get<string>('MERCADOPAGO_ENVIRONMENT') === 'sandbox'
        ? preference.sandbox_init_point
        : preference.init_point,
      subscription_id: subscription.id,
    };
  }

  /**
   * Processa pagamento aprovado do TransFi
   */
  async processApprovedTransFiPayment(orderId: string) {
    try {
      const order = await this.transfiService.getOrderDetails(orderId);

      // Buscar assinatura pelo order_id
      let subscription = await this.prisma.subscription.findFirst({
        where: {
          payments: {
            some: {
              transfi_order_id: orderId,
            },
          },
        },
        include: {
          plan: true,
          user: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`Assinatura não encontrada para pedido TransFi ${orderId}`);
        return;
      }

      // Mapear status do TransFi para status do banco
      // O getOrderDetails já retorna o status mapeado, mas vamos verificar os valores originais também
      const isApproved = order.status === 'completed' || 
                        order.status === 'approved' || 
                        order.status.toLowerCase() === 'completed' ||
                        order.status.toLowerCase() === 'approved';
      
      if (isApproved) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + subscription.plan.duration_days);

        // Determinar método de pagamento
        let paymentMethod = 'CARD';
        if (order.paymentMethod?.toLowerCase().includes('pix')) {
          paymentMethod = 'PIX';
        } else if (order.paymentMethod?.toLowerCase().includes('crypto')) {
          paymentMethod = 'CRYPTO';
        }

        // Atualizar assinatura
        subscription = await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            start_date: startDate,
            end_date: endDate,
            payment_method: paymentMethod,
          },
          include: {
            plan: true,
            user: true,
          },
        });

        // Verificar se pagamento já existe, se não, criar
        const existingPayment = await this.prisma.subscriptionPayment.findFirst({
          where: { transfi_order_id: orderId },
        });

        if (!existingPayment) {
          await this.prisma.subscriptionPayment.create({
            data: {
              subscription_id: subscription.id,
              transfi_order_id: orderId,
              transfi_payment_id: order.id,
              amount: order.amount,
              status: 'APPROVED',
              payment_method: paymentMethod,
            },
          });
        } else {
          // Atualizar status do pagamento existente
          await this.prisma.subscriptionPayment.update({
            where: { id: existingPayment.id },
            data: {
              status: 'APPROVED',
              transfi_payment_id: order.id,
            },
          });
        }

        // Ativar usuário e adicionar role de subscriber
        await this.prisma.user.update({
          where: { id: subscription.user_id },
          data: {
            is_active: true,
          },
        });

        // Verificar se já tem role de subscriber
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

        this.logger.log(`Assinatura ${subscription.id} ativada para usuário ${subscription.user.email} via TransFi`);

        // Enviar email de confirmação de pagamento
        await this.sendTransFiPaymentConfirmationEmail(subscription, order);
      } else {
        // Verificar se foi rejeitado, cancelado ou falhou
        const isRejected = order.status === 'failed' || 
                          order.status === 'rejected' || 
                          order.status === 'cancelled' ||
                          order.status.toLowerCase() === 'failed' ||
                          order.status.toLowerCase() === 'rejected' ||
                          order.status.toLowerCase() === 'cancelled';
        
        if (isRejected) {
        // Atualizar assinatura para status apropriado
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'PENDING_PAYMENT',
          },
        });

        // Atualizar status do pagamento
        const payment = await this.prisma.subscriptionPayment.findFirst({
          where: { transfi_order_id: orderId },
        });

        if (payment) {
          await this.prisma.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: order.status.toLowerCase() === 'cancelled' ? 'CANCELLED' : 'REJECTED',
            },
          });
        }
        }
      }
    } catch (error: any) {
      this.logger.error(`Erro ao processar pagamento TransFi ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Processa pagamento aprovado do Mercado Pago
   */
  async processApprovedPayment(paymentId: string) {
    try {
      this.logger.log(`Iniciando processamento do pagamento ${paymentId}`);
      const payment = await this.mercadoPagoService.getPayment(paymentId);
      this.logger.log(`Pagamento ${paymentId} - Status: ${payment.status}, Preference ID: ${payment.preference_id}`);

      // Buscar assinatura pelo preference_id ou payment_id
      let subscription = await this.prisma.subscription.findFirst({
        where: {
          OR: [
            { mp_preference_id: payment.preference_id },
            { mp_payment_id: paymentId },
          ],
        },
        include: {
          plan: true,
          user: true,
        },
      });

      if (!subscription) {
        this.logger.warn(`Assinatura não encontrada para pagamento ${paymentId} (preference_id: ${payment.preference_id})`);
        
        const paymentAmount = payment.transaction_amount;
        const paymentDate = new Date(payment.date_created);
        const sevenDaysBefore = new Date(paymentDate);
        sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
        
        // Fallback 1: tentar vincular usando payer.email
        if (payment.payer?.email) {
          this.logger.log(`Tentando fallback 1 para pagamento ${paymentId}: buscando assinaturas pendentes do usuário ${payment.payer.email}...`);
          
          const user = await this.prisma.user.findUnique({
            where: { email: payment.payer.email },
            include: {
              subscriptions: {
                where: {
                  status: 'PENDING_PAYMENT',
                  mp_payment_id: null, // Ainda não tem payment_id
                },
                include: {
                  plan: true,
                },
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          });

          if (user && user.subscriptions.length > 0) {
            // Filtrar assinaturas por valor (tolerância de R$ 0,01)
            const matchingSubscriptions = user.subscriptions.filter(sub => {
              const monthlyPrice = Number(sub.plan.price_monthly);
              const quarterlyPrice = Number(sub.plan.price_quarterly);
              const diffMonthly = Math.abs(paymentAmount - monthlyPrice);
              const diffQuarterly = Math.abs(paymentAmount - quarterlyPrice);
              return diffMonthly <= 0.01 || diffQuarterly <= 0.01;
            });

            if (matchingSubscriptions.length > 0) {
              // Filtrar por data: assinatura criada até 7 dias antes do pagamento
              const dateFilteredSubscriptions = matchingSubscriptions.filter(sub => {
                const subDate = new Date(sub.created_at);
                return subDate <= paymentDate && subDate >= sevenDaysBefore;
              });

              // Escolher a assinatura mais recente que corresponde aos critérios
              const selectedSubscription = dateFilteredSubscriptions.length > 0
                ? dateFilteredSubscriptions[0]
                : matchingSubscriptions[0];

              subscription = await this.prisma.subscription.findUnique({
                where: { id: selectedSubscription.id },
                include: {
                  plan: true,
                  user: true,
                },
              });

              this.logger.log(`Fallback 1 (email): assinatura ${selectedSubscription.id} encontrada para pagamento ${paymentId} via email ${payment.payer.email}`);
              
              if (matchingSubscriptions.length > 1) {
                this.logger.warn(`Fallback 1: múltiplas assinaturas correspondem (${matchingSubscriptions.length}), escolhendo a mais recente: ${selectedSubscription.id}`);
              }
            } else {
              this.logger.warn(`Fallback 1: nenhuma assinatura pendente encontrada com valor correspondente (${paymentAmount}) para email ${payment.payer.email}`);
            }
          } else {
            this.logger.warn(`Fallback 1: usuário não encontrado ou sem assinaturas pendentes para email ${payment.payer.email}`);
          }
        }
        
        // Fallback 2: se não encontrou por email, buscar TODAS as assinaturas pendentes sem mp_payment_id
        // que correspondam ao valor e data (último recurso)
        if (!subscription) {
          this.logger.log(`Tentando fallback 2 para pagamento ${paymentId}: buscando TODAS as assinaturas pendentes sem mp_payment_id que correspondam ao valor ${paymentAmount}...`);
          
          const allPendingSubscriptions = await this.prisma.subscription.findMany({
            where: {
              status: 'PENDING_PAYMENT',
              mp_payment_id: null, // Ainda não tem payment_id
              created_at: {
                gte: sevenDaysBefore,
                lte: paymentDate,
              },
            },
            include: {
              plan: true,
              user: true,
            },
            orderBy: {
              created_at: 'desc',
            },
            take: 20, // Limitar a 20 para não sobrecarregar
          });
          
          // Filtrar por valor
          const matchingByValue = allPendingSubscriptions.filter(sub => {
            const monthlyPrice = Number(sub.plan.price_monthly);
            const quarterlyPrice = Number(sub.plan.price_quarterly);
            const diffMonthly = Math.abs(paymentAmount - monthlyPrice);
            const diffQuarterly = Math.abs(paymentAmount - quarterlyPrice);
            return diffMonthly <= 0.01 || diffQuarterly <= 0.01;
          });
          
          if (matchingByValue.length > 0) {
            // Escolher a mais recente
            subscription = matchingByValue[0];
            this.logger.log(`Fallback 2 (valor+data): assinatura ${subscription.id} encontrada para pagamento ${paymentId} (valor: ${paymentAmount}, email pagamento: ${payment.payer?.email || 'N/A'}, email cadastro: ${subscription.user.email})`);
            
            if (matchingByValue.length > 1) {
              this.logger.warn(`Fallback 2: ATENÇÃO - múltiplas assinaturas correspondem (${matchingByValue.length}), escolhendo a mais recente: ${subscription.id}. Verifique se está correto!`);
            }
            
            // Se o email do pagamento for diferente do email do cadastro, alertar
            if (payment.payer?.email && payment.payer.email !== subscription.user.email) {
              this.logger.warn(`⚠️ ATENÇÃO: Email do pagamento (${payment.payer.email}) é diferente do email do cadastro (${subscription.user.email}). Verifique se a vinculação está correta!`);
            }
          } else {
            this.logger.warn(`Fallback 2: nenhuma assinatura pendente encontrada com valor correspondente (${paymentAmount}) no período de 7 dias`);
          }
        }

        // Se ainda não encontrou assinatura, fazer log de debug e retornar
        if (!subscription) {
          // Tentar buscar todas as assinaturas pendentes para debug
          const pendingSubs = await this.prisma.subscription.findMany({
            where: { status: 'PENDING_PAYMENT' },
            take: 5,
          });
          this.logger.warn(`Assinaturas pendentes encontradas: ${pendingSubs.length}`);
          pendingSubs.forEach(sub => {
            this.logger.warn(`  - Subscription ${sub.id}: mp_preference_id=${sub.mp_preference_id}, mp_payment_id=${sub.mp_payment_id}`);
          });
          return;
        }
      }

      this.logger.log(`Assinatura ${subscription.id} encontrada para pagamento ${paymentId}`);

      // Criar ou atualizar registro de pagamento independente do status
      const existingPayment = await this.getPaymentByMpId(paymentId);
      const paymentStatus = this.mapMpStatusToDbStatus(payment.status);
      
      if (!existingPayment) {
        this.logger.log(`Criando registro de pagamento para assinatura ${subscription.id}`);
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscription.id,
            mp_payment_id: paymentId,
            amount: payment.transaction_amount,
            status: paymentStatus,
            payment_method: payment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
            payer_email: payment.payer?.email || null,
            payer_cpf: payment.payer?.identification?.number || null,
          },
        });
        this.logger.log(`Registro de pagamento criado com status: ${paymentStatus}`);
      } else {
        this.logger.log(`Atualizando registro de pagamento ${existingPayment.id} para status: ${paymentStatus}`);
        await this.updatePaymentStatus(existingPayment.id, paymentStatus);
      }

      // SEMPRE atualizar mp_payment_id na assinatura quando o pagamento é identificado
      // Isso garante que a assinatura tenha o payment_id para sincronização futura
      if (subscription.mp_payment_id !== paymentId) {
        this.logger.log(`Atualizando mp_payment_id na assinatura ${subscription.id} para ${paymentId}`);
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { mp_payment_id: paymentId },
        });
        // Atualizar objeto local para refletir a mudança
        subscription.mp_payment_id = paymentId;
      }

      // Se pagamento foi aprovado, ativar assinatura
      if (payment.status === 'approved') {
        this.logger.log(`Pagamento ${paymentId} está aprovado, ativando assinatura ${subscription.id}`);
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + subscription.plan.duration_days);

        // Atualizar assinatura
        subscription = await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            start_date: startDate,
            end_date: endDate,
            mp_payment_id: paymentId,
            payment_method: payment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
          },
          include: {
            plan: true,
            user: true,
          },
        });

        // Pagamento já foi criado/atualizado acima

        // Ativar usuário e adicionar role de subscriber
        await this.prisma.user.update({
          where: { id: subscription.user_id },
          data: {
            is_active: true,
          },
        });

        // Verificar se já tem role de subscriber
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

        this.logger.log(`Assinatura ${subscription.id} ativada para usuário ${subscription.user.email}`);

        // Enviar email de confirmação de pagamento
        await this.sendPaymentConfirmationEmail(subscription, payment);
        
        // Enviar email de ativação de assinatura (se usuário já tem senha definida)
        if (this.emailService && !subscription.user.must_change_password) {
          try {
            const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
            const loginUrl = `${baseUrl}/login`;
            
            await this.emailService.sendSubscriptionActivatedEmail(subscription.user.email, {
              planName: subscription.plan.name,
              loginUrl: loginUrl,
              email: subscription.user.email,
              endDate: endDate,
            });
            
            this.logger.log(`Email de ativação de assinatura enviado para ${subscription.user.email}`);
          } catch (error: any) {
            this.logger.error(`Erro ao enviar email de ativação para ${subscription.user.email}:`, error);
          }
        }
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        // Atualizar assinatura para status apropriado
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'CANCELLED',
          },
        });

        // Criar registro de pagamento rejeitado (se ainda não existe)
        const existingPayment = await this.getPaymentByMpId(paymentId);
        if (!existingPayment) {
          await this.prisma.subscriptionPayment.create({
            data: {
              subscription_id: subscription.id,
              mp_payment_id: paymentId,
              amount: payment.transaction_amount,
              status: payment.status === 'rejected' ? 'REJECTED' : 'CANCELLED',
              payment_method: payment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
            },
          });
        }
      } else {
        // Para outros status (pending, in_process, etc), apenas logar
        this.logger.log(`Pagamento ${paymentId} com status ${payment.status}, aguardando aprovação`);
      }
    } catch (error: any) {
      this.logger.error('Erro ao processar pagamento aprovado:', error);
      throw error;
    }
  }

  /**
   * Mapeia status do Mercado Pago para status do banco de dados
   */
  mapMpStatusToDbStatus(mpStatus: string): string {
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
      refunded_partially: 'REFUNDED',
      cancelled_by_user: 'CANCELLED',
      cancelled_by_admin: 'CANCELLED',
    };
    return statusMap[mpStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Busca assinatura do usuário atual
   */
  async getMySubscription(userId: number): Promise<any> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { user_id: userId },
      include: {
        plan: true,
        payments: {
          orderBy: { created_at: 'desc' },
          take: 10,
        },
      },
      orderBy: { created_at: 'desc' },
    });
    // Retornar null ao invés de lançar exceção para permitir acesso à página /my-plan
    if (!subscription) {
      return null;
    }
    return subscription;
  }

  /**
   * Verifica se assinatura está ativa
   */
  async isSubscriptionActive(userId: number): Promise<boolean> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
    if (!subscription) {
      return false;
    }
    if (subscription.status !== 'ACTIVE') {
      return false;
    }
    if (subscription.end_date && subscription.end_date < new Date()) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });
      return false;
    }
    return true;
  }

  /**
   * Cancela assinatura
   */
  async cancelSubscription(userId: number) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }
    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        auto_renew: false,
      },
    });
  }

  /**
   * Renova assinatura
   */
  async renewSubscription(userId: number, billingPeriod: 'monthly' | 'quarterly') {
    const subscription = await this.prisma.subscription.findFirst({
      where: { user_id: userId },
      include: { 
        plan: true,
        user: true,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    if (subscription.status !== 'ACTIVE' && subscription.status !== 'EXPIRED') {
      throw new BadRequestException('Apenas assinaturas ativas ou expiradas podem ser renovadas');
    }

    const amount = billingPeriod === 'monthly' 
      ? Number(subscription.plan.price_monthly) 
      : Number(subscription.plan.price_quarterly);

    const durationDays = billingPeriod === 'monthly' ? 30 : 90;

    // Buscar dados do assinante
    const subscriberProfile = await this.prisma.subscriberProfile.findUnique({
      where: { user_id: userId },
    });

    if (!subscriberProfile) {
      throw new BadRequestException('Perfil do assinante não encontrado');
    }

    // Criar preferência no Mercado Pago
    const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
    const preference = await this.mercadoPagoService.createPreference({
      planId: subscription.plan_id,
      planName: subscription.plan.name,
      amount,
      billingPeriod,
      subscriberData: {
        email: subscription.user.email,
        fullName: subscriberProfile.address_street || 'Assinante', // Usar nome do perfil se disponível
        cpf: subscriberProfile.cpf_enc ? await this.decryptCpf(subscriberProfile.cpf_enc) : '',
      },
      backUrls: {
        success: `${baseUrl}/subscribe/success?preference_id={preference_id}`,
        failure: `${baseUrl}/subscribe/failure`,
        pending: `${baseUrl}/subscribe/pending`,
      },
    });

    // Criar nova assinatura com status PENDING_PAYMENT
    await this.prisma.subscription.create({
      data: {
        user_id: userId,
        plan_id: subscription.plan_id,
        status: 'PENDING_PAYMENT',
        start_date: null,
        end_date: null,
        auto_renew: false,
        mp_preference_id: preference.id,
      },
    });

    return {
      preference_id: preference.id,
      init_point: this.configService.get<string>('MERCADOPAGO_ENVIRONMENT') === 'sandbox'
        ? preference.sandbox_init_point
        : preference.init_point,
    };
  }

  /**
   * Finaliza registro do assinante após pagamento
   */
  async completeRegistration(token: string, password: string, email?: string) {
    // Se o provider for MvM Pay, não usamos token (fluxo por email + validação no MvM Pay)
    const providerSetting = await this.prisma.systemSetting.findUnique({
      where: { key: 'subscription_provider' },
    });
    const provider = providerSetting?.value || 'native';

    if (provider === 'mvm_pay') {
      if (!email) {
        throw new BadRequestException('Email é obrigatório para finalizar cadastro via MvM Pay');
      }

      const access = await this.mvmPayService.authAccess(email);
      const hasAccess = !!access?.data?.has_access;
      if (!hasAccess) {
        throw new BadRequestException('Assinatura ativa necessária para finalizar cadastro');
      }

      // Buscar a assinatura no MvM Pay para obter plan_id e end_date
      const subs = await this.mvmPayService.getUserSubscriptions(email);
      const candidate = subs?.data?.subscriptions?.find((s) => ['ativo', 'trial', 'ACTIVE', 'TRIAL'].includes(String(s.status))) ||
        subs?.data?.subscriptions?.[0];

      if (!candidate?.plan_id) {
        throw new BadRequestException('Não foi possível identificar o plano no MvM Pay');
      }

      const localPlan = await this.prisma.subscriptionPlan.findFirst({
        where: { mvm_pay_plan_id: candidate.plan_id },
      });
      if (!localPlan) {
        throw new BadRequestException(
          `Plano do MvM Pay (plan_id=${candidate.plan_id}) não está mapeado no MVCash (mvm_pay_plan_id)`
        );
      }

      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 12);

      // Criar/atualizar usuário
      const user = await this.prisma.user.upsert({
        where: { email },
        create: {
          email,
          password_hash: passwordHash,
          is_active: true,
          must_change_password: false,
        },
        update: {
          password_hash: passwordHash,
          is_active: true,
          must_change_password: false,
        },
      });

      // Garantir role subscriber
      await this.prisma.userRole.upsert({
        where: { user_id_role: { user_id: user.id, role: 'subscriber' } },
        create: { user_id: user.id, role: 'subscriber' },
        update: {},
      });

      const endDate = candidate.end_date ? new Date(candidate.end_date) : (() => {
        const d = new Date();
        d.setDate(d.getDate() + localPlan.duration_days);
        return d;
      })();

      // Evitar criar múltiplas assinaturas repetidas no cadastro: atualizar a mais recente se existir
      const lastSub = await this.prisma.subscription.findFirst({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
      });

      if (lastSub) {
        await this.prisma.subscription.update({
          where: { id: lastSub.id },
          data: {
            plan_id: localPlan.id,
            status: 'ACTIVE',
            start_date: lastSub.start_date || new Date(),
            end_date: endDate,
            auto_renew: false,
            payment_method: 'MVM_PAY',
          },
        });
      } else {
        await this.prisma.subscription.create({
          data: {
            user_id: user.id,
            plan_id: localPlan.id,
            status: 'ACTIVE',
            start_date: new Date(),
            end_date: endDate,
            auto_renew: false,
            payment_method: 'MVM_PAY',
          },
        });
      }

      return {
        message: 'Cadastro concluído com sucesso',
        user_id: user.id,
        email: user.email,
      };
    }

    // Buscar usuário por token (email) ou email fornecido
    // Em produção, seria melhor ter uma tabela de tokens de registro
    let user = null;

    if (email) {
      // Buscar por email
      user = await this.prisma.user.findFirst({
        where: {
          email: email,
          must_change_password: true,
          is_active: true,
          roles: {
            some: {
              role: 'subscriber',
            },
          },
        },
        include: {
          subscriptions: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      });
    } else {
      // Buscar por token (por enquanto, busca qualquer assinante pendente)
      // Em produção, implementar tabela de tokens
      user = await this.prisma.user.findFirst({
        where: {
          must_change_password: true,
          is_active: true,
          roles: {
            some: {
              role: 'subscriber',
            },
          },
        },
        include: {
          subscriptions: {
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
    }

    if (!user || !user.subscriptions || user.subscriptions.length === 0) {
      throw new BadRequestException('Token inválido ou assinatura não encontrada');
    }

    const subscription = user.subscriptions[0];
    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestException('Assinatura não está ativa');
    }

    // Atualizar senha
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        must_change_password: false,
      },
    });

    // Enviar email de boas-vindas com credenciais de acesso
    if (this.emailService) {
      try {
        const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
        const loginUrl = `${baseUrl}/login`;
        
        await this.emailService.sendSubscriptionActivatedEmail(user.email, {
          planName: subscription.plan.name,
          loginUrl: loginUrl,
          email: user.email,
          endDate: subscription.end_date || new Date(),
        });
        
        this.logger.log(`Email de ativação de assinatura enviado para ${user.email}`);
      } catch (error: any) {
        this.logger.error(`Erro ao enviar email de ativação para ${user.email}:`, error);
        // Não lançar erro para não interromper o fluxo
      }
    }

    return {
      message: 'Registro concluído com sucesso',
      user_id: user.id,
      email: user.email,
    };
  }

  /**
   * Criptografa CPF
   */
  private async encryptCpf(cpf: string): Promise<string> {
    return await this.encryptionService.encrypt(cpf.replace(/\D/g, ''));
  }

  /**
   * Descriptografa CPF
   */
  private async decryptCpf(encryptedCpf: string): Promise<string> {
    return await this.encryptionService.decrypt(encryptedCpf);
  }

  /**
   * Busca assinatura por ID
   */
  async getSubscriptionById(subscriptionId: number): Promise<any> {
    return await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        user: true,
      },
    });
  }

  /**
   * Busca assinatura por preference_id do Mercado Pago
   */
  async getSubscriptionByPreferenceId(preferenceId: string): Promise<any> {
    return await this.prisma.subscription.findFirst({
      where: { mp_preference_id: preferenceId },
      include: {
        plan: true,
        user: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Busca pagamento por mp_payment_id
   */
  async getPaymentByMpId(mpPaymentId: string): Promise<any> {
    return await this.prisma.subscriptionPayment.findFirst({
      where: { mp_payment_id: mpPaymentId },
    });
  }

  /**
   * Cria registro de pagamento
   */
  async createPaymentRecord(data: {
    subscription_id?: number; // Opcional: só vinculado quando aprovado
    mp_payment_id: string;
    amount: number;
    status: string;
    payment_method: string;
    payer_cpf?: string;
    payer_email?: string;
  }): Promise<any> {
    return await this.prisma.subscriptionPayment.create({
      data: {
        subscription_id: data.subscription_id || null,
        mp_payment_id: data.mp_payment_id,
        amount: data.amount,
        status: data.status,
        payment_method: data.payment_method,
        payer_cpf: data.payer_cpf || null,
        payer_email: data.payer_email || null,
      },
    });
  }

  /**
   * Atualiza status do pagamento
   */
  async updatePaymentStatus(paymentId: number, status: string): Promise<any> {
    return await this.prisma.subscriptionPayment.update({
      where: { id: paymentId },
      data: { status },
    });
  }

  /**
   * Atualiza mp_payment_id na assinatura
   */
  async updateSubscriptionPaymentId(subscriptionId: number, mpPaymentId: string): Promise<any> {
    return await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { mp_payment_id: mpPaymentId },
    });
  }

  /**
   * Envia email de confirmação de pagamento TransFi
   */
  private async sendTransFiPaymentConfirmationEmail(subscription: any, order: any): Promise<void> {
    if (!this.emailService) {
      this.logger.warn('EmailService não configurado, pulando envio de email de confirmação');
      return;
    }

    try {
      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
      const registrationUrl = `${baseUrl}/subscribe/register?email=${encodeURIComponent(subscription.user.email)}`;
      
      // Usar método do EmailService para melhor rastreamento
      await this.emailService.sendPaymentConfirmedEmail(subscription.user.email, {
        planName: subscription.plan.name,
        amount: order.amount,
        paymentMethod: order.paymentMethod || 'TransFi',
        registrationUrl: registrationUrl,
        endDate: subscription.end_date || new Date(),
      });

      this.logger.log(`Email de confirmação TransFi enviado para ${subscription.user.email}`);
    } catch (error: any) {
      this.logger.error('Erro ao enviar email de confirmação TransFi:', error);
      // Não lançar erro para não interromper o fluxo
    }
  }

  /**
   * Envia email de confirmação de pagamento
   */
  private async sendPaymentConfirmationEmail(subscription: any, payment: any): Promise<void> {
    if (!this.emailService) {
      this.logger.warn('EmailService não configurado, pulando envio de email de confirmação');
      return;
    }

    try {
      const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
      const registrationUrl = `${baseUrl}/subscribe/register?email=${encodeURIComponent(subscription.user.email)}`;
      
      // Usar método do EmailService para melhor rastreamento
      await this.emailService.sendPaymentConfirmedEmail(subscription.user.email, {
        planName: subscription.plan.name,
        amount: payment.transaction_amount,
        paymentMethod: payment.payment_method_id === 'pix' ? 'PIX' : 'Cartão de Crédito',
        registrationUrl: registrationUrl,
        endDate: subscription.end_date || new Date(),
      });
      
      this.logger.log(`Email de confirmação enviado para ${subscription.user.email}`);
    } catch (error: any) {
      this.logger.error(`Erro ao enviar email de confirmação para ${subscription.user.email}:`, error);
      // Não lançar erro para não interromper o fluxo de pagamento
    }
  }
}
