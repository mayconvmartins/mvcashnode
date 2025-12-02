import ccxt, { binance } from 'ccxt';
import { ExchangeAdapter } from '../exchange-adapter';
import { ExchangeType } from '@mvcashnode/shared';

export class BinanceSpotAdapter extends ExchangeAdapter {
  createExchange(
    exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): ccxt.Exchange {
    return new binance({
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

