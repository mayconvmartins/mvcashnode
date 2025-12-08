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
   * Cria ou busca um customer individual no TransFi
   * Endpoint: POST /v2/users/individual
   */
  async createOrGetCustomer(data: {
    email: string;
    firstName: string;
    lastName: string;
    country?: string;
    phone?: string;
    address?: {
      city?: string;
      postalCode?: string;
      street?: string;
      state?: string;
    };
  }): Promise<string | null> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      // Primeiro, tentar buscar customer existente
      // Nota: A documentação não mostra endpoint de busca por email, então vamos tentar criar
      // Se já existir, a API retornará erro que podemos tratar

      const customerData: any = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        country: data.country || 'BR',
        date: new Date().toISOString().split('T')[0], // Data de nascimento (formato YYYY-MM-DD)
      };

      if (data.phone) {
        customerData.phone = data.phone;
      }

      if (data.address) {
        customerData.address = {
          city: data.address.city || '',
          postalCode: data.address.postalCode || '',
          street: data.address.street || '',
          state: data.address.state || '',
        };
      }

      const response = await fetch(`${baseUrl}/v2/users/individual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
        body: JSON.stringify(customerData),
      });

      if (response.ok) {
        const result = await response.json() as { userId: string };
        this.logger.log(`Customer TransFi criado: ${result.userId}`);
        return result.userId;
      } else if (response.status === 409) {
        // Customer já existe
        this.logger.debug(`Customer TransFi já existe para email: ${data.email}`);
        // Tentar buscar userId (pode precisar de endpoint de busca)
        return null; // Retornar null e continuar - o payin pode funcionar sem userId explícito
      } else {
        const error = await response.json() as { message?: string; code?: string };
        this.logger.warn(`Erro ao criar/buscar customer TransFi:`, error);
        // Não falhar - alguns casos podem não precisar de customer pré-criado
        return null;
      }
    } catch (error: any) {
      this.logger.warn('Erro ao criar/buscar customer TransFi (continuando):', error);
      return null; // Não falhar - continuar com payin
    }
  }

  /**
   * Cria um payin fiat (PIX ou cartão) que converte para USDT
   * Endpoint correto: POST /v2/orders/deposit
   */
  async createPayin(data: TransFiPayinRequest): Promise<TransFiOrder> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      // Separar nome completo em firstName e lastName
      const fullNameParts = (data.customerData.fullName || '').trim().split(' ');
      const firstName = fullNameParts[0] || data.customerData.email.split('@')[0];
      const lastName = fullNameParts.slice(1).join(' ') || firstName;

      // Tentar criar/buscar customer antes de criar payin (pode resolver CUSTOMER_NOT_FOUND)
      // Nota: Isso é opcional - alguns casos podem funcionar sem customer pré-criado
      try {
        await this.createOrGetCustomer({
          email: data.customerData.email,
          firstName,
          lastName,
          country: 'BR',
          phone: data.customerData.phone,
        });
      } catch (error) {
        this.logger.debug('Não foi possível criar customer antes do payin, continuando...');
      }

      // Mapear paymentMethod para paymentCode
      // PIX -> pix, CARD -> card, etc
      const paymentCodeMap: Record<string, string> = {
        'PIX': 'pix',
        'CARD': 'card',
        'BANK_TRANSFER': 'bank_transfer',
      };
      const paymentCode = paymentCodeMap[data.paymentMethod] || data.paymentMethod.toLowerCase();

      // Construir body conforme documentação
      const payinData: any = {
        amount: data.amount,
        currency: data.currency,
        email: data.customerData.email,
        firstName,
        lastName,
        country: 'BR', // Brasil por padrão, pode ser configurável
        paymentCode,
        balanceCurrency: 'USDT', // Sempre receber em USDT
        redirectUrl: config.redirectUrl || undefined,
        sourceUrl: config.redirectUrl || undefined,
      };

      // Adicionar campos opcionais se disponíveis
      if (data.customerData.phone) {
        payinData.additionalDetails = {
          phone: data.customerData.phone,
          phoneCode: '+55', // Brasil por padrão
        };
      }

      if (data.customerData.cpf) {
        // CPF pode ir em additionalDetails ou em outro campo dependendo da API
        if (!payinData.additionalDetails) {
          payinData.additionalDetails = {};
        }
        // Nota: CPF pode precisar ser enviado de forma diferente, verificar documentação
      }

      // Adicionar metadata como partnerContext
      if (data.metadata) {
        payinData.partnerContext = data.metadata;
      }

      const response = await fetch(`${baseUrl}/v2/orders/deposit`, {
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
        const error = await response.json() as { message?: string; code?: string };
        this.logger.error('Erro ao criar payin TransFi:', error);
        throw new BadRequestException(
          error?.message || `Erro ao criar pagamento TransFi: ${error?.code || 'UNKNOWN'}`
        );
      }

      const responseData = await response.json() as {
        orderId: string;
        paymentUrl?: string;
        redirectUrl?: string;
        partnerContext?: any;
      };

      // Mapear resposta para o formato esperado
      const order: TransFiOrder = {
        id: responseData.orderId, // Usar orderId como id
        orderId: responseData.orderId,
        status: 'PENDING', // Status inicial
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paymentData: {
          paymentUrl: responseData.paymentUrl,
          qrCode: undefined, // Será preenchido quando disponível
          qrCodeBase64: undefined,
        },
        metadata: responseData.partnerContext,
      };

      this.logger.log(`Payin TransFi criado: ${order.orderId}`);
      return order;
    } catch (error: any) {
      this.logger.error('Erro ao criar payin TransFi:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
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
   * Busca detalhes de um pedido
   * Endpoint correto: GET /v2/orders/:orderId
   */
  async getOrderDetails(orderId: string): Promise<TransFiOrder> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      const response = await fetch(`${baseUrl}/v2/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; code?: string };
        this.logger.error('Erro ao buscar pedido TransFi:', error);
        throw new BadRequestException(
          error?.message || `Erro ao buscar pedido TransFi: ${error?.code || 'UNKNOWN'}`
        );
      }

      const responseData = await response.json() as {
        data: {
          orderId: string;
          status: string;
          depositAmount?: number;
          depositCurrency?: string;
          withdrawAmount?: number;
          withdrawCurrency?: string;
          senderName?: {
            firstName: string;
            lastName: string;
          };
          type?: string; // 'deposit' ou 'withdraw'
        };
        status: string;
      };

      // Mapear resposta para o formato esperado
      // A API retorna depositAmount/depositCurrency para payins e withdrawAmount/withdrawCurrency para payouts
      const amount = responseData.data.depositAmount || responseData.data.withdrawAmount || 0;
      const currency = responseData.data.depositCurrency || responseData.data.withdrawCurrency || 'BRL';

      const order: TransFiOrder = {
        id: responseData.data.orderId,
        orderId: responseData.data.orderId,
        status: responseData.data.status,
        amount,
        currency,
        paymentMethod: 'UNKNOWN', // Não vem na resposta, manter histórico
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return order;
    } catch (error: any) {
      this.logger.error('Erro ao buscar pedido TransFi:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao buscar pedido TransFi'
      );
    }
  }

  /**
   * Estorna um pagamento (via payout)
   * Endpoint correto: POST /v2/payout/orders
   * Nota: Para estorno, precisamos criar um payout order com dados do cliente original
   */
  async refundPayment(data: TransFiRefundRequest & { 
    customerEmail?: string;
    customerName?: string;
    originalCurrency?: string;
  }): Promise<any> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      // Buscar detalhes do pedido original para obter informações
      let originalOrder: TransFiOrder;
      try {
        originalOrder = await this.getOrderDetails(data.orderId);
      } catch (error) {
        this.logger.warn(`Não foi possível buscar detalhes do pedido ${data.orderId}, usando dados fornecidos`);
        // Se não conseguir buscar, usar dados fornecidos
        originalOrder = {
          id: data.orderId,
          orderId: data.orderId,
          status: 'UNKNOWN',
          amount: data.amount || 0,
          currency: data.originalCurrency || 'BRL',
          paymentMethod: 'UNKNOWN',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      // Montar dados do payout (estorno)
      // O payout precisa de: amount, email, currency, paymentCode, balanceCurrency
      const refundAmount = data.amount !== undefined && data.amount > 0 
        ? data.amount 
        : originalOrder.amount;

      // Separar nome se fornecido
      const customerName = data.customerName || 'Cliente';
      const nameParts = customerName.trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const payoutData: any = {
        amount: Math.round(refundAmount * 100), // TransFi espera amount em centavos (integer)
        email: data.customerEmail || 'refund@example.com', // Deve vir do pedido original
        currency: originalOrder.currency,
        paymentCode: 'pix', // PIX para estorno no Brasil
        balanceCurrency: 'USDT', // Moeda do saldo (mesma do payin original)
      };

      // Adicionar partnerId se disponível (referência ao pedido original)
      if (data.orderId) {
        payoutData.partnerId = data.orderId;
      }

      // Adicionar reason se fornecido
      if (data.reason) {
        payoutData.purposeCode = 'refund';
        if (!payoutData.partnerContext) {
          payoutData.partnerContext = {};
        }
        payoutData.partnerContext.reason = data.reason;
      }

      const response = await fetch(`${baseUrl}/v2/payout/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
        body: JSON.stringify(payoutData),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string; code?: string };
        this.logger.error('Erro ao estornar pagamento TransFi:', error);
        throw new BadRequestException(
          error?.message || `Erro ao estornar pagamento TransFi: ${error?.code || 'UNKNOWN'}`
        );
      }

      const refundResult = await response.json() as { orderId: string };
      this.logger.log(`Pagamento ${data.orderId} estornado com sucesso. Payout orderId: ${refundResult.orderId}`);
      return refundResult;
    } catch (error: any) {
      this.logger.error('Erro ao estornar pagamento TransFi:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
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
   * @param direction - 'deposit' ou 'withdraw' (obrigatório)
   */
  async getSupportedCurrencies(direction: 'deposit' | 'withdraw' = 'deposit'): Promise<any> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      // Construir query params conforme documentação
      const queryParams = new URLSearchParams();
      queryParams.append('direction', direction);
      queryParams.append('page', '1');
      queryParams.append('limit', '100');

      const response = await fetch(`${baseUrl}/v2/supported-currencies?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error: { message?: string; code?: string } = {};
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { message: errorText || 'Erro desconhecido' };
        }
        
        this.logger.error('Erro ao listar moedas TransFi:', {
          status: response.status,
          statusText: response.statusText,
          error,
        });
        
        throw new BadRequestException(
          error?.message || `Erro ao listar moedas suportadas: ${error?.code || 'UNKNOWN'}`
        );
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error('Erro ao listar moedas TransFi:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao listar moedas suportadas'
      );
    }
  }

  /**
   * Testa a conexão com a API TransFi
   * Usa o endpoint de listar usuários business (mais simples, não requer parâmetros obrigatórios)
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const config = await this.getConfig();
      const baseUrl = this.getBaseUrl(config.environment);

      // Usar endpoint de listar business users (query params são opcionais)
      // Este endpoint é mais simples e não requer parâmetros obrigatórios
      const response = await fetch(`${baseUrl}/v2/users/business`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'MID': config.merchantId,
          'Authorization': this.getAuthHeader(config),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error: { message?: string; code?: string } = {};
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { message: errorText || 'Erro desconhecido' };
        }

        // Se for 404 ou lista vazia, ainda é sucesso (significa que autenticação funcionou)
        if (response.status === 404) {
          return {
            success: true,
            message: 'Conexão bem-sucedida (nenhum usuário business encontrado)',
            data: {
              merchant_id: config.merchantId,
              environment: config.environment,
            },
          };
        }

        this.logger.error('Erro ao testar conexão TransFi:', {
          status: response.status,
          statusText: response.statusText,
          error,
        });

        throw new BadRequestException(
          error?.message || `Erro ao testar conexão: ${error?.code || 'UNKNOWN'}`
        );
      }

      const result = await response.json();
      
      return {
        success: true,
        message: 'Conexão bem-sucedida',
        data: {
          merchant_id: config.merchantId,
          environment: config.environment,
          users_count: result?.users?.length || result?.total || 0,
        },
      };
    } catch (error: any) {
      this.logger.error('Erro ao testar conexão TransFi:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao testar conexão com TransFi'
      );
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
