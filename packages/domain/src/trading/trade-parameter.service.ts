import { PrismaClient } from '@mvcashnode/db';
import { TradeMode } from '@mvcashnode/shared';

export interface CreateTradeParameterDto {
  userId: number;
  exchangeAccountId: number;
  symbol: string;
  side: 'BUY' | 'SELL' | 'BOTH';
  quoteAmountFixed?: number;
  quoteAmountPctBalance?: number;
  maxOrdersPerHour?: number;
  minIntervalSec?: number;
  orderTypeDefault?: string;
  slippageBps?: number;
  defaultSlEnabled?: boolean;
  defaultSlPct?: number;
  defaultTpEnabled?: boolean;
  defaultTpPct?: number;
  trailingStopEnabled?: boolean;
  trailingDistancePct?: number;
  vaultId?: number;
}

export class TradeParameterService {
  constructor(private prisma: PrismaClient) {}

  async createParameter(dto: CreateTradeParameterDto): Promise<any> {
    return this.prisma.tradeParameter.create({
      data: {
        user_id: dto.userId,
        exchange_account_id: dto.exchangeAccountId,
        symbol: dto.symbol,
        side: dto.side,
        quote_amount_fixed: dto.quoteAmountFixed || null,
        quote_amount_pct_balance: dto.quoteAmountPctBalance || null,
        max_orders_per_hour: dto.maxOrdersPerHour || null,
        min_interval_sec: dto.minIntervalSec || null,
        order_type_default: dto.orderTypeDefault || 'MARKET',
        slippage_bps: dto.slippageBps || 0,
        default_sl_enabled: dto.defaultSlEnabled || false,
        default_sl_pct: dto.defaultSlPct || null,
        default_tp_enabled: dto.defaultTpEnabled || false,
        default_tp_pct: dto.defaultTpPct || null,
        trailing_stop_enabled: dto.trailingStopEnabled || false,
        trailing_distance_pct: dto.trailingDistancePct || null,
        vault_id: dto.vaultId || null,
      },
    });
  }

