import { Exchange } from 'ccxt';
import { ExchangeAdapter } from '../exchange-adapter';
import { ExchangeType } from '@mvcashnode/shared';
export declare class BinanceSpotAdapter extends ExchangeAdapter {
    createExchange(_exchangeType: ExchangeType, apiKey?: string, apiSecret?: string, options?: any): Exchange;
}
//# sourceMappingURL=binance-spot.adapter.d.ts.map