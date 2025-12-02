import { Exchange } from 'ccxt';
import { ExchangeType } from '@mvcashnode/shared';

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

  async testConnection(): Promise<boolean> {
    try {
      await this.exchange.loadMarkets();
      return true;
    } catch (error) {
      return false;
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
    };
  }

  async fetchOrder(orderId: string, symbol: string): Promise<OrderResult> {
    const order = await this.exchange.fetchOrder(orderId, symbol);
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
    };
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

