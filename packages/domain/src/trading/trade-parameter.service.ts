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
  minProfitPct?: number;
  groupPositionsEnabled?: boolean;
  groupPositionsIntervalMinutes?: number;
  vaultId?: number;
}

export class TradeParameterService {
  constructor(private prisma: PrismaClient) {}

  async createParameter(dto: CreateTradeParameterDto): Promise<any> {
    // Validação: não permitir criar parâmetro sem lucro mínimo definido
    if (!dto.minProfitPct || dto.minProfitPct <= 0) {
      throw new Error('Lucro mínimo (min_profit_pct) é obrigatório e deve ser maior que zero');
    }

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
        min_profit_pct: dto.minProfitPct || null,
        group_positions_enabled: dto.groupPositionsEnabled || false,
        group_positions_interval_minutes: dto.groupPositionsIntervalMinutes || null,
        vault_id: dto.vaultId || null,
      },
    });
  }

  async updateParameter(id: number, dto: Partial<CreateTradeParameterDto>): Promise<any> {
    // Se estiver atualizando min_profit_pct, validar
    // Não permitir remover ou definir como null/zero
    if (dto.minProfitPct !== undefined) {
      if (dto.minProfitPct === null || dto.minProfitPct === undefined || dto.minProfitPct <= 0) {
        throw new Error('Lucro mínimo (min_profit_pct) é obrigatório e deve ser maior que zero. Não é permitido remover ou definir como zero.');
      }
    }

    // Verificar se o parâmetro atual tem min_profit_pct
    // Se não tiver e não estiver sendo atualizado, não permitir atualização de outros campos
    const currentParameter = await this.prisma.tradeParameter.findUnique({
      where: { id },
      select: { min_profit_pct: true },
    });

    if (currentParameter && !currentParameter.min_profit_pct && dto.minProfitPct === undefined) {
      throw new Error('Parâmetro não possui lucro mínimo configurado. É obrigatório definir min_profit_pct antes de atualizar outros campos.');
    }

    return this.prisma.tradeParameter.update({
      where: { id },
      data: {
        ...(dto.symbol !== undefined && { symbol: dto.symbol }),
        ...(dto.side !== undefined && { side: dto.side }),
        ...(dto.quoteAmountFixed !== undefined && { quote_amount_fixed: dto.quoteAmountFixed || null }),
        ...(dto.quoteAmountPctBalance !== undefined && { quote_amount_pct_balance: dto.quoteAmountPctBalance || null }),
        ...(dto.maxOrdersPerHour !== undefined && { max_orders_per_hour: dto.maxOrdersPerHour || null }),
        ...(dto.minIntervalSec !== undefined && { min_interval_sec: dto.minIntervalSec || null }),
        ...(dto.orderTypeDefault !== undefined && { order_type_default: dto.orderTypeDefault }),
        ...(dto.slippageBps !== undefined && { slippage_bps: dto.slippageBps }),
        ...(dto.defaultSlEnabled !== undefined && { default_sl_enabled: dto.defaultSlEnabled }),
        ...(dto.defaultSlPct !== undefined && { default_sl_pct: dto.defaultSlPct || null }),
        ...(dto.defaultTpEnabled !== undefined && { default_tp_enabled: dto.defaultTpEnabled }),
        ...(dto.defaultTpPct !== undefined && { default_tp_pct: dto.defaultTpPct || null }),
        ...(dto.trailingStopEnabled !== undefined && { trailing_stop_enabled: dto.trailingStopEnabled }),
        ...(dto.trailingDistancePct !== undefined && { trailing_distance_pct: dto.trailingDistancePct || null }),
        ...(dto.minProfitPct !== undefined && { min_profit_pct: dto.minProfitPct }),
        ...(dto.groupPositionsEnabled !== undefined && { group_positions_enabled: dto.groupPositionsEnabled }),
        ...(dto.groupPositionsIntervalMinutes !== undefined && { group_positions_interval_minutes: dto.groupPositionsIntervalMinutes || null }),
        ...(dto.vaultId !== undefined && { vault_id: dto.vaultId || null }),
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

    // Função auxiliar para normalizar símbolo (remove sufixos, espaços, converte para uppercase, remove /)
    const normalizeSymbol = (s: string): string => {
      if (!s) return '';
      return s.trim().toUpperCase().replace(/\.(P|F|PERP|FUTURES)$/i, '').replace(/\//g, '').replace(/\s/g, '');
    };
    
    // Normalizar símbolo (remover sufixos como .P, .F, etc.)
    const normalizedSymbol = normalizeSymbol(symbol);
    // Tentar formatos comuns: SOLUSDT -> SOL/USDT, SOL/USDT -> SOLUSDT
    const symbolVariations = [
      symbol.trim(), // Original
      normalizedSymbol,
      normalizedSymbol.replace('/', ''),
      normalizedSymbol.replace(/([A-Z]+)(USDT|BTC|ETH|BNB)/, '$1/$2'),
      // Adicionar variação sem espaços
      symbol.replace(/\s/g, '').toUpperCase(),
    ];
    
    // Remover duplicatas
    const uniqueVariations = Array.from(new Set(symbolVariations.map(v => normalizeSymbol(v))));
    
    console.log(`[TRADE-PARAMETER] Símbolo original: "${symbol}"`);
    console.log(`[TRADE-PARAMETER] Símbolo normalizado: "${normalizedSymbol}"`);
    console.log(`[TRADE-PARAMETER] Variações únicas a verificar: [${uniqueVariations.map(v => `"${v}"`).join(', ')}]`);

    // Buscar todos os parâmetros da conta para verificar se algum contém o símbolo
    const allParameters = await this.prisma.tradeParameter.findMany({
      where: {
        exchange_account_id: accountId,
        side: { in: [side, 'BOTH'] },
      },
    });

    console.log(`[TRADE-PARAMETER] Parâmetros encontrados para conta ${accountId}:`, 
      allParameters.map((p: any) => ({ id: p.id, symbol: p.symbol, side: p.side }))
    );

    // Procurar parâmetro que corresponda ao símbolo
    let parameter = null;
    
    console.log(`[TRADE-PARAMETER] Verificando ${allParameters.length} parâmetro(s) encontrado(s)`);
    
    for (const param of allParameters) {
      console.log(`[TRADE-PARAMETER] Verificando parâmetro ID ${param.id}: symbol="${param.symbol}", side="${param.side}"`);
      
      // Se o símbolo do parâmetro contém vírgulas, verificar se nosso símbolo está na lista
      if (param.symbol && param.symbol.includes(',')) {
        const symbolList = param.symbol.split(',').map((s: string) => s.trim()).filter(s => s.length > 0);
        console.log(`[TRADE-PARAMETER] Parâmetro tem múltiplos símbolos: [${symbolList.join(', ')}]`);
        
        // Normalizar símbolo buscado
        const searchSymbolNorm = normalizeSymbol(symbol);
        console.log(`[TRADE-PARAMETER] Símbolo buscado: "${symbol}" -> normalizado: "${searchSymbolNorm}"`);
        console.log(`[TRADE-PARAMETER] Lista de símbolos do parâmetro: [${symbolList.map((s: string) => `"${s}"`).join(', ')}]`);
        
        // Verificar match usando todas as variações do símbolo buscado
        let found = false;
        
        // Primeiro, tentar match direto com símbolo normalizado
        for (const listSymbol of symbolList) {
          const listSymbolNorm = normalizeSymbol(listSymbol);
          
          if (listSymbolNorm === searchSymbolNorm) {
            console.log(`[TRADE-PARAMETER] ✅✅✅ MATCH ENCONTRADO: "${listSymbol}" (normalized: "${listSymbolNorm}") === "${symbol}" (normalized: "${searchSymbolNorm}")`);
            found = true;
            break;
          }
        }
        
        // Se não encontrou, tentar com todas as variações do símbolo buscado
        if (!found) {
          for (const symbolVar of uniqueVariations) {
            const varNorm = normalizeSymbol(symbolVar);
            
            for (const listSymbol of symbolList) {
              const listSymbolNorm = normalizeSymbol(listSymbol);
              
              if (listSymbolNorm === varNorm) {
                console.log(`[TRADE-PARAMETER] ✅ MATCH via variação: "${listSymbol}" (${listSymbolNorm}) === "${symbolVar}" (${varNorm})`);
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
          console.log(`[TRADE-PARAMETER] Símbolos da lista normalizados: [${symbolList.map((s: string) => normalizeSymbol(s)).join(', ')}]`);
        }
      } else {
        // Comparação direta ou com variações para símbolo único
        console.log(`[TRADE-PARAMETER] Parâmetro tem símbolo único: "${param.symbol}"`);
        const paramSymbolNorm = normalizeSymbol(param.symbol);
        
        // Verificar match direto
        if (paramSymbolNorm === normalizedSymbol) {
          parameter = param;
          console.log(`[TRADE-PARAMETER] ✅ Parâmetro encontrado (match direto): ${param.symbol}`);
        } else {
          // Tentar com variações
          for (const symbolVar of uniqueVariations) {
            const varNorm = normalizeSymbol(symbolVar);
            
            if (paramSymbolNorm === varNorm) {
              parameter = param;
              console.log(`[TRADE-PARAMETER] ✅ Parâmetro encontrado (via variação): ${param.symbol}`);
              break;
            }
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

