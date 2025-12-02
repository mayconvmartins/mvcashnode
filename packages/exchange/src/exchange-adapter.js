"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeAdapter = void 0;
class ExchangeAdapter {
    exchange;
    exchangeType;
    constructor(exchangeType, apiKey, apiSecret, options) {
        this.exchangeType = exchangeType;
        this.exchange = this.createExchange(exchangeType, apiKey, apiSecret, options);
    }
    async testConnection() {
        try {
            await this.exchange.loadMarkets();
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async fetchBalance() {
        const balance = await this.exchange.fetchBalance();
        return {
            free: (balance.free || {}),
            used: (balance.used || {}),
            total: (balance.total || {}),
        };
    }
    async createOrder(symbol, type, side, amount, price) {
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
    async fetchOrder(orderId, symbol) {
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
    async cancelOrder(orderId, symbol) {
        await this.exchange.cancelOrder(orderId, symbol);
    }
    async fetchTicker(symbol) {
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
exports.ExchangeAdapter = ExchangeAdapter;
//# sourceMappingURL=exchange-adapter.js.map