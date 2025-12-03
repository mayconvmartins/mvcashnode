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
   * @param exchangeType Tipo de exchange (para buscar preço atual se sellPrice não fornecido)
   * @param tradeMode Modo de trading (REAL ou SIMULATION)
   * @param sellPrice Preço de venda específico (opcional, se fornecido será usado ao invés de buscar preço atual)
   * @returns Resultado da validação
   */
  async validateMinProfit(
    exchangeAccountId: number,
    symbol: string,
    priceOpen: number,
    origin: SellOrigin,
    exchangeType: ExchangeType,
    _tradeMode: 'REAL' | 'SIMULATION',
    sellPrice?: number
  ): Promise<MinProfitValidationResult> {
    console.log(`[MIN-PROFIT-VALIDATION] ========== INICIANDO VALIDAÇÃO ==========`);
    console.log(`[MIN-PROFIT-VALIDATION] exchangeAccountId: ${exchangeAccountId}`);
    console.log(`[MIN-PROFIT-VALIDATION] symbol: ${symbol}`);
    console.log(`[MIN-PROFIT-VALIDATION] priceOpen: ${priceOpen}`);
    console.log(`[MIN-PROFIT-VALIDATION] origin: ${origin}`);
    console.log(`[MIN-PROFIT-VALIDATION] sellPrice: ${sellPrice || 'não fornecido'}`);
    
    // Stop Loss sempre ignora validação de lucro mínimo
    if (origin === 'STOP_LOSS') {
      console.log(`[MIN-PROFIT-VALIDATION] ⚠️ Stop Loss detectado - ignorando validação`);
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
      console.log(`[MIN-PROFIT-VALIDATION] Buscando parâmetro de trading para conta ${exchangeAccountId}, símbolo ${symbol}`);
      const parameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: exchangeAccountId,
          symbol: symbol,
          side: { in: ['SELL', 'BOTH'] },
        },
      });

      console.log(`[MIN-PROFIT-VALIDATION] Parâmetro encontrado: ${parameter ? `SIM (ID: ${parameter.id}, min_profit_pct: ${parameter.min_profit_pct?.toNumber() || 'NULL'})` : 'NÃO'}`);

      // Se não encontrou parâmetro ou não tem min_profit_pct configurado, permitir venda
      if (!parameter || !parameter.min_profit_pct) {
        const reason = !parameter 
          ? 'Parâmetro de trading não encontrado' 
          : 'Parâmetro encontrado mas sem min_profit_pct configurado';
        console.log(`[MIN-PROFIT-VALIDATION] ⚠️ ${reason} - permitindo venda`);
        return {
          valid: true,
          currentPrice: null,
          profitPct: null,
          minProfitPct: null,
          reason,
        };
      }

      const minProfitPct = parameter.min_profit_pct.toNumber();
      console.log(`[MIN-PROFIT-VALIDATION] min_profit_pct configurado: ${minProfitPct}%`);

      // Usar preço fornecido ou buscar preço atual do mercado
      let currentPrice: number;
      if (sellPrice !== undefined && sellPrice > 0) {
        // Usar preço fornecido (ex: price_reference do webhook)
        currentPrice = sellPrice;
        console.log(`[MIN-PROFIT-VALIDATION] ✅ Usando sellPrice fornecido: ${currentPrice}`);
      } else {
        // Buscar preço atual do mercado apenas se não foi fornecido
        console.log(`[MIN-PROFIT-VALIDATION] sellPrice não fornecido, buscando preço atual do mercado...`);
        try {
          // Para modo REAL, pode precisar de API keys, mas para buscar preço (read-only) não é necessário
          // Para modo SIMULATION, não precisa de API keys
          const adapter = AdapterFactory.createAdapter(exchangeType);
          const ticker = await adapter.fetchTicker(symbol);
          currentPrice = ticker.last;

          if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Preço inválido obtido da exchange: ${currentPrice}`);
          }
          console.log(`[MIN-PROFIT-VALIDATION] ✅ Preço atual obtido do mercado: ${currentPrice}`);
        } catch (error: any) {
          // Se falhar ao buscar preço, permitir venda mas registrar aviso
          console.warn(
            `[MIN-PROFIT-VALIDATION] ⚠️ Erro ao buscar preço atual para ${symbol}: ${error.message}. Permitindo venda.`
          );
          return {
            valid: true,
            currentPrice: null,
            profitPct: null,
            minProfitPct,
            reason: `Erro ao buscar preço atual: ${error.message}`,
          };
        }
      }

      // Calcular lucro percentual
      const profitPct = ((currentPrice - priceOpen) / priceOpen) * 100;
      console.log(`[MIN-PROFIT-VALIDATION] Cálculo: (${currentPrice} - ${priceOpen}) / ${priceOpen} * 100 = ${profitPct.toFixed(2)}%`);

      // Validar se atende ao lucro mínimo
      if (profitPct < minProfitPct) {
        console.warn(`[MIN-PROFIT-VALIDATION] ❌ VALIDAÇÃO FALHOU: Lucro ${profitPct.toFixed(2)}% < Mínimo ${minProfitPct.toFixed(2)}%`);
        return {
          valid: false,
          currentPrice,
          profitPct,
          minProfitPct,
          reason: `Lucro atual (${profitPct.toFixed(2)}%) abaixo do mínimo (${minProfitPct.toFixed(2)}%)`,
        };
      }

      console.log(`[MIN-PROFIT-VALIDATION] ✅ VALIDAÇÃO PASSOU: Lucro ${profitPct.toFixed(2)}% >= Mínimo ${minProfitPct.toFixed(2)}%`);
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

