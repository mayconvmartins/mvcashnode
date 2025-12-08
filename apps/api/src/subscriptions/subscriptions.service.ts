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
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // return this.prisma.subscriptionPlan.findMany({
    //   where: { is_active: true },
    //   orderBy: { price_monthly: 'asc' },
    // });
    return []; // Temporário até criar modelos no schema
  }

  /**
   * Busca um plano por ID
   */
  async getPlanById(planId: number) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // const plan = await this.prisma.subscriptionPlan.findUnique({
    //   where: { id: planId },
    // });
    // if (!plan) {
    //   throw new NotFoundException('Plano não encontrado');
    // }
    // return plan;
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
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

    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // Criar assinatura com status PENDING_PAYMENT
    // const subscription = await this.prisma.subscription.create({
    //   data: {
    //     user_id: user.id,
    //     plan_id: plan.id,
    //     status: 'PENDING_PAYMENT',
    //     start_date: null,
    //     end_date: null,
    //     auto_renew: false,
    //     mp_preference_id: preference.id,
    //   },
    // });

    // TODO: Salvar dados do assinante (temporário, será confirmado após pagamento)
    // await this.prisma.subscriberProfile.upsert({
    //   where: { user_id: user.id },
    //   create: { ... },
    //   update: { ... },
    // });

    return {
      preference_id: preference.id,
      init_point: this.configService.get<string>('MERCADOPAGO_ENVIRONMENT') === 'sandbox'
        ? preference.sandbox_init_point
        : preference.init_point,
      subscription_id: 0, // Temporário até criar modelos
    };
  }

  /**
   * Processa pagamento aprovado do Mercado Pago
   */
  async processApprovedPayment(paymentId: string) {
    try {
      const payment = await this.mercadoPagoService.getPayment(paymentId);

      // TODO: Modelos Subscription ainda não foram criados no schema Prisma
      // Todo o código abaixo precisa ser descomentado quando os modelos forem criados
      this.logger.warn(`Processamento de pagamento ${paymentId} - Modelos de subscription ainda não foram criados no schema`);
      // TODO: Descomentar quando modelos forem criados
      // let subscription = await this.prisma.subscription.findFirst({ ... });
      // ... resto do código comentado
    } catch (error: any) {
      this.logger.error('Erro ao processar pagamento aprovado:', error);
      throw error;
    }
  }

  /**
   * Busca assinatura do usuário atual
   */
  async getMySubscription(userId: number) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // const subscription = await this.prisma.subscription.findUnique({
    //   where: { user_id: userId },
    //   include: {
    //     plan: true,
    //     payments: {
    //       orderBy: { created_at: 'desc' },
    //       take: 10,
    //     },
    //   },
    // });
    // if (!subscription) {
    //   throw new NotFoundException('Assinatura não encontrada');
    // }
    // return subscription;
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }

  /**
   * Verifica se assinatura está ativa
   */
  async isSubscriptionActive(userId: number): Promise<boolean> {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // const subscription = await this.prisma.subscription.findUnique({
    //   where: { user_id: userId },
    // });
    // if (!subscription) {
    //   return false;
    // }
    // if (subscription.status !== 'ACTIVE') {
    //   return false;
    // }
    // if (subscription.end_date && subscription.end_date < new Date()) {
    //   await this.prisma.subscription.update({
    //     where: { id: subscription.id },
    //     data: { status: 'EXPIRED' },
    //   });
    //   return false;
    // }
    // return true;
    return false; // Temporário até criar modelos
  }

  /**
   * Cancela assinatura
   */
  async cancelSubscription(userId: number) {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // const subscription = await this.prisma.subscription.findUnique({
    //   where: { user_id: userId },
    // });
    // if (!subscription) {
    //   throw new NotFoundException('Assinatura não encontrada');
    // }
    // return this.prisma.subscription.update({
    //   where: { id: subscription.id },
    //   data: {
    //     status: 'CANCELLED',
    //     auto_renew: false,
    //   },
    // });
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
  }

  /**
   * Renova assinatura
   */
  async renewSubscription(userId: number, billingPeriod: 'monthly' | 'quarterly') {
    // TODO: Modelos Subscription ainda não foram criados no schema Prisma
    // Todo o código abaixo precisa ser descomentado quando os modelos forem criados
    throw new NotFoundException('Modelos de subscription ainda não foram criados no schema. Execute a migration primeiro.');
    // const subscription = await this.prisma.subscription.findUnique({ ... });
    // ... resto do código comentado

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
        // TODO: include subscription quando modelo for criado
        // include: {
        //   subscription: true,
        // },
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
        // TODO: include subscription quando modelo for criado
        // include: {
        //   subscription: true,
        // },
        orderBy: {
          created_at: 'desc',
        },
      });
    }

    // TODO: Verificar subscription quando modelo for criado
    // if (!user || !user.subscription) {
    //   throw new BadRequestException('Token inválido ou assinatura não encontrada');
    // }
    // if (user.subscription.status !== 'ACTIVE') {
    //   throw new BadRequestException('Assinatura não está ativa');
    // }

    if (!user) {
      throw new BadRequestException('Token inválido ou assinatura não encontrada');
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
