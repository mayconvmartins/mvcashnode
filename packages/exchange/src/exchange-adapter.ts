import { Exchange } from 'ccxt';
import { ExchangeType } from '@mvcashnode/shared';

export type TestConnectionResult = {
  success: boolean;
  message?: string;
  error?: string;
};

export interface OrderResult {
  id: string;
  symbol: string;
  type: string;
  side: string;
  amount: number;
  price?: number;
  status: string;
  filled?: number;
  remaining?: number;
  cost?: number;
  average?: number;
  fills?: any[]; // Array de fills da ordem (pode conter informações detalhadas de cada preenchimento)
}

export interface Balance {
  free: Record<string, number>;
  used: Record<string, number>;
  total: Record<string, number>;
}

export interface Ticker {
  symbol: string;
  last: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export abstract class ExchangeAdapter {
  protected exchange: Exchange;
  protected exchangeType: ExchangeType;

  constructor(exchangeType: ExchangeType, apiKey?: string, apiSecret?: string, options?: any) {
    this.exchangeType = exchangeType;
    this.exchange = this.createExchange(exchangeType, apiKey, apiSecret, options);
  }

  abstract createExchange(
    exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): Exchange;

  async testConnection(): Promise<TestConnectionResult> {
    try {
      // NÃO chamar loadTimeDifference() - estamos usando NTP diretamente via nonce() e milliseconds()
      // O timestamp é gerenciado pelo NtpService através dos métodos customizados nos adapters
      
      // Carregar mercados
      await this.exchange.loadMarkets();
      
      // TERCEIRO: Se tem API key, tentar buscar balance para validar permissões
      if (this.exchange.apiKey) {
        try {
          await this.exchange.fetchBalance();
          return { 
            success: true, 
            message: 'Connection successful. API key validated and account accessible.' 
          };
        } catch (balanceError: any) {
          // Se loadMarkets passou mas fetchBalance falhou, ainda é considerado sucesso parcial
          return { 
            success: true, 
            message: 'Connection successful but limited permissions detected.',
            error: `Balance check failed: ${balanceError.message || balanceError.toString()}`
          };
        }
      }
      
      return { 
        success: true, 
        message: 'Connection successful. Market data accessible.' 
      };
    } catch (error: any) {
      // Extrair mensagem de erro específica do CCXT
      let errorMessage = 'Unknown error';
      let errorType = 'CONNECTION_ERROR';

      if (error.name) {
        errorType = error.name;
      }

      if (error.message) {
        errorMessage = error.message;
      }

      // Erros comuns do CCXT
      if (errorMessage.includes('Invalid API-key')) {
        errorType = 'INVALID_API_KEY';
        errorMessage = 'API Key is invalid or has been deleted';
      } else if (errorMessage.includes('Signature for this request is not valid')) {
        errorType = 'INVALID_SIGNATURE';
        errorMessage = 'API Secret is incorrect';
      } else if (errorMessage.includes('IP address')) {
        errorType = 'IP_RESTRICTION';
        errorMessage = 'IP address not whitelisted in exchange settings';
      } else if (errorMessage.includes('Timestamp') || errorMessage.includes('1000ms ahead') || errorMessage.includes('time')) {
        errorType = 'TIMESTAMP_ERROR';
        errorMessage = 'System clock is out of sync with exchange server. Please sync your system time or enable NTP.';
      } else if (errorMessage.includes('banned')) {
        errorType = 'BANNED';
        errorMessage = 'API key or IP has been banned by the exchange';
      } else if (errorMessage.includes('Permission')) {
        errorType = 'PERMISSION_ERROR';
        errorMessage = 'API key does not have required permissions';
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT')) {
        errorType = 'NETWORK_ERROR';
        errorMessage = 'Cannot reach exchange servers. Check internet connection.';
      }

      console.error(`[ExchangeAdapter] Test connection failed (${errorType}):`, errorMessage);

      return { 
        success: false, 
        message: `Connection failed: ${errorType}`,
        error: errorMessage
      };
    }
  }

  async fetchBalance(): Promise<Balance> {
    const balance = await this.exchange.fetchBalance();
    return {
      free: (balance.free || {}) as unknown as Record<string, number>,
      used: (balance.used || {}) as unknown as Record<string, number>,
      total: (balance.total || {}) as unknown as Record<string, number>,
    };
  }

  async createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number
  ): Promise<OrderResult> {
    const order = await this.exchange.createOrder(symbol, type, side, amount, price);
    return {
      id: String(order.id || ''),
      symbol: String(order.symbol || ''),
      type: String(order.type || ''),
      side: String(order.side || ''),
      amount: Number(order.amount || 0),
      price: order.price ? Number(order.price) : undefined,
      status: String(order.status || ''),
      filled: order.filled ? Number(order.filled) : undefined,
      remaining: order.remaining ? Number(order.remaining) : undefined,
      cost: order.cost ? Number(order.cost) : undefined,
      average: order.average ? Number(order.average) : undefined,
      fills: (order as any).fills || undefined,
    };
  }

  async fetchOrder(orderId: string, symbol: string, params?: any): Promise<OrderResult> {
    const order = await this.exchange.fetchOrder(orderId, symbol, params);
    return {
      id: String(order.id || ''),
      symbol: String(order.symbol || ''),
      type: String(order.type || ''),
      side: String(order.side || ''),
      amount: Number(order.amount || 0),
      price: order.price ? Number(order.price) : undefined,
      status: String(order.status || ''),
      filled: order.filled ? Number(order.filled) : undefined,
      remaining: order.remaining ? Number(order.remaining) : undefined,
      cost: order.cost ? Number(order.cost) : undefined,
      average: order.average ? Number(order.average) : undefined,
      fills: (order as any).fills || undefined,
    };
  }

  async fetchClosedOrder(orderId: string, symbol: string): Promise<OrderResult> {
    // Por padrão, tenta usar fetchOrder com parâmetros especiais
    // Adaptadores específicos podem sobrescrever este método
    try {
      // Tentar fetchOrder primeiro com parâmetros
      return await this.fetchOrder(orderId, symbol, { acknowledged: true });
    } catch (error: any) {
      // Se falhar, tentar fetchClosedOrder se disponível
      if (this.exchange.has['fetchClosedOrder']) {
        const order = await (this.exchange as any).fetchClosedOrder(orderId, symbol);
        return {
          id: String(order.id || ''),
          symbol: String(order.symbol || ''),
          type: String(order.type || ''),
          side: String(order.side || ''),
          amount: Number(order.amount || 0),
          price: order.price ? Number(order.price) : undefined,
          status: String(order.status || ''),
          filled: order.filled ? Number(order.filled) : undefined,
          remaining: order.remaining ? Number(order.remaining) : undefined,
          cost: order.cost ? Number(order.cost) : undefined,
          average: order.average ? Number(order.average) : undefined,
          fills: (order as any).fills || undefined,
        };
      }
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.exchange.cancelOrder(orderId, symbol);
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol: String(ticker.symbol || ''),
      last: Number(ticker.last || 0),
      bid: ticker.bid ? Number(ticker.bid) : undefined,
      ask: ticker.ask ? Number(ticker.ask) : undefined,
      high: ticker.high ? Number(ticker.high) : undefined,
      low: ticker.low ? Number(ticker.low) : undefined,
      volume: ticker.baseVolume ? Number(ticker.baseVolume) : undefined,
    };
  }
}

