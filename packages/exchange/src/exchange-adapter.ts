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
      free: balance.free || {},
      used: balance.used || {},
      total: balance.total || {},
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
      id: order.id,
      symbol: order.symbol,
      type: order.type,
      side: order.side,
      amount: order.amount,
      price: order.price,
      status: order.status,
      filled: order.filled,
      remaining: order.remaining,
      cost: order.cost,
      average: order.average,
    };
  }

  async fetchOrder(orderId: string, symbol: string): Promise<OrderResult> {
    const order = await this.exchange.fetchOrder(orderId, symbol);
    return {
      id: order.id,
      symbol: order.symbol,
      type: order.type,
      side: order.side,
      amount: order.amount,
      price: order.price,
      status: order.status,
      filled: order.filled,
      remaining: order.remaining,
      cost: order.cost,
      average: order.average,
    };
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    await this.exchange.cancelOrder(orderId, symbol);
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol: ticker.symbol,
      last: ticker.last,
      bid: ticker.bid,
      ask: ticker.ask,
      high: ticker.high,
      low: ticker.low,
      volume: ticker.volume,
    };
  }
}

