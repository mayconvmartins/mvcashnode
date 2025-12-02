"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceSpotAdapter = void 0;
const ccxt_1 = require("ccxt");
const exchange_adapter_1 = require("../exchange-adapter");
class BinanceSpotAdapter extends exchange_adapter_1.ExchangeAdapter {
    createExchange(_exchangeType, apiKey, apiSecret, options) {
        return new ccxt_1.binance({
            apiKey,
            secret: apiSecret,
            enableRateLimit: true,
            options: {
                defaultType: 'spot',
            },
            ...options,
        });
    }
}
exports.BinanceSpotAdapter = BinanceSpotAdapter;
//# sourceMappingURL=binance-spot.adapter.js.map