import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { MercadoPagoService } from './mercadopago.service';
import * as crypto from 'crypto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    private mercadoPagoService: MercadoPagoService
  ) {}

  /**
   * Lista todos os planos ativos
   */
  async getActivePlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { price_monthly: 'asc' },
    });
  }

  /**
   * Busca um plano por ID
   */
  async getPlanById(planId: number) {
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

    // Criar preferência no Mercado Pago
    const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
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

    // Verificar se já existe usuário com este email
    let user = await this.prisma.user.findUnique({
      where: { email: data.subscriberData.email },
    });

    // Se não existir, criar usuário temporário (será ativado após pagamento)
    if (!user) {
      // Gerar senha temporária (será alterada no registro)
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const { hashPassword } = await import('@mvcashnode/domain');
      const passwordHash = await hashPassword(tempPassword);

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

    // Salvar dados do assinante (temporário, será confirmado após pagamento)
    await this.prisma.subscriberProfile.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        full_name: data.subscriberData.fullName,
        cpf: this.encryptCpf(data.subscriberData.cpf),
        birth_date: data.subscriberData.birthDate,
        phone: data.subscriberData.phone,
        whatsapp: data.subscriberData.whatsapp,
        email: data.subscriberData.email,
        address_street: data.subscriberData.address.street,
        address_number: data.subscriberData.address.number,
        address_complement: data.subscriberData.address.complement,
        address_neighborhood: data.subscriberData.address.neighborhood,
        address_city: data.subscriberData.address.city,
        address_state: data.subscriberData.address.state,
        address_zipcode: data.subscriberData.address.zipcode,
      },
      update: {
        full_name: data.subscriberData.fullName,
        cpf: this.encryptCpf(data.subscriberData.cpf),
        birth_date: data.subscriberData.birthDate,
        phone: data.subscriberData.phone,
        whatsapp: data.subscriberData.whatsapp,
        email: data.subscriberData.email,
        address_street: data.subscriberData.address.street,
        address_number: data.subscriberData.address.number,
        address_complement: data.subscriberData.address.complement,
        address_neighborhood: data.subscriberData.address.neighborhood,
        address_city: data.subscriberData.address.city,
        address_state: data.subscriberData.address.state,
        address_zipcode: data.subscriberData.address.zipcode,
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
   * Processa pagamento aprovado do Mercado Pago
   */
  async processApprovedPayment(paymentId: string) {
    try {
      const payment = await this.mercadoPagoService.getPayment(paymentId);

      // Buscar assinatura pelo preference_id ou payment_id
      // O pagamento do MP pode ter preference_id no metadata ou podemos buscar por payment_id
      let subscription = await this.prisma.subscription.findFirst({
        where: {
          OR: [
            { mp_payment_id: paymentId },
            { mp_preference_id: (payment as any).preference_id },
            { mp_preference_id: paymentId }, // Fallback: tentar usar paymentId como preference_id
          ],
        },
        include: {
          plan: true,
          user: true,
        },
      });

      // Se não encontrou, buscar por assinatura pendente mais recente (fallback)
      if (!subscription) {
        subscription = await this.prisma.subscription.findFirst({
          where: {
            status: 'PENDING_PAYMENT',
          },
          include: {
            plan: true,
            user: true,
          },
          orderBy: {
            created_at: 'desc',
          },
        });
      }

      if (!subscription) {
        this.logger.warn(`Assinatura não encontrada para pagamento ${paymentId}`);
        return;
      }

      // Verificar se pagamento já foi processado
      const existingPayment = await this.prisma.subscriptionPayment.findFirst({
        where: { mp_payment_id: paymentId },
      });

      if (existingPayment && existingPayment.status === 'APPROVED') {
        this.logger.log(`Pagamento ${paymentId} já foi processado`);
        return;
      }

      // Criar/atualizar registro de pagamento
      if (existingPayment) {
        await this.prisma.subscriptionPayment.update({
          where: { id: existingPayment.id },
          data: {
            status: payment.status === 'approved' ? 'APPROVED' : 'PENDING',
            transaction_details_json: payment as any,
          },
        });
      } else {
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscription.id,
            mp_payment_id: paymentId,
            mp_preference_id: subscription.mp_preference_id || (payment as any).preference_id || undefined,
            amount: payment.transaction_amount,
            currency: payment.currency_id,
            status: payment.status === 'approved' ? 'APPROVED' : 'PENDING',
            payment_method: payment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
            payment_type_id: payment.payment_type_id,
            transaction_details_json: payment as any,
          },
        });
      }

      // Se pagamento foi aprovado, ativar assinatura
      if (payment.status === 'approved') {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + subscription.plan.duration_days);

        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            start_date: startDate,
            end_date: endDate,
            mp_payment_id: paymentId,
          },
        });

        // Ativar usuário
        await this.prisma.user.update({
          where: { id: subscription.user_id },
          data: { is_active: true },
        });

        // Adicionar role de assinante
        await this.prisma.userRole.upsert({
          where: {
            user_id_role: {
              user_id: subscription.user_id,
              role: 'subscriber',
            },
          },
          create: {
            user_id: subscription.user_id,
            role: 'subscriber',
          },
          update: {},
        });

        // Criar parâmetros padrão se não existirem
        await this.prisma.subscriberParameters.upsert({
          where: { user_id: subscription.user_id },
          create: {
            user_id: subscription.user_id,
            default_trade_mode: 'REAL',
            default_order_type: 'MARKET',
          },
          update: {},
        });

        // Gerar token de registro para finalizar cadastro
        const registrationToken = crypto.randomBytes(32).toString('hex');
        // Salvar token temporariamente (pode usar uma tabela de tokens ou incluir no subscriber_profile)
        // Por simplicidade, vamos usar o email como referência

        this.logger.log(`Assinatura ${subscription.id} ativada para usuário ${subscription.user_id}`);
      }
    } catch (error: any) {
      this.logger.error('Erro ao processar pagamento aprovado:', error);
      throw error;
    }
  }

  /**
   * Busca assinatura do usuário atual
   */
  async getMySubscription(userId: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
      include: {
        plan: true,
        payments: {
          orderBy: { created_at: 'desc' },
          take: 10,
        },
      },
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
    });

    if (!subscription) {
      return false;
    }

    if (subscription.status !== 'ACTIVE') {
      return false;
    }

    if (subscription.end_date && subscription.end_date < new Date()) {
      // Atualizar status para EXPIRED
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
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
    const subscription = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    const amount = billingPeriod === 'monthly' 
      ? Number(subscription.plan.price_monthly) 
      : Number(subscription.plan.price_quarterly);

    const durationDays = billingPeriod === 'monthly' ? 30 : 90;

    // Criar nova preferência de pagamento
    const subscriberProfile = await this.prisma.subscriberProfile.findUnique({
      where: { user_id: userId },
    });

    if (!subscriberProfile) {
      throw new BadRequestException('Perfil do assinante não encontrado');
    }

    const baseUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5010';
    const preference = await this.mercadoPagoService.createPreference({
      planId: subscription.plan_id,
      planName: subscription.plan.name,
      amount,
      billingPeriod,
      subscriberData: {
        email: subscriberProfile.email,
        fullName: subscriberProfile.full_name,
        cpf: this.decryptCpf(subscriberProfile.cpf),
      },
      backUrls: {
        success: `${baseUrl}/subscribe/success?preference_id={preference_id}`,
        failure: `${baseUrl}/subscribe/failure`,
        pending: `${baseUrl}/subscribe/pending`,
      },
    });

    // Atualizar assinatura com nova preferência
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'PENDING_PAYMENT',
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
          subscription: true,
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
          subscription: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      });
    }

    if (!user || !user.subscription) {
      throw new BadRequestException('Token inválido ou assinatura não encontrada');
    }

    // Verificar se assinatura está ativa
    if (user.subscription.status !== 'ACTIVE') {
      throw new BadRequestException('Assinatura não está ativa');
    }

    // Atualizar senha
    const { hashPassword } = await import('@mvcashnode/domain');
    const passwordHash = await hashPassword(password);

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
  private encryptCpf(cpf: string): string {
    return this.encryptionService.encrypt(cpf.replace(/\D/g, ''));
  }

  /**
   * Descriptografa CPF
   */
  private decryptCpf(encryptedCpf: string): string {
    return this.encryptionService.decrypt(encryptedCpf);
  }
}
