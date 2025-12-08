import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import * as crypto from 'crypto';

// Tipos para o Mercado Pago (simplificados)
interface MercadoPagoPreference {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

interface MercadoPagoPayment {
  id: string;
  status: string;
  status_detail: string;
  payment_method_id: string;
  payment_type_id: string;
  transaction_amount: number;
  currency_id: string;
  date_created: string;
  date_approved?: string;
  preference_id?: string;
  metadata?: any;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private configCache: {
    accessToken: string;
    publicKey: string;
    webhookSecret: string;
    environment: 'sandbox' | 'production';
    webhookUrl?: string;
  } | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {}

  /**
   * Busca configuração do banco de dados (com cache)
   */
  private async getConfig(): Promise<{
    accessToken: string;
    publicKey: string;
    webhookSecret: string;
    environment: 'sandbox' | 'production';
    webhookUrl?: string;
  }> {
    // Verificar cache
    if (this.configCache && Date.now() < this.cacheExpiry) {
      return this.configCache;
    }

    // Buscar do banco
    const config = await this.prisma.mercadoPagoConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      // Fallback para variáveis de ambiente se não houver config no banco
      const fallbackToken = this.configService.get<string>('MERCADOPAGO_ACCESS_TOKEN') || '';
      const fallbackKey = this.configService.get<string>('MERCADOPAGO_PUBLIC_KEY') || '';
      const fallbackSecret = this.configService.get<string>('MERCADOPAGO_WEBHOOK_SECRET') || '';
      const fallbackEnv = (this.configService.get<string>('MERCADOPAGO_ENVIRONMENT') || 'sandbox') as 'sandbox' | 'production';

      this.configCache = {
        accessToken: fallbackToken,
        publicKey: fallbackKey,
        webhookSecret: fallbackSecret,
        environment: fallbackEnv,
        webhookUrl: this.configService.get<string>('SUBSCRIPTION_WEBHOOK_URL'),
      };
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      return this.configCache;
    }

    // Descriptografar dados
    const accessToken = await this.encryptionService.decrypt(config.access_token_enc);
    const webhookSecret = config.webhook_secret_enc
      ? await this.encryptionService.decrypt(config.webhook_secret_enc)
      : '';

    this.configCache = {
      accessToken,
      publicKey: config.public_key,
      webhookSecret,
      environment: config.environment as 'sandbox' | 'production',
      webhookUrl: config.webhook_url || undefined,
    };
    this.cacheExpiry = Date.now() + this.CACHE_TTL;

    return this.configCache;
  }

