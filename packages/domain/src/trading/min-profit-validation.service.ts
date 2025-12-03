import { PrismaClient } from '@mvcashnode/db';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType } from '@mvcashnode/shared';

export type SellOrigin = 'WEBHOOK' | 'TAKE_PROFIT' | 'TRAILING' | 'MANUAL' | 'STOP_LOSS';

export interface MinProfitValidationResult {
  valid: boolean;
  currentPrice: number | null;
  profitPct: number | null;
  minProfitPct: number | null;
  reason?: string;
}

export class MinProfitValidationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Valida se a venda atende ao lucro mínimo configurado
   * @param exchangeAccountId ID da conta de exchange
   * @param symbol Símbolo do par (ex: SOL/USDT)
   * @param priceOpen Preço de abertura da posição
   * @param origin Origem da venda (STOP_LOSS ignora validação)
   * @param exchangeType Tipo de exchange (para buscar preço atual)
   * @param tradeMode Modo de trading (REAL ou SIMULATION)
   * @returns Resultado da validação
   */
  async validateMinProfit(
    exchangeAccountId: number,
    symbol: string,
    priceOpen: number,
    origin: SellOrigin,
    exchangeType: ExchangeType,
    tradeMode: 'REAL' | 'SIMULATION'
  ): Promise<MinProfitValidationResult> {
    // Stop Loss sempre ignora validação de lucro mínimo
    if (origin === 'STOP_LOSS') {
      return {
        valid: true,
        currentPrice: null,
        profitPct: null,
        minProfitPct: null,
        reason: 'Stop Loss ignora validação de lucro mínimo',
      };
    }

    try {
      // Buscar parâmetro de trading para obter min_profit_pct
      const parameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: exchangeAccountId,
          symbol: symbol,
          side: { in: ['SELL', 'BOTH'] },
        },
      });

      // Se não encontrou parâmetro ou não tem min_profit_pct configurado, permitir venda
      if (!parameter || !parameter.min_profit_pct) {
        return {
          valid: true,
          currentPrice: null,
          profitPct: null,
          minProfitPct: null,
          reason: 'Parâmetro de trading não encontrado ou sem min_profit_pct configurado',
        };
      }

      const minProfitPct = parameter.min_profit_pct.toNumber();

      // Buscar preço atual do mercado
      let currentPrice: number;
      try {
        // Para modo REAL, pode precisar de API keys, mas para buscar preço (read-only) não é necessário
        // Para modo SIMULATION, não precisa de API keys
        const adapter = AdapterFactory.createAdapter(exchangeType);
        const ticker = await adapter.fetchTicker(symbol);
        currentPrice = ticker.last;

        if (!currentPrice || currentPrice <= 0) {
          throw new Error(`Preço inválido obtido da exchange: ${currentPrice}`);
        }
      } catch (error: any) {
        // Se falhar ao buscar preço, permitir venda mas registrar aviso
        console.warn(
          `[MIN-PROFIT-VALIDATION] Erro ao buscar preço atual para ${symbol}: ${error.message}. Permitindo venda.`
        );
        return {
          valid: true,
          currentPrice: null,
          profitPct: null,
          minProfitPct,
          reason: `Erro ao buscar preço atual: ${error.message}`,
        };
      }

      // Calcular lucro percentual atual
      const profitPct = ((currentPrice - priceOpen) / priceOpen) * 100;

      // Validar se atende ao lucro mínimo
      if (profitPct < minProfitPct) {
        return {
          valid: false,
          currentPrice,
          profitPct,
          minProfitPct,
          reason: `Lucro atual (${profitPct.toFixed(2)}%) abaixo do mínimo (${minProfitPct.toFixed(2)}%)`,
        };
      }

      return {
        valid: true,
        currentPrice,
        profitPct,
        minProfitPct,
        reason: `Lucro mínimo atendido: ${profitPct.toFixed(2)}% >= ${minProfitPct.toFixed(2)}%`,
      };
    } catch (error: any) {
      // Em caso de erro inesperado, permitir venda mas registrar erro
      console.error(`[MIN-PROFIT-VALIDATION] Erro ao validar lucro mínimo: ${error.message}`);
      return {
        valid: true,
        currentPrice: null,
        profitPct: null,
        minProfitPct: null,
        reason: `Erro ao validar: ${error.message}`,
      };
    }
  }
}

