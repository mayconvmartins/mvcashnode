import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import * as crypto from 'crypto';

// Tipos para o TransFi
export interface TransFiPayinRequest {
  amount: number;
  currency: string; // BRL, USD, etc
  paymentMethod: string; // PIX, CARD, etc
  description: string;
  customerData: {
    email: string;
    fullName?: string;
    cpf?: string;
    phone?: string;
  };
  metadata?: Record<string, any>;
}

export interface TransFiOrder {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
  paymentData?: {
    qrCode?: string;
    qrCodeBase64?: string;
    paymentUrl?: string;
  };
  metadata?: Record<string, any>;
}

export interface TransFiRefundRequest {
  orderId: string;
  amount?: number;
  reason?: string;
}

@Injectable()
export class TransFiService {
  private readonly logger = new Logger(TransFiService.name);
  private configCache: {
    merchantId: string;
    username: string;
    password: string;
    webhookSecret: string;
    environment: 'sandbox' | 'production';
    webhookUrl?: string;
    redirectUrl?: string;
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
    merchantId: string;
    username: string;
    password: string;
    webhookSecret: string;
    environment: 'sandbox' | 'production';
    webhookUrl?: string;
    redirectUrl?: string;
  }> {
    // Verificar cache
    if (this.configCache && Date.now() < this.cacheExpiry) {
      return this.configCache;
    }

    // Buscar do banco
    const config = await this.prisma.transFiConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      // Fallback para variáveis de ambiente se não houver config no banco
      const fallbackMerchantId = this.configService.get<string>('TRANSFI_MERCHANT_ID') || '';
      const fallbackUsername = this.configService.get<string>('TRANSFI_USERNAME') || '';
      const fallbackPassword = this.configService.get<string>('TRANSFI_PASSWORD') || '';
      const fallbackSecret = this.configService.get<string>('TRANSFI_WEBHOOK_SECRET') || '';
      const fallbackEnv = (this.configService.get<string>('TRANSFI_ENVIRONMENT') || 'sandbox') as 'sandbox' | 'production';

      this.configCache = {
        merchantId: fallbackMerchantId,
        username: fallbackUsername,
        password: fallbackPassword,
        webhookSecret: fallbackSecret,
        environment: fallbackEnv,
        webhookUrl: this.configService.get<string>('TRANSFI_WEBHOOK_URL'),
        redirectUrl: this.configService.get<string>('TRANSFI_REDIRECT_URL'),
      };
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      return this.configCache;
    }

    // Descriptografar dados
    const password = await this.encryptionService.decrypt(config.password_enc);
    const webhookSecret = config.webhook_secret_enc
      ? await this.encryptionService.decrypt(config.webhook_secret_enc)
      : '';

    this.configCache = {
      merchantId: config.merchant_id,
      username: config.username,
      password,
      webhookSecret,
      environment: config.environment as 'sandbox' | 'production',
      webhookUrl: config.webhook_url || undefined,
      redirectUrl: config.redirect_url || undefined,
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
   * Cria autenticação Basic Auth para requisições
   */
  private getAuthHeader(config: { merchantId: string; username: string; password: string }): string {
    const credentials = `${config.username}:${config.password}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Obtém a URL base da API baseado no environment
   */
  private getBaseUrl(environment: 'sandbox' | 'production'): string {
    return environment === 'production'
      ? 'https://api.transfi.com'
      : 'https://sandbox-api.transfi.com';
  }

  /**
   * Cria um payin fiat (PIX ou cartão) que converte para USDT
   */
  async createPayin(data: TransFiPayinRequest): Promise<TransFiOrder> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const payinData = {
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        description: data.description,
        customerData: data.customerData,
        metadata: {
          ...data.metadata,
          targetCurrency: 'USDT', // Sempre receber em USDT
        },
      };

      const response = await fetch(`${baseUrl}/v2/fiat-order/payin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
        body: JSON.stringify(payinData),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; error?: string };
        this.logger.error('Erro ao criar payin TransFi:', error);
        throw new BadRequestException(
          error?.message || error?.error || 'Erro ao criar pagamento TransFi'
        );
      }