  /**
   * Limpa o cache (útil após atualizar configuração)
   */
  clearCache() {
    this.configCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Cria uma preferência de pagamento no Mercado Pago
   */
  async createPreference(data: {
    planId: number;
    planName: string;
    amount: number;
    billingPeriod: 'monthly' | 'quarterly';
    subscriberData: {
      email: string;
      fullName: string;
      cpf: string;
    };
    backUrls: {
      success: string;
      failure: string;
      pending: string;
    };
  }): Promise<MercadoPagoPreference> {
    try {
      const config = await this.getConfig();
      const baseUrl = 'https://api.mercadopago.com';

      const preferenceData = {
        items: [
          {
            title: `${data.planName} - ${data.billingPeriod === 'monthly' ? 'Mensal' : 'Trimestral'}`,
            quantity: 1,
            unit_price: data.amount,
            currency_id: 'BRL',
          },
        ],
        payer: {
          name: data.subscriberData.fullName,
          email: data.subscriberData.email,
          identification: {
            type: 'CPF',
            number: data.subscriberData.cpf.replace(/\D/g, ''),
          },
        },
        back_urls: data.backUrls,
        auto_return: 'approved',
        payment_methods: {
          excluded_payment_types: [],
          excluded_payment_methods: [],
          installments: 12,
        },
        notification_url: config.webhookUrl || this.configService.get<string>('SUBSCRIPTION_WEBHOOK_URL') || '',
        statement_descriptor: 'MV Cash Assinatura',
        external_reference: `plan_${data.planId}_${data.billingPeriod}`,
      };

      const response = await fetch(`${baseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(preferenceData),
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error('Erro ao criar preferência MP:', error);
        throw new BadRequestException('Erro ao criar preferência de pagamento');
      }

      const preference = await response.json();
      return {
        id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
      };
    } catch (error: any) {
      this.logger.error('Erro ao criar preferência Mercado Pago:', error);
      throw new BadRequestException(error.message || 'Erro ao criar preferência de pagamento');
    }
  }

  /**
   * Busca informações de um pagamento no Mercado Pago
   */
  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    try {
      const config = await this.getConfig();
      const baseUrl = 'https://api.mercadopago.com';

      const response = await fetch(`${baseUrl}/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error('Erro ao buscar pagamento MP:', error);
        throw new BadRequestException('Erro ao buscar pagamento');
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('Erro ao buscar pagamento Mercado Pago:', error);
      throw new BadRequestException(error.message || 'Erro ao buscar pagamento');
    }
  }

  /**
   * Valida a assinatura do webhook do Mercado Pago
   */
  async validateWebhookSignature(xSignature: string, xRequestId: string, dataId: string): Promise<boolean> {
    try {
      const config = await this.getConfig();
      
      if (!config.webhookSecret) {
        this.logger.warn('Webhook secret não configurado, pulando validação');
        return true; // Em desenvolvimento, pode pular validação
      }

      // O Mercado Pago envia a assinatura no header x-signature
      // Formato: ts=timestamp,v1=hash
      const parts = xSignature.split(',');
      const signatureParts: Record<string, string> = {};
      
      parts.forEach(part => {
        const [key, value] = part.split('=');
        signatureParts[key] = value;
      });

      // Criar string para hash: data_id + request_id + secret
      const dataToHash = `data.id=${dataId};request.id=${xRequestId};`;
      const hash = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(dataToHash)
        .digest('hex');

      return signatureParts.v1 === hash;
    } catch (error) {
      this.logger.error('Erro ao validar assinatura do webhook:', error);
      return false;
    }
  }

  /**
   * Processa um webhook do Mercado Pago
   */
  async processWebhook(event: {
    id: string;
    type: string;
    action: string;
    data: { id: string };
  }): Promise<void> {
    try {
      // Salvar evento no banco
      await this.prisma.subscriptionWebhookEvent.create({
        data: {
          mp_event_id: event.id,
          mp_event_type: event.type,
          mp_resource_id: event.data.id,
          raw_payload_json: event as any,
          processed: false,
        },
      });

      // Se for evento de pagamento, buscar detalhes
      if (event.type === 'payment') {
        const payment = await this.getPayment(event.data.id);
        
        // Atualizar evento como processado
        await this.prisma.subscriptionWebhookEvent.updateMany({
          where: { mp_event_id: event.id },
          data: { processed: true, processed_at: new Date() },
        });

        // Processar pagamento (será feito no SubscriptionService)
        this.logger.log(`Pagamento ${payment.id} processado: ${payment.status}`);
      }
    } catch (error: any) {
      this.logger.error('Erro ao processar webhook do Mercado Pago:', error);
      throw error;
    }
  }

  /**
   * Cria pagamento com cartão (checkout transparente)
   */
  async createCardPayment(data: {
    token: string;
    issuerId: string;
    paymentMethodId: string;
    transactionAmount: number;
    installments: number;
    description: string;
    payer: {
      email: string;
      identification: {
        type: string;
        number: string;
      };
    };
  }): Promise<MercadoPagoPayment> {
    try {
      const config = await this.getConfig();
      const baseUrl = 'https://api.mercadopago.com';

      const paymentData = {
        token: data.token,
        issuer_id: data.issuerId,
        payment_method_id: data.paymentMethodId,
        transaction_amount: data.transactionAmount,
        installments: data.installments,
        description: data.description,
        payer: data.payer,
        statement_descriptor: 'MV Cash Assinatura',
      };

      const response = await fetch(`${baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error('Erro ao criar pagamento com cartão:', error);
        throw new BadRequestException(error.message || 'Erro ao processar pagamento');
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('Erro ao criar pagamento com cartão:', error);
      throw new BadRequestException(error.message || 'Erro ao processar pagamento');
    }
  }

  /**
   * Cria pagamento PIX (checkout transparente)
   */
  async createPixPayment(data: {
    transactionAmount: number;
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
  }): Promise<MercadoPagoPayment & { point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } } }> {
    try {
      const config = await this.getConfig();
      const baseUrl = 'https://api.mercadopago.com';

      const paymentData = {
        transaction_amount: data.transactionAmount,
        description: data.description,
        payment_method_id: 'pix',
        payer: data.payer,
        statement_descriptor: 'MV Cash Assinatura',
      };

      const response = await fetch(`${baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error('Erro ao criar pagamento PIX:', error);
        throw new BadRequestException(error.message || 'Erro ao processar pagamento PIX');
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('Erro ao criar pagamento PIX:', error);
      throw new BadRequestException(error.message || 'Erro ao processar pagamento PIX');
    }
  }

  /**
   * Verifica status de um pagamento
   */
  async getPaymentStatus(paymentId: string): Promise<{ status: string; status_detail: string }> {
    try {
      const payment = await this.getPayment(paymentId);
      return {
        status: payment.status,
        status_detail: payment.status_detail,
      };
    } catch (error: any) {
      this.logger.error('Erro ao verificar status do pagamento:', error);
      throw new BadRequestException('Erro ao verificar status do pagamento');
    }
  }
}
