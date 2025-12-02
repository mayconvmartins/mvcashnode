import { bybit, Exchange } from 'ccxt';
import { ExchangeAdapter } from '../exchange-adapter';
import { ExchangeType } from '@mvcashnode/shared';

export class BybitSpotAdapter extends ExchangeAdapter {
  createExchange(
    _exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): Exchange {
    const exchange = new bybit({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
        adjustForTimeDifference: true,
        recvWindow: 60000, // 60 segundos de janela
      },
      ...options,
    });

    // Configurações adicionais
    exchange.options['warnOnFetchOpenOrdersWithoutSymbol'] = false;
    
    // Sincronizar timestamp com Bybit na primeira chamada
    (async () => {
      try {
        await exchange.loadTimeDifference();
        console.log(`[Bybit] Timestamp sincronizado. Diferença: ${exchange.options.timeDifference || 0}ms`);
      } catch (error) {
        console.warn('[Bybit] Aviso: Não foi possível sincronizar timestamp na inicialização:', error);
      }
    })();
    
    return exchange;
  }
}

