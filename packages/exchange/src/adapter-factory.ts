import { ExchangeType, NtpService } from '@mvcashnode/shared';
import { ExchangeAdapter } from './exchange-adapter';
import { BinanceSpotAdapter } from './adapters/binance-spot.adapter';
import { BybitSpotAdapter } from './adapters/bybit-spot.adapter';

/**
 * Factory para criar adapters de exchange baseado no tipo
 */
export class AdapterFactory {
  private static ntpService: NtpService | null = null;

  /**
   * Configura o NTP Service para todos os adapters criados
   * Deve ser chamado ANTES de criar qualquer adapter
   */
  static setNtpService(ntpService: NtpService): void {
    // Só configurar se ainda não foi configurado ou se é uma nova instância
    if (AdapterFactory.ntpService !== ntpService) {
      AdapterFactory.ntpService = ntpService;
      // Configurar diretamente nos adapters também (para compatibilidade)
      BinanceSpotAdapter.setNtpService(ntpService);
      BybitSpotAdapter.setNtpService(ntpService);
      console.log('[AdapterFactory] NTP Service configurado para todos os adapters');
    }
  }

  /**
   * Cria um adapter apropriado para o tipo de exchange
   */
  static createAdapter(
    exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): ExchangeAdapter {
    let adapter: ExchangeAdapter;

    switch (exchangeType) {
      case ExchangeType.BINANCE_SPOT:
      case ExchangeType.BINANCE_FUTURES:
        adapter = new BinanceSpotAdapter(exchangeType, apiKey, apiSecret, options);
        break;

      case ExchangeType.BYBIT_SPOT:
      case ExchangeType.BYBIT_FUTURES:
        adapter = new BybitSpotAdapter(exchangeType, apiKey, apiSecret, options);
        break;

      default:
        throw new Error(`Exchange type ${exchangeType} is not supported`);
    }

    return adapter;
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

