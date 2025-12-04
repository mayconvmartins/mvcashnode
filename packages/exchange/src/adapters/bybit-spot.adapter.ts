import { bybit, Exchange } from 'ccxt';
import { ExchangeAdapter, OrderResult } from '../exchange-adapter';
import { ExchangeType } from '@mvcashnode/shared';

// Instância global do NTP service para obter timestamp correto
let ntpServiceInstance: any = null;

export class BybitSpotAdapter extends ExchangeAdapter {
  /**
   * Define a instância do NTP service para todos os adapters Bybit
   * Deve ser chamado antes de criar qualquer adapter
   */
  static setNtpService(ntpService: any): void {
    ntpServiceInstance = ntpService;
    console.log('[Bybit] NTP Service configurado');
  }

  createExchange(
    _exchangeType: ExchangeType,
    apiKey?: string,
    apiSecret?: string,
    options?: any
  ): Exchange {
    console.log(`[Bybit] Criando exchange, NTP disponível: ${!!ntpServiceInstance}`);
    
    const exchange = new bybit({
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
    
      // Substituir TODOS os métodos de timestamp para usar NTP
      if (ntpServiceInstance) {
        const ntpService = ntpServiceInstance; // Capturar no closure
        const originalSign = exchange.sign.bind(exchange);
        const ntpOffset = ntpService.getOffset();
        
        // nonce() usado para gerar IDs únicos
        exchange.nonce = function() {
          const timestamp = ntpService.getTimestamp();
          return Math.floor(timestamp);
        };
        
        // milliseconds() usado para timestamps em assinaturas e requisições
        exchange.milliseconds = function() {
          const timestamp = ntpService.getTimestamp();
          const intTimestamp = Math.floor(timestamp);
          return intTimestamp;
        };
        
        // Sobrescrever sign() para garantir que timestamp seja sempre usado
        exchange.sign = function(path: string, api: string = 'private', method: string = 'GET', params: any = {}, headers: any = {}, body: any = undefined) {
          // Garantir que timestamp está presente nos params
          if (api === 'private' && !params.timestamp) {
            params.timestamp = this.milliseconds();
          }
          return originalSign(path, api, method, params, headers, body);
        };
        
        console.log(`[Bybit] ✅ NTP configurado - Offset: ${ntpOffset}ms (nonce + milliseconds + sign customizados)`);
      } else {
        console.error('[Bybit] ❌ NTP Service NÃO configurado! Timestamps estarão incorretos!');
      }
    
    return exchange;
  }

  async fetchClosedOrder(orderId: string, symbol: string): Promise<OrderResult> {
    // Bybit tem limitação: só pode acessar últimas 500 ordens
    // A mensagem de erro sugere usar params["acknowledged"] = true
    // ou fetchClosedOrder/fetchOpenOrder
    try {
      // Tentar fetchClosedOrder primeiro (se disponível no CCXT)
      if (this.exchange.has && this.exchange.has['fetchClosedOrder']) {
        const order = await (this.exchange as any).fetchClosedOrder(orderId, symbol);
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
          fills: (order as any).fills || undefined,
        };
      }
    } catch (error: any) {
      // Se fetchClosedOrder não funcionar, continuar para usar fetchOrder com acknowledged
      console.log(`[Bybit] fetchClosedOrder não disponível ou falhou, usando fetchOrder com acknowledged: true`);
    }

    // Usar fetchOrder com acknowledged: true (sugerido pela mensagem de erro)
    return await this.fetchOrder(orderId, symbol, { acknowledged: true });
  }
}