      const order = await response.json() as TransFiOrder;
      this.logger.log(`Payin TransFi criado: ${order.orderId}`);
      return order;
    } catch (error: any) {
      this.logger.error('Erro ao criar payin TransFi:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao criar pagamento TransFi'
      );
    }
  }

  /**
   * Cria um payin crypto (criptomoedas) que converte para USDT
   */
  async createCryptoPayin(data: {
    amount: number;
    sourceCurrency: string; // BTC, ETH, etc
    description: string;
    customerData: {
      email: string;
      walletAddress?: string;
    };
    metadata?: Record<string, any>;
  }): Promise<TransFiOrder> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const payinData = {
        amount: data.amount,
        sourceCurrency: data.sourceCurrency,
        targetCurrency: 'USDT',
        description: data.description,
        customerData: data.customerData,
        metadata: data.metadata,
      };

      const response = await fetch(`${baseUrl}/v2/crypto-order/payin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
        body: JSON.stringify(payinData),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; error?: string };
        this.logger.error('Erro ao criar crypto payin TransFi:', error);
        throw new BadRequestException(
          error?.message || error?.error || 'Erro ao criar pagamento crypto TransFi'
        );
      }

      const order = await response.json() as TransFiOrder;
      this.logger.log(`Crypto payin TransFi criado: ${order.orderId}`);
      return order;
    } catch (error: any) {
      this.logger.error('Erro ao criar crypto payin TransFi:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao criar pagamento crypto TransFi'
      );
    }
  }

  /**
   * Busca detalhes de um pedido fiat
   */
  async getOrderDetails(orderId: string): Promise<TransFiOrder> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const response = await fetch(`${baseUrl}/v2/fiat-order/${orderId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; error?: string };
        this.logger.error('Erro ao buscar pedido TransFi:', error);
        throw new BadRequestException(
          error?.message || error?.error || 'Erro ao buscar pedido TransFi'
        );
      }

      return await response.json() as TransFiOrder;
    } catch (error: any) {
      this.logger.error('Erro ao buscar pedido TransFi:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao buscar pedido TransFi'
      );
    }
  }

  /**
   * Estorna um pagamento (via payout)
   */
  async refundPayment(data: TransFiRefundRequest): Promise<any> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const refundData: any = {
        orderId: data.orderId,
      };

      if (data.amount !== undefined && data.amount > 0) {
        refundData.amount = data.amount;
      }

      if (data.reason) {
        refundData.reason = data.reason;
      }

      const response = await fetch(`${baseUrl}/v2/fiat-order/payout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
        body: JSON.stringify(refundData),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; error?: string };
        this.logger.error('Erro ao estornar pagamento TransFi:', error);
        throw new BadRequestException(
          error?.message || error?.error || 'Erro ao estornar pagamento TransFi'
        );
      }

      const refundResult = await response.json();
      this.logger.log(`Pagamento ${data.orderId} estornado com sucesso`);
      return refundResult;
    } catch (error: any) {
      this.logger.error('Erro ao estornar pagamento TransFi:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao estornar pagamento TransFi'
      );
    }
  }

  /**
   * Valida a assinatura do webhook do TransFi
   */
  async validateWebhookSignature(
    signature: string,
    payload: string,
    secret: string
  ): Promise<boolean> {
    try {
      if (!secret) {
        this.logger.warn('Webhook secret não configurado, pulando validação');
        return true; // Em desenvolvimento, pode pular validação
      }

      // TransFi geralmente usa HMAC SHA256
      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return signature === hash || signature === `sha256=${hash}`;
    } catch (error) {
      this.logger.error('Erro ao validar assinatura do webhook:', error);
      return false;
    }
  }

  /**
   * Processa um webhook do TransFi
   */
  async processWebhook(event: {
    id: string;
    type: string;
    orderId: string;
    status: string;
    data?: any;
  }): Promise<void> {
    try {
      // Salvar evento no banco
      await this.prisma.transFiWebhookEvent.create({
        data: {
          transfi_event_id: event.id,
          transfi_event_type: event.type,
          transfi_resource_id: event.orderId,
          raw_payload_json: event as any,
          processed: false,
        },
      });

      // Se for evento de pagamento, buscar detalhes
      if (event.type === 'order.status_changed' || event.type === 'payment.completed') {
        const order = await this.getOrderDetails(event.orderId);
        
        // Atualizar evento como processado
        await this.prisma.transFiWebhookEvent.updateMany({
          where: { transfi_event_id: event.id },
          data: { processed: true, processed_at: new Date() },
        });

        this.logger.log(`Pedido ${order.orderId} processado: ${order.status}`);
      }
    } catch (error: any) {
      this.logger.error('Erro ao processar webhook do TransFi:', error);
      throw error;
    }
  }

  /**
   * Verifica status de um pagamento
   */
  async getPaymentStatus(orderId: string): Promise<{ status: string; order: TransFiOrder }> {
    try {
      const order = await this.getOrderDetails(orderId);
      return {
        status: order.status,
        order,
      };
    } catch (error: any) {
      this.logger.error('Erro ao verificar status do pagamento:', error);
      throw new BadRequestException('Erro ao verificar status do pagamento');
    }
  }

  /**
   * Lista moedas suportadas
   */
  async getSupportedCurrencies(): Promise<any> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const response = await fetch(`${baseUrl}/v2/supported-currencies`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; error?: string };
        this.logger.error('Erro ao listar moedas TransFi:', error);
        throw new BadRequestException('Erro ao listar moedas suportadas');
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('Erro ao listar moedas TransFi:', error);
      throw new BadRequestException('Erro ao listar moedas suportadas');
    }
  }

  /**
   * Lista métodos de pagamento disponíveis
   */
  async getPaymentMethods(params: {
    currency?: string;
    direction?: 'deposit' | 'withdraw';
    limit?: number;
    page?: number;
  }): Promise<any> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const queryParams = new URLSearchParams();
      if (params.currency) queryParams.append('currency', params.currency);
      if (params.direction) queryParams.append('direction', params.direction);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.page) queryParams.append('page', params.page.toString());

      const response = await fetch(`${baseUrl}/v2/payment-methods?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error('Erro ao listar métodos de pagamento TransFi:', error);
        throw new BadRequestException('Erro ao listar métodos de pagamento');
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('Erro ao listar métodos de pagamento TransFi:', error);
      throw new BadRequestException('Erro ao listar métodos de pagamento');
    }
  }
}
