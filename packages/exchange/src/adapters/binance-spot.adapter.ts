import { binance, Exchange } from 'ccxt';
import { ExchangeAdapter } from '../exchange-adapter';
import { ExchangeType } from '@mvcashnode/shared';

// Instância global do NTP service para obter timestamp correto
let ntpServiceInstance: any = null;

export class BinanceSpotAdapter extends ExchangeAdapter {
  /**
   * Define a instância do NTP service para todos os adapters Binance
   * Deve ser chamado antes de criar qualquer adapter
   */
  static setNtpService(ntpService: any): void {
    ntpServiceInstance = ntpService;
    console.log('[Binance] NTP Service configurado');
  }

  createExchange(
    _exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): Exchange {
    console.log(`[Binance] Criando exchange, NTP disponível: ${!!ntpServiceInstance}`);
    
    const exchange = new binance({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: 'spot',
        adjustForTimeDifference: false, // Desabilitar ajuste automático
        recvWindow: 60000, // 60 segundos de janela
      },
      ...options,
    });

    // Configurações adicionais
    exchange.options['warnOnFetchOpenOrdersWithoutSymbol'] = false;
    
    // Substituir a função nonce() do CCXT para usar NTP
    if (ntpServiceInstance) {
      const ntpService = ntpServiceInstance; // Capturar no closure
      exchange.nonce = function() {
        const timestamp = ntpService.getTimestamp();
        const intTimestamp = Math.floor(timestamp);
        console.log(`[Binance.nonce] NTP timestamp: ${intTimestamp} (offset: ${ntpService.getOffset()}ms)`);
        return intTimestamp;
      };
      console.log('[Binance] ✅ Timestamp NTP customizado configurado');
    } else {
      console.error('[Binance] ❌ NTP Service NÃO configurado! Timestamps estarão incorretos!');
    }
    
    return exchange;
  }
}

