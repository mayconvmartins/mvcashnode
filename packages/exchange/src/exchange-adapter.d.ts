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
export declare abstract class ExchangeAdapter {
    protected exchange: Exchange;
    protected exchangeType: ExchangeType;
    constructor(exchangeType: ExchangeType, apiKey?: string, apiSecret?: string, options?: any);
    abstract createExchange(exchangeType: ExchangeType, apiKey?: string, apiSecret?: string, options?: any): Exchange;
    testConnection(): Promise<boolean>;
    fetchBalance(): Promise<Balance>;
    createOrder(symbol: string, type: string, side: string, amount: number, price?: number): Promise<OrderResult>;
    fetchOrder(orderId: string, symbol: string, params?: any): Promise<OrderResult>;
    fetchClosedOrder?(orderId: string, symbol: string): Promise<OrderResult>;
    cancelOrder(orderId: string, symbol: string): Promise<void>;
    fetchTicker(symbol: string): Promise<Ticker>;
}
//# sourceMappingURL=exchange-adapter.d.ts.map