import { Exchange } from 'ccxt';
import * as fs from 'fs';
import * as path from 'path';
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
  private readonly ccxtLogPath: string;

  constructor(exchangeType: ExchangeType, apiKey?: string, apiSecret?: string, options?: any) {
    this.exchangeType = exchangeType;
    this.exchange = this.createExchange(exchangeType, apiKey, apiSecret, options);
    this.ccxtLogPath = process.env.CCXT_LOG_PATH || path.join(process.cwd(), 'logs', 'ccxt.log');
  }

  // =============================
  // Logging CCXT (sanitizado)
  // =============================
  private sanitize(data: any, depth = 0): any {
    if (depth > 3) return '[Trimmed]';
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.slice(0, 20).map((item) => this.sanitize(item, depth + 1));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (['apikey', 'api_key', 'apisecret', 'secret', 'signature', 'password'].some((k) => lower.includes(k))) {
        result[key] = '[REDACTED]';
        continue;
      }
      if (['headers'].includes(lower)) {
        result[key] = '[OMITTED]';
        continue;
      }
      result[key] = this.sanitize(value, depth + 1);
    }
    return result;
  }

  protected logCcxt(event: 'request' | 'response' | 'error', payload: any) {
    try {
      const dir = path.dirname(this.ccxtLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const entry = {
        ts: new Date().toISOString(),
        adapter: this.exchangeType,
        event,
        ...this.sanitize(payload),
      };

      fs.appendFileSync(this.ccxtLogPath, JSON.stringify(entry) + '\n', { encoding: 'utf-8' });
    } catch (err) {
      // Não bloquear fluxo por erro de log
      console.error('[ExchangeAdapter] Falha ao gravar ccxt log:', (err as any)?.message || err);
    }
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
    this.logCcxt('request', { method: 'fetchBalance' });
    try {
      const balance = await this.exchange.fetchBalance();
      const sanitized = {
        free: (balance.free || {}) as unknown as Record<string, number>,
        used: (balance.used || {}) as unknown as Record<string, number>,
        total: (balance.total || {}) as unknown as Record<string, number>,
      };
      this.logCcxt('response', { method: 'fetchBalance', balance: sanitized });
      return sanitized;
    } catch (err) {
      this.logCcxt('error', { method: 'fetchBalance', error: (err as any)?.message || err });
      throw err;
    }
  }

  /**
   * Retorna filtros/limites do símbolo (stepSize, minQty, minNotional, tickSize).
   * Pode ser sobrescrito por adapters específicos para melhor precisão.
   */
  async getSymbolFilters(symbol: string): Promise<{
    stepSize?: number;
    minQty?: number;
    minNotional?: number;
    tickSize?: number;
  } | null> {
    try {
      await this.exchange.loadMarkets();
      const market = this.exchange.market(symbol);
      if (!market) return null;

      const minQty = market.limits?.amount?.min;
      const stepSize = market.precision?.amount ? Math.pow(10, -market.precision.amount) : undefined;
      const tickSize = market.precision?.price ? Math.pow(10, -market.precision.price) : undefined;
      const minNotional = market.limits?.cost?.min;

      return { stepSize, minQty, minNotional, tickSize };
    } catch (err) {
      console.error(`[ExchangeAdapter] getSymbolFilters failed for ${symbol}:`, (err as any)?.message || err);
      return null;
    }
  }

  async createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price?: number
  ): Promise<OrderResult> {
    this.logCcxt('request', { method: 'createOrder', symbol, type, side, amount, price });
    try {
      const order = await this.exchange.createOrder(symbol, type, side, amount, price);
      const parsed = {
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
      this.logCcxt('response', { method: 'createOrder', symbol, type, side, amount, price, order: parsed });
      return parsed;
    } catch (err) {
      this.logCcxt('error', { method: 'createOrder', symbol, type, side, amount, price, error: (err as any)?.message || err });
      throw err;
    }
  }

  async fetchOrder(orderId: string, symbol: string, params?: any): Promise<OrderResult> {
    this.logCcxt('request', { method: 'fetchOrder', orderId, symbol, params });
    try {
      const order = await this.exchange.fetchOrder(orderId, symbol, params);
      const parsed = {
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
      this.logCcxt('response', { method: 'fetchOrder', orderId, symbol, order: parsed });
      return parsed;
    } catch (err) {
      this.logCcxt('error', { method: 'fetchOrder', orderId, symbol, error: (err as any)?.message || err });
      throw err;
    }
  }

  async fetchOpenOrders(symbol?: string, since?: number, limit?: number, params?: any): Promise<OrderResult[]> {
    this.logCcxt('request', { method: 'fetchOpenOrders', symbol, since, limit, params });
    try {
      const orders = await this.exchange.fetchOpenOrders(symbol, since, limit, params);
      const parsed = orders.map(order => ({
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
      }));
      this.logCcxt('response', { method: 'fetchOpenOrders', symbol, count: parsed.length });
      return parsed;
    } catch (err) {
      this.logCcxt('error', { method: 'fetchOpenOrders', symbol, error: (err as any)?.message || err });
      throw err;
    }
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
        this.logCcxt('request', { method: 'fetchClosedOrder', orderId, symbol });
        const order = await (this.exchange as any).fetchClosedOrder(orderId, symbol);
        const parsed = {
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
        this.logCcxt('response', { method: 'fetchClosedOrder', orderId, symbol, order: parsed });
        return parsed;
      }
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.exchange.cancelOrder(orderId, symbol);
  }

  /**
   * Busca trades executados do usuário
   * Esta é a fonte confiável de taxas segundo a documentação do CCXT
   * @param symbol Símbolo do par (ex: 'BTC/USDT')
   * @param since Timestamp em milissegundos desde quando buscar trades
   * @param limit Número máximo de trades a retornar
   * @param params Parâmetros adicionais específicos da exchange
   * @returns Array de trades no formato do CCXT
   */
  async fetchMyTrades(symbol: string, since?: number, limit?: number, params?: any): Promise<any[]> {
    try {
      const trades = await this.exchange.fetchMyTrades(symbol, since, limit, params);
      return trades || [];
    } catch (error: any) {
      // Se a exchange não suporta fetchMyTrades, retornar array vazio
      if (error.message?.includes('not supported') || error.message?.includes('not implemented')) {
        return [];
      }
      throw error;
    }
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

  /**
   * Extrai informações de taxas de trades executados
   * Esta é a fonte confiável de taxas segundo a documentação do CCXT
   * @param trades Array de trades retornados por fetchMyTrades
   * @returns Objeto com valor total da taxa e moeda
   */
  extractFeesFromTrades(trades: any[]): { feeAmount: number; feeCurrency: string } {
    const feesByCurrency: Record<string, number> = {};
    
    for (const t of trades) {
      // Verificar t.fee (objeto único com { cost, currency })
      if (t.fee && t.fee.cost !== undefined && t.fee.currency) {
        const currency = String(t.fee.currency);
        const cost = Number(t.fee.cost) || 0;
        if (cost > 0) {
          feesByCurrency[currency] = (feesByCurrency[currency] || 0) + cost;
        }
      }
      
      // Verificar t.fees (array de objetos { cost, currency })
      if (t.fees && Array.isArray(t.fees)) {
        for (const f of t.fees) {
          if (f.cost !== undefined && f.currency) {
            const currency = String(f.currency);
            const cost = Number(f.cost) || 0;
            if (cost > 0) {
              feesByCurrency[currency] = (feesByCurrency[currency] || 0) + cost;
            }
          }
        }
      }
    }
    
    // Retornar primeira moeda encontrada (ou somar todas se necessário)
    const currencies = Object.keys(feesByCurrency);
    if (currencies.length === 0) {
      return { feeAmount: 0, feeCurrency: '' };
    }
    
    // Se múltiplas moedas, retornar a maior (mais comum) ou primeira
    // Normalmente todas as taxas de uma ordem são na mesma moeda
    const mainCurrency = currencies[0];
    return {
      feeAmount: feesByCurrency[mainCurrency],
      feeCurrency: mainCurrency
    };
  }

  /**
   * Extrai informações de taxas de uma ordem da exchange
   * NOTA: fetchMyTrades + extractFeesFromTrades é a fonte preferida e mais confiável
   * Este método é mantido como fallback quando fetchMyTrades não está disponível
   * @param order Ordem da exchange (OrderResult ou objeto com fills)
   * @param side Lado da ordem ('buy' ou 'sell')
   * @returns Objeto com valor da taxa e moeda
   */
  extractFeesFromOrder(order: OrderResult | any, side: 'buy' | 'sell'): { feeAmount: number; feeCurrency: string } {
    let totalFeeAmount = 0;
    let feeCurrency = '';

    // Log para debug (apenas em desenvolvimento)
    const debugLog = process.env.NODE_ENV === 'development';

    // Tentar extrair dos fills primeiro (mais preciso)
    if (order.fills && Array.isArray(order.fills) && order.fills.length > 0) {
      if (debugLog) {
        console.log('[ExchangeAdapter] Verificando fills:', order.fills.length, 'fills encontrados');
      }
      
      for (const fill of order.fills) {
        // CCXT geralmente retorna fee como objeto { cost, currency } ou como número
        if (fill.fee) {
          if (typeof fill.fee === 'object' && fill.fee.cost !== undefined) {
            const feeCost = Number(fill.fee.cost) || 0;
            totalFeeAmount += feeCost;
            if (!feeCurrency && fill.fee.currency) {
              feeCurrency = String(fill.fee.currency);
            }
            if (debugLog && feeCost > 0) {
              console.log('[ExchangeAdapter] Taxa encontrada no fill.fee:', feeCost, fill.fee.currency);
            }
          } else if (typeof fill.fee === 'number') {
            totalFeeAmount += fill.fee;
            if (debugLog && fill.fee > 0) {
              console.log('[ExchangeAdapter] Taxa encontrada no fill.fee (número):', fill.fee);
            }
          }
        }
        
        // Algumas exchanges retornam commission diretamente (Binance usa este formato)
        // Commission pode vir como string ou número
        if (fill.commission !== undefined && fill.commission !== null) {
          const commission = typeof fill.commission === 'string' 
            ? Number(fill.commission) || 0
            : Number(fill.commission) || 0;
          if (commission > 0) {
            totalFeeAmount += commission;
            if (!feeCurrency && fill.commissionAsset) {
              feeCurrency = String(fill.commissionAsset);
            }
            if (debugLog) {
              console.log('[ExchangeAdapter] Taxa encontrada no fill.commission:', commission, fill.commissionAsset);
            }
          }
        }
        
        // Verificar outros campos possíveis (algumas exchanges usam nomes diferentes)
        if (totalFeeAmount === 0) {
          // Bybit pode usar 'executedQty' e calcular taxa baseada na diferença
          // Ou pode ter 'fee' como string no formato "0.001 USDT"
          if (fill.fee && typeof fill.fee === 'string') {
            const feeMatch = fill.fee.match(/([\d.]+)\s+(\w+)/);
            if (feeMatch) {
              totalFeeAmount = Number(feeMatch[1]) || 0;
              feeCurrency = feeMatch[2] || '';
              if (debugLog && totalFeeAmount > 0) {
                console.log('[ExchangeAdapter] Taxa encontrada no fill.fee (string):', totalFeeAmount, feeCurrency);
              }
            }
          }
        }
      }
    }

    // Se não encontrou nos fills, tentar no objeto order diretamente
    if (totalFeeAmount === 0) {
      if (order.fee) {
        if (typeof order.fee === 'object' && order.fee.cost !== undefined) {
          totalFeeAmount = Number(order.fee.cost) || 0;
          feeCurrency = order.fee.currency ? String(order.fee.currency) : '';
          if (debugLog && totalFeeAmount > 0) {
            console.log('[ExchangeAdapter] Taxa encontrada no order.fee:', totalFeeAmount, feeCurrency);
          }
        } else if (typeof order.fee === 'number') {
          totalFeeAmount = order.fee;
          if (debugLog && totalFeeAmount > 0) {
            console.log('[ExchangeAdapter] Taxa encontrada no order.fee (número):', totalFeeAmount);
          }
        } else if (typeof order.fee === 'string') {
          // Formato string "0.001 USDT"
          const feeMatch = order.fee.match(/([\d.]+)\s+(\w+)/);
          if (feeMatch) {
            totalFeeAmount = Number(feeMatch[1]) || 0;
            feeCurrency = feeMatch[2] || '';
            if (debugLog && totalFeeAmount > 0) {
              console.log('[ExchangeAdapter] Taxa encontrada no order.fee (string):', totalFeeAmount, feeCurrency);
            }
          }
        }
      }
      
      if (order.commission !== undefined && order.commission !== null && totalFeeAmount === 0) {
        totalFeeAmount = Number(order.commission) || 0;
        feeCurrency = order.commissionAsset ? String(order.commissionAsset) : '';
        if (debugLog && totalFeeAmount > 0) {
          console.log('[ExchangeAdapter] Taxa encontrada no order.commission:', totalFeeAmount, feeCurrency);
        }
      }
      
      // Verificar campos adicionais que algumas exchanges podem usar
      if (totalFeeAmount === 0 && order.info) {
        // Algumas exchanges retornam informações adicionais em 'info'
        const info = order.info;
        if (info.executedQty && info.cummulativeQuoteQty) {
          // Pode calcular taxa baseada na diferença (não ideal, mas melhor que nada)
          // Isso é apenas um fallback se não encontrar taxa explícita
        }
        if (info.fee) {
          if (typeof info.fee === 'string') {
            const feeMatch = info.fee.match(/([\d.]+)\s+(\w+)/);
            if (feeMatch) {
              totalFeeAmount = Number(feeMatch[1]) || 0;
              feeCurrency = feeMatch[2] || '';
              if (debugLog && totalFeeAmount > 0) {
                console.log('[ExchangeAdapter] Taxa encontrada no order.info.fee:', totalFeeAmount, feeCurrency);
              }
            }
          } else if (typeof info.fee === 'number') {
            totalFeeAmount = info.fee;
            if (debugLog && totalFeeAmount > 0) {
              console.log('[ExchangeAdapter] Taxa encontrada no order.info.fee (número):', totalFeeAmount);
            }
          }
        }
      }
    }

    // Se ainda não encontrou moeda, inferir baseado no lado da ordem e símbolo
    if (!feeCurrency && order.symbol && totalFeeAmount > 0) {
      const symbolParts = String(order.symbol).split('/');
      if (side === 'buy') {
        // Para compra, taxa geralmente é em quote asset (ex: USDT)
        feeCurrency = symbolParts[1] || 'USDT';
      } else {
        // Para venda, taxa geralmente é em base asset
        feeCurrency = symbolParts[0] || '';
      }
    }

    // ✅ TAXAS FIX: Se não encontrou nenhuma taxa, retornar null em vez de valores zero
    if (totalFeeAmount === 0 || !feeCurrency) {
      return {
        feeAmount: 0,
        feeCurrency: '',
      };
    }

    return {
      feeAmount: totalFeeAmount,
      feeCurrency: feeCurrency,
    };
  }
}

