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
        cpf_enc: this.encryptCpf(data.subscriberData.cpf),
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
        cpf_enc: this.encryptCpf(data.subscriberData.cpf),
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

        // Criar registro de pagamento
        await this.prisma.subscriptionPayment.create({
          data: {
            subscription_id: subscription.id,
            mp_payment_id: paymentId,
            amount: payment.transaction_amount,
            status: 'APPROVED',
            payment_method: payment.payment_method_id === 'pix' ? 'PIX' : 'CARD',
          },
        });

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
  async getMySubscription(userId: number) {
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
        cpf: subscriberProfile.cpf_enc ? this.decryptCpf(subscriberProfile.cpf_enc) : '',
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
