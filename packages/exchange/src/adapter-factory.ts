import { ExchangeType } from '@mvcashnode/shared';
import { ExchangeAdapter } from './exchange-adapter';
import { BinanceSpotAdapter } from './adapters/binance-spot.adapter';
import { BybitSpotAdapter } from './adapters/bybit-spot.adapter';

/**
 * Factory para criar adapters de exchange baseado no tipo
 */
export class AdapterFactory {
  /**
   * Cria um adapter apropriado para o tipo de exchange
   */
  static createAdapter(
    exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): ExchangeAdapter {
    switch (exchangeType) {
      case ExchangeType.BINANCE_SPOT:
      case ExchangeType.BINANCE_FUTURES:
        return new BinanceSpotAdapter(exchangeType, apiKey, apiSecret, options);

      case ExchangeType.BYBIT_SPOT:
      case ExchangeType.BYBIT_FUTURES:
        return new BybitSpotAdapter(exchangeType, apiKey, apiSecret, options);

      default:
        throw new Error(`Exchange type ${exchangeType} is not supported`);
    }
  }

  /**
   * Verifica se um tipo de exchange é suportado
   */
  static isSupported(exchangeType: ExchangeType): boolean {
    return [
      ExchangeType.BINANCE_SPOT,
      ExchangeType.BINANCE_FUTURES,
      ExchangeType.BYBIT_SPOT,
      ExchangeType.BYBIT_FUTURES,
    ].includes(exchangeType);
  }
}

