import { binance, Exchange } from 'ccxt';
import { ExchangeAdapter } from '../exchange-adapter';
import { ExchangeType } from '@mvcashnode/shared';

export class BinanceSpotAdapter extends ExchangeAdapter {
  createExchange(
    _exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): Exchange {
    const exchange = new binance({
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
    
    // Sincronizar timestamp com Binance na primeira chamada
    // Isso é crítico para evitar erros de timestamp
    (async () => {
      try {
        // Forçar sincronização de tempo antes de qualquer operação
        await exchange.loadTimeDifference();
        console.log(`[Binance] Timestamp sincronizado. Diferença: ${exchange.options.timeDifference || 0}ms`);
      } catch (error) {
        console.warn('[Binance] Aviso: Não foi possível sincronizar timestamp na inicialização:', error);
      }
    })();
    
    return exchange;
  }
}

