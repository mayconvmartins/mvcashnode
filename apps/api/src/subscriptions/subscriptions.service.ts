import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { EmailService } from '@mvcashnode/notifications';
import { MercadoPagoService } from './mercadopago.service';
import { TransFiService } from './transfi.service';
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
    private transfiService: TransFiService
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
      const payment = await this.mercadoPagoService.getPayment(paymentId);

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
        this.logger.warn(`Assinatura não encontrada para pagamento ${paymentId}`);
        return;
      }

      // Se pagamento foi aprovado, ativar assinatura
      if (payment.status === 'approved') {
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

        // Verificar se pagamento já existe, se não, criar
        const existingPayment = await this.getPaymentByMpId(paymentId);
        if (!existingPayment) {
          await this.prisma.subscriptionPayment.create({
            data: {
              subscription_id: subscription.id,
              mp_payment_id: paymentId,
              amount: payment.transaction_amount,
              status: 'APPROVED',
              payment_method: payment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
            },
          });
        } else {
          // Atualizar status do pagamento existente
          await this.updatePaymentStatus(existingPayment.id, 'APPROVED');
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

        this.logger.log(`Assinatura ${subscription.id} ativada para usuário ${subscription.user.email}`);

        // Enviar email de confirmação de pagamento
        await this.sendPaymentConfirmationEmail(subscription, payment);
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        // Atualizar assinatura para status apropriado
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'CANCELLED',
          },
        });

        // Criar registro de pagamento rejeitado
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
    } catch (error: any) {
      this.logger.error('Erro ao processar pagamento aprovado:', error);
      throw error;
    }
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
    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
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
    subscription_id: number;
    mp_payment_id: string;
    amount: number;
    status: string;
    payment_method: string;
  }): Promise<any> {
    return await this.prisma.subscriptionPayment.create({
      data: {
        subscription_id: data.subscription_id,
        mp_payment_id: data.mp_payment_id,
        amount: data.amount,
        status: data.status,
        payment_method: data.payment_method,
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
      
      const subject = 'Pagamento Aprovado - Sua Assinatura está Ativa!';
      const html = `
        <h2>Pagamento Aprovado!</h2>
        <p>Olá,</p>
        <p>Seu pagamento via TransFi foi aprovado com sucesso!</p>
        <p><strong>Detalhes do Pagamento:</strong></p>
        <ul>
          <li>Pedido: ${order.orderId}</li>
          <li>Valor: ${order.amount} ${order.currency}</li>
          <li>Método: ${order.paymentMethod}</li>
          <li>Plano: ${subscription.plan.name}</li>
        </ul>
        <p>Sua assinatura está agora ativa. Para finalizar seu cadastro e definir sua senha, clique no link abaixo:</p>
        <p><a href="${registrationUrl}">Finalizar Cadastro</a></p>
        <p>Este link expira em 7 dias.</p>
        <p>Obrigado por escolher nosso serviço!</p>
      `;

      await this.emailService.sendEmail(
        subscription.user.email,
        subject,
        html
      );

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
      
      const subject = 'Pagamento Aprovado - Sua Assinatura está Ativa!';
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .info-box { background-color: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Pagamento Aprovado!</h1>
            </div>
            <div class="content">
              <p>Olá,</p>
              <p>Seu pagamento foi aprovado com sucesso e sua assinatura está agora ativa!</p>
              
              <div class="info-box">
                <strong>Detalhes da Assinatura:</strong><br>
                Plano: ${subscription.plan.name}<br>
                Valor: R$ ${payment.transaction_amount.toFixed(2)}<br>
                Método: ${payment.payment_method_id === 'pix' ? 'PIX' : 'Cartão'}<br>
                Status: Ativa<br>
                Válida até: ${subscription.end_date ? new Date(subscription.end_date).toLocaleDateString('pt-BR') : 'N/A'}
              </div>

              <p>Para acessar sua conta e começar a usar a plataforma, você precisa completar seu cadastro definindo uma senha.</p>
              
              <p>
                <a href="${registrationUrl}" class="button">Completar Cadastro</a>
              </p>

              <p>Ou copie e cole este link no seu navegador:</p>
              <p style="word-break: break-all; color: #666;">${registrationUrl}</p>

              <p>Se você não solicitou esta assinatura, entre em contato conosco imediatamente.</p>

              <p>Atenciosamente,<br>Equipe MV Cash</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.emailService.sendEmail(subscription.user.email, subject, html);
      this.logger.log(`Email de confirmação enviado para ${subscription.user.email}`);
    } catch (error: any) {
      this.logger.error(`Erro ao enviar email de confirmação para ${subscription.user.email}:`, error);
      // Não lançar erro para não interromper o fluxo de pagamento
    }
  }
}