  async computeQuoteAmount(
    accountId: number,
    symbol: string,
    side: 'BUY' | 'SELL',
    tradeMode: TradeMode
  ): Promise<number> {
    console.log(`[TRADE-PARAMETER] Buscando parâmetro para:`, {
      accountId,
      symbol,
      side,
      tradeMode,
    });

    // Normalizar símbolo (remover sufixos como .P, .F, etc.)
    const normalizedSymbol = symbol.replace(/\.(P|F|PERP|FUTURES)$/i, '').trim();
    // Tentar formatos comuns: SOLUSDT -> SOL/USDT, SOL/USDT -> SOLUSDT
    const symbolVariations = [
      symbol.trim(), // Original
      normalizedSymbol,
      normalizedSymbol.replace('/', ''),
      normalizedSymbol.replace(/([A-Z]+)(USDT|BTC|ETH|BNB)/, '$1/$2'),
    ];
    
    console.log(`[TRADE-PARAMETER] Símbolo original: "${symbol}"`);
    console.log(`[TRADE-PARAMETER] Variações de símbolo a verificar: [${symbolVariations.map(v => `"${v}"`).join(', ')}]`);

    // Buscar todos os parâmetros da conta para verificar se algum contém o símbolo
    const allParameters = await this.prisma.tradeParameter.findMany({
      where: {
        exchange_account_id: accountId,
        side: { in: [side, 'BOTH'] },
      },
    });

    console.log(`[TRADE-PARAMETER] Parâmetros encontrados para conta ${accountId}:`, 
      allParameters.map(p => ({ id: p.id, symbol: p.symbol, side: p.side }))
    );

    // Procurar parâmetro que corresponda ao símbolo
    let parameter = null;
    
    console.log(`[TRADE-PARAMETER] Verificando ${allParameters.length} parâmetro(s) encontrado(s)`);
    
    for (const param of allParameters) {
      console.log(`[TRADE-PARAMETER] Verificando parâmetro ID ${param.id}: symbol="${param.symbol}", side="${param.side}"`);
      
      // Se o símbolo do parâmetro contém vírgulas, verificar se nosso símbolo está na lista
      if (param.symbol && param.symbol.includes(',')) {
        const symbolList = param.symbol.split(',').map(s => s.trim());
        console.log(`[TRADE-PARAMETER] Parâmetro tem múltiplos símbolos: [${symbolList.join(', ')}]`);
        
        // Função auxiliar para normalizar símbolo (remove sufixos, espaços, converte para uppercase)
        const normalizeSymbol = (s: string): string => {
          if (!s) return '';
          return s.trim().toUpperCase().replace(/\.(P|F|PERP|FUTURES)$/i, '').replace(/\//g, '');
        };
        
        // Normalizar símbolo buscado
        const searchSymbolNorm = normalizeSymbol(symbol);
        console.log(`[TRADE-PARAMETER] Símbolo buscado: "${symbol}" -> normalizado: "${searchSymbolNorm}"`);
        console.log(`[TRADE-PARAMETER] Lista de símbolos do parâmetro: [${symbolList.map(s => `"${s}"`).join(', ')}]`);
        
        // Verificar match direto primeiro (mais rápido e simples)
        let found = false;
        for (let i = 0; i < symbolList.length; i++) {
          const listSymbol = symbolList[i];
          const listSymbolNorm = normalizeSymbol(listSymbol);
          
          console.log(`[TRADE-PARAMETER] Comparação ${i + 1}/${symbolList.length}: "${listSymbol}" (normalized: "${listSymbolNorm}") vs "${searchSymbolNorm}"`);
          
          // Teste 1: Comparação direta normalizada (mais confiável)
          if (listSymbolNorm === searchSymbolNorm) {
            console.log(`[TRADE-PARAMETER] ✅✅✅ MATCH 1 ENCONTRADO: "${listSymbolNorm}" === "${searchSymbolNorm}"`);
            found = true;
            break;
          }
          
          // Teste 2: Comparação direta uppercase (sem normalização)
          const listUpper = listSymbol.trim().toUpperCase();
          const searchUpper = symbol.trim().toUpperCase();
          if (listUpper === searchUpper) {
            console.log(`[TRADE-PARAMETER] ✅✅✅ MATCH 2 ENCONTRADO: "${listUpper}" === "${searchUpper}"`);
            found = true;
            break;
          }
          
          // Teste 3: Comparação normalizada vs original uppercase
          if (listSymbolNorm === searchUpper || listUpper === searchSymbolNorm) {
            console.log(`[TRADE-PARAMETER] ✅✅✅ MATCH 3 ENCONTRADO: Cross match`);
            found = true;
            break;
          }
          
          // Teste 4: Comparação sem espaços e case-insensitive
          const listNoSpaces = listSymbol.replace(/\s/g, '').toUpperCase();
          const searchNoSpaces = symbol.replace(/\s/g, '').toUpperCase();
          if (listNoSpaces === searchNoSpaces) {
            console.log(`[TRADE-PARAMETER] ✅✅✅ MATCH 4 ENCONTRADO: "${listNoSpaces}" === "${searchNoSpaces}"`);
            found = true;
            break;
          }
        }
        
        // Se não encontrou com match direto, tentar com variações do símbolo buscado
        if (!found) {
          console.log(`[TRADE-PARAMETER] Match direto não encontrado, tentando ${symbolVariations.length} variações...`);
          for (let v = 0; v < symbolVariations.length; v++) {
            const symbolVar = symbolVariations[v];
            const varNorm = normalizeSymbol(symbolVar);
            console.log(`[TRADE-PARAMETER] Variação ${v + 1}: "${symbolVar}" -> normalizado: "${varNorm}"`);
            
            for (let i = 0; i < symbolList.length; i++) {
              const listSymbol = symbolList[i];
              const listSymbolNorm = normalizeSymbol(listSymbol);
              
              if (listSymbolNorm === varNorm ||
                  listSymbol.toUpperCase() === symbolVar.toUpperCase() ||
                  listSymbolNorm === symbolVar.toUpperCase() ||
                  listSymbol.toUpperCase() === varNorm) {
                console.log(`[TRADE-PARAMETER] ✅ MATCH via variação ${v + 1}: "${listSymbol}" (${listSymbolNorm}) === "${symbolVar}" (${varNorm})`);
                found = true;
                break;
              }
            }
            
            if (found) break;
          }
        }
        
        if (found) {
          parameter = param;
          console.log(`[TRADE-PARAMETER] ✅✅✅ Parâmetro ENCONTRADO com múltiplos símbolos: ${param.symbol}`);
        } else {
          console.log(`[TRADE-PARAMETER] ❌❌❌ NENHUM match encontrado para "${symbol}" na lista [${symbolList.join(', ')}]`);
          console.log(`[TRADE-PARAMETER] Símbolo buscado normalizado: "${searchSymbolNorm}"`);
          console.log(`[TRADE-PARAMETER] Símbolos da lista normalizados: [${symbolList.map(s => normalizeSymbol(s)).join(', ')}]`);
        }
      } else {
        // Comparação direta ou com variações
        console.log(`[TRADE-PARAMETER] Parâmetro tem símbolo único: "${param.symbol}"`);
        for (const symbolVar of symbolVariations) {
          const normalizedVar = symbolVar.replace(/\.(P|F|PERP|FUTURES)$/i, '').replace('/', '').toUpperCase();
          const normalizedParam = param.symbol.replace(/\.(P|F|PERP|FUTURES)$/i, '').replace('/', '').toUpperCase();
          
          console.log(`[TRADE-PARAMETER] Comparando: param="${param.symbol}" (normalized: "${normalizedParam}") com var="${symbolVar}" (normalized: "${normalizedVar}")`);
          
          if (param.symbol.toUpperCase() === symbolVar.toUpperCase() || normalizedParam === normalizedVar || param.symbol.toUpperCase() === symbol.toUpperCase()) {
            parameter = param;
            console.log(`[TRADE-PARAMETER] ✅ Parâmetro encontrado: ${param.symbol}`);
            break;
          }
        }
      }
      
      if (parameter) {
        console.log(`[TRADE-PARAMETER] ✅ Parâmetro selecionado: ID ${parameter.id}, symbol="${parameter.symbol}"`);
        break;
      }
    }

    if (!parameter) {
      // Log todos os parâmetros disponíveis para debug
      const allParams = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: accountId,
        },
        select: {
          id: true,
          symbol: true,
          side: true,
        },
      });
      console.error(`[TRADE-PARAMETER] ❌ Parâmetro não encontrado. Parâmetros disponíveis para conta ${accountId}:`, allParams);
      throw new Error(`Trade parameter not found for account ${accountId}, symbol ${symbol}, side ${side}`);
    }

    console.log(`[TRADE-PARAMETER] ✅ Parâmetro encontrado:`, {
      id: parameter.id,
      symbol: parameter.symbol,
      side: parameter.side,
      quote_amount_fixed: parameter.quote_amount_fixed?.toNumber(),
      quote_amount_pct_balance: parameter.quote_amount_pct_balance?.toNumber(),
    });

    if (parameter.quote_amount_fixed) {
      return parameter.quote_amount_fixed.toNumber();
    }

    if (parameter.quote_amount_pct_balance) {
      const balance = await this.prisma.accountBalanceCache.findUnique({
        where: {
          exchange_account_id_trade_mode_asset: {
            exchange_account_id: accountId,
            trade_mode: tradeMode,
            asset: 'USDT',
          },
        },
      });

      if (!balance) {
        throw new Error('Balance not found');
      }

      const available = balance.free.toNumber();
      return (available * parameter.quote_amount_pct_balance.toNumber()) / 100;
    }

    throw new Error('No quote amount configuration found');
  }

  async canOpenNewOrder(accountId: number, symbol: string, side: 'BUY' | 'SELL'): Promise<boolean> {
    const parameter = await this.prisma.tradeParameter.findFirst({
      where: {
        exchange_account_id: accountId,
        symbol,
        side: { in: [side, 'BOTH'] },
      },
    });

    if (!parameter) {
      return true; // No restrictions if no parameter
    }

    // Check max orders per hour
    if (parameter.max_orders_per_hour) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentJobs = await this.prisma.tradeJob.count({
        where: {
          exchange_account_id: accountId,
          symbol,
          side,
          created_at: { gte: oneHourAgo },
        },
      });

      if (recentJobs >= parameter.max_orders_per_hour) {
        return false;
      }
    }

    // Check min interval
    if (parameter.min_interval_sec) {
      const minIntervalAgo = new Date(Date.now() - parameter.min_interval_sec * 1000);
      const recentJob = await this.prisma.tradeJob.findFirst({
        where: {
          exchange_account_id: accountId,
          symbol,
          side,
          created_at: { gte: minIntervalAgo },
        },
        orderBy: { created_at: 'desc' },
      });

      if (recentJob) {
        return false;
      }
    }

    return true;
  }
}

