import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, PositionStatus, CloseReason, ExchangeType } from '@mvcashnode/shared';

export interface PositionFill {
  executionId: number;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
}

export class PositionService {
  constructor(private prisma: PrismaClient) {}

  async onBuyExecuted(jobId: number, executionId: number, executedQty: number, avgPrice: number): Promise<number> {
    const job = await this.prisma.tradeJob.findUnique({
      where: { id: jobId },
      include: { exchange_account: true },
    });

    if (!job || job.side !== 'BUY') {
      throw new Error('Invalid buy job');
    }

    // Buscar parâmetros de trading para copiar configurações
    let minProfitPct: number | null = null;
    let slEnabled: boolean = false;
    let slPct: number | null = null;
    let tpEnabled: boolean = false;
    let tpPct: number | null = null;

    try {
      console.log(`[POSITION-SERVICE] Buscando parâmetros para posição: account=${job.exchange_account_id}, symbol=${job.symbol}`);
      
      // Buscar primeiro parâmetro BOTH (tem todas as configurações)
      const bothParameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: job.exchange_account_id,
          symbol: job.symbol,
          side: 'BOTH',
        },
      });

      // Buscar parâmetros separados (sempre buscar para garantir que temos todos os valores)
      const buyParameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: job.exchange_account_id,
          symbol: job.symbol,
          side: 'BUY',
        },
      });

      const sellParameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: job.exchange_account_id,
          symbol: job.symbol,
          side: 'SELL',
        },
      });

      // Priorizar BOTH, mas usar BUY e SELL se necessário
      const parameter = bothParameter || buyParameter || sellParameter;

      if (bothParameter) {
        // Parâmetro BOTH encontrado - copiar todas as configurações
        console.log(`[POSITION-SERVICE] Parâmetro BOTH encontrado (ID: ${bothParameter.id})`);
        
        // Copiar min_profit_pct (sempre copiar se existir, mesmo que seja 0)
        if (bothParameter.min_profit_pct !== null && bothParameter.min_profit_pct !== undefined) {
          minProfitPct = bothParameter.min_profit_pct.toNumber();
          console.log(`[POSITION-SERVICE] ✓ min_profit_pct=${minProfitPct}% copiado do parâmetro BOTH`);
        }
        
        // Copiar SL/TP (sempre copiar se existir)
        if (bothParameter.default_sl_enabled !== undefined && bothParameter.default_sl_enabled !== null) {
          slEnabled = bothParameter.default_sl_enabled;
          console.log(`[POSITION-SERVICE] ✓ sl_enabled=${slEnabled} copiado do parâmetro BOTH`);
        }
        
        if (bothParameter.default_sl_pct !== null && bothParameter.default_sl_pct !== undefined) {
          slPct = bothParameter.default_sl_pct.toNumber();
          console.log(`[POSITION-SERVICE] ✓ sl_pct=${slPct}% copiado do parâmetro BOTH`);
        }
        
        if (bothParameter.default_tp_enabled !== undefined && bothParameter.default_tp_enabled !== null) {
          tpEnabled = bothParameter.default_tp_enabled;
          console.log(`[POSITION-SERVICE] ✓ tp_enabled=${tpEnabled} copiado do parâmetro BOTH`);
        }
        
        if (bothParameter.default_tp_pct !== null && bothParameter.default_tp_pct !== undefined) {
          tpPct = bothParameter.default_tp_pct.toNumber();
          console.log(`[POSITION-SERVICE] ✓ tp_pct=${tpPct}% copiado do parâmetro BOTH`);
        }
      } else {
        // Não encontrou BOTH, usar BUY e SELL separadamente
        console.log(`[POSITION-SERVICE] Parâmetro BOTH não encontrado, buscando BUY e SELL separadamente`);
        
        // Copiar min_profit_pct do parâmetro de SELL (prioridade) ou BUY se SELL não existir
        if (sellParameter && sellParameter.min_profit_pct !== null && sellParameter.min_profit_pct !== undefined) {
          minProfitPct = sellParameter.min_profit_pct.toNumber();
          console.log(`[POSITION-SERVICE] ✓ min_profit_pct=${minProfitPct}% copiado do parâmetro SELL (ID: ${sellParameter.id})`);
        } else if (buyParameter && buyParameter.min_profit_pct !== null && buyParameter.min_profit_pct !== undefined) {
          minProfitPct = buyParameter.min_profit_pct.toNumber();
          console.log(`[POSITION-SERVICE] ✓ min_profit_pct=${minProfitPct}% copiado do parâmetro BUY (ID: ${buyParameter.id})`);
        }

        // Copiar TP/SL do parâmetro de BUY
        if (buyParameter) {
          console.log(`[POSITION-SERVICE] Parâmetro BUY encontrado (ID: ${buyParameter.id})`);
          
          if (buyParameter.default_sl_enabled !== undefined && buyParameter.default_sl_enabled !== null) {
            slEnabled = buyParameter.default_sl_enabled;
            console.log(`[POSITION-SERVICE] ✓ sl_enabled=${slEnabled} copiado do parâmetro BUY`);
          }
          
          if (buyParameter.default_sl_pct !== null && buyParameter.default_sl_pct !== undefined) {
            slPct = buyParameter.default_sl_pct.toNumber();
            console.log(`[POSITION-SERVICE] ✓ sl_pct=${slPct}% copiado do parâmetro BUY`);
          }
          
          if (buyParameter.default_tp_enabled !== undefined && buyParameter.default_tp_enabled !== null) {
            tpEnabled = buyParameter.default_tp_enabled;
            console.log(`[POSITION-SERVICE] ✓ tp_enabled=${tpEnabled} copiado do parâmetro BUY`);
          }
          
          if (buyParameter.default_tp_pct !== null && buyParameter.default_tp_pct !== undefined) {
            tpPct = buyParameter.default_tp_pct.toNumber();
            console.log(`[POSITION-SERVICE] ✓ tp_pct=${tpPct}% copiado do parâmetro BUY`);
          }
        }
      }

      // Resumo final dos valores copiados
      console.log(`[POSITION-SERVICE] Resumo dos parâmetros copiados para posição:`);
      console.log(`[POSITION-SERVICE]   - min_profit_pct: ${minProfitPct !== null ? `${minProfitPct}%` : 'null'}`);
      console.log(`[POSITION-SERVICE]   - sl_enabled: ${slEnabled}, sl_pct: ${slPct !== null ? `${slPct}%` : 'null'}`);
      console.log(`[POSITION-SERVICE]   - tp_enabled: ${tpEnabled}, tp_pct: ${tpPct !== null ? `${tpPct}%` : 'null'}`);

      if (!parameter) {
        console.warn(`[POSITION-SERVICE] ⚠️ Nenhum parâmetro encontrado para account=${job.exchange_account_id}, symbol=${job.symbol}. Usando valores padrão.`);
      }
    } catch (error: any) {
      console.error(`[POSITION-SERVICE] ❌ Erro ao buscar parâmetro para copiar configurações: ${error.message}`);
      console.error(`[POSITION-SERVICE] Stack: ${error.stack}`);
      // Continuar com valores padrão se houver erro
    }

    // Create new position
    const position = await this.prisma.tradePosition.create({
      data: {
        exchange_account_id: job.exchange_account_id,
        trade_mode: job.trade_mode,
        symbol: job.symbol,
        side: 'LONG',
        trade_job_id_open: jobId,
        qty_total: executedQty,
        qty_remaining: executedQty,
        price_open: avgPrice,
        status: PositionStatus.OPEN,
        min_profit_pct: minProfitPct,
        sl_enabled: slEnabled,
        sl_pct: slPct,
        tp_enabled: tpEnabled,
        tp_pct: tpPct,
      },
    });

    // Create position fill
    await this.prisma.positionFill.create({
      data: {
        position_id: position.id,
        trade_execution_id: executionId,
        side: 'BUY',
        qty: executedQty,
        price: avgPrice,
      },
    });

    // VALIDAÇÃO DE SEGURANÇA: Verificar se os parâmetros foram copiados corretamente e atualizar se necessário
    const needsUpdate = await this.validateAndUpdatePositionParams(
      position.id,
      job.exchange_account_id,
      job.symbol
    );
    
    if (needsUpdate) {
      console.log(`[POSITION-SERVICE] ✅ Posição ${position.id} atualizada com parâmetros faltantes após validação`);
    }

    return position.id;
  }

  /**
   * Valida e atualiza parâmetros da posição se faltarem
   * Busca novamente dos parâmetros de trading e atualiza a posição
   * @param positionId ID da posição
   * @param exchangeAccountId ID da conta de exchange
   * @param symbol Símbolo do par de trading
   * @returns true se a posição foi atualizada, false caso contrário
   */
  private async validateAndUpdatePositionParams(
    positionId: number,
    exchangeAccountId: number,
    symbol: string
  ): Promise<boolean> {
    try {
      // Buscar posição atual
      const position = await this.prisma.tradePosition.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        console.warn(`[POSITION-SERVICE] Posição ${positionId} não encontrada para validação`);
        return false;
      }

      // Buscar parâmetros primeiro para verificar se há fonte disponível
      const bothParameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: exchangeAccountId,
          symbol: symbol,
          side: 'BOTH',
        },
      });

      const buyParameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: exchangeAccountId,
          symbol: symbol,
          side: 'BUY',
        },
      });

      const sellParameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: exchangeAccountId,
          symbol: symbol,
          side: 'SELL',
        },
      });

      // Verificar se há parâmetros disponíveis
      const hasParameterSource = bothParameter || buyParameter || sellParameter;

      // Verificar se faltam parâmetros críticos
      // min_profit_pct é sempre crítico se não estiver definido
      const missingMinProfit = position.min_profit_pct === null;
      
      // SL/TP são considerados faltando apenas se enabled=false e pct=null (não foram configurados)
      const missingSL = position.sl_enabled === false && position.sl_pct === null;
      const missingTP = position.tp_enabled === false && position.tp_pct === null;

      // Se não faltar nada crítico, não precisa atualizar
      if (!missingMinProfit && !missingSL && !missingTP) {
        console.log(`[POSITION-SERVICE] ✅ Posição ${positionId} já possui todos os parâmetros necessários`);
        return false;
      }
      
      // Se faltar min_profit_pct e não houver fonte de parâmetros, logar aviso mas não atualizar
      if (missingMinProfit && !hasParameterSource) {
        console.warn(`[POSITION-SERVICE] ⚠️ Posição ${positionId} sem min_profit_pct e sem parâmetros disponíveis`);
        return false;
      }

      console.log(`[POSITION-SERVICE] 🔍 Validando parâmetros da posição ${positionId}...`);
      console.log(`[POSITION-SERVICE]   - min_profit_pct faltando: ${missingMinProfit}`);
      console.log(`[POSITION-SERVICE]   - SL faltando: ${missingSL}`);
      console.log(`[POSITION-SERVICE]   - TP faltando: ${missingTP}`);

      // Preparar dados para atualização
      const updateData: any = {};
      let hasUpdates = false;

      // Atualizar min_profit_pct (prioridade máxima)
      if (missingMinProfit) {
        if (bothParameter && bothParameter.min_profit_pct !== null && bothParameter.min_profit_pct !== undefined) {
          updateData.min_profit_pct = bothParameter.min_profit_pct.toNumber();
          hasUpdates = true;
          console.log(`[POSITION-SERVICE] ✓ min_profit_pct=${updateData.min_profit_pct}% encontrado no parâmetro BOTH`);
        } else if (sellParameter && sellParameter.min_profit_pct !== null && sellParameter.min_profit_pct !== undefined) {
          updateData.min_profit_pct = sellParameter.min_profit_pct.toNumber();
          hasUpdates = true;
          console.log(`[POSITION-SERVICE] ✓ min_profit_pct=${updateData.min_profit_pct}% encontrado no parâmetro SELL`);
        } else if (buyParameter && buyParameter.min_profit_pct !== null && buyParameter.min_profit_pct !== undefined) {
          updateData.min_profit_pct = buyParameter.min_profit_pct.toNumber();
          hasUpdates = true;
          console.log(`[POSITION-SERVICE] ✓ min_profit_pct=${updateData.min_profit_pct}% encontrado no parâmetro BUY`);
        } else {
          console.warn(`[POSITION-SERVICE] ⚠️ min_profit_pct não encontrado em nenhum parâmetro para posição ${positionId}`);
        }
      }

      // Atualizar SL/TP se faltarem
      if (missingSL || missingTP) {
        const sourceParam = bothParameter || buyParameter;
        
        if (sourceParam) {
          let slUpdated = false;
          let tpUpdated = false;
          
          if (missingSL) {
            if (sourceParam.default_sl_enabled !== undefined && sourceParam.default_sl_enabled !== null) {
              updateData.sl_enabled = sourceParam.default_sl_enabled;
              hasUpdates = true;
              slUpdated = true;
            }
            if (sourceParam.default_sl_pct !== null && sourceParam.default_sl_pct !== undefined) {
              updateData.sl_pct = sourceParam.default_sl_pct.toNumber();
              hasUpdates = true;
              slUpdated = true;
            }
            if (slUpdated) {
              console.log(`[POSITION-SERVICE] ✓ SL atualizado: enabled=${updateData.sl_enabled || false}, pct=${updateData.sl_pct || 'null'}`);
            }
          }

          if (missingTP) {
            if (sourceParam.default_tp_enabled !== undefined && sourceParam.default_tp_enabled !== null) {
              updateData.tp_enabled = sourceParam.default_tp_enabled;
              hasUpdates = true;
              tpUpdated = true;
            }
            if (sourceParam.default_tp_pct !== null && sourceParam.default_tp_pct !== undefined) {
              updateData.tp_pct = sourceParam.default_tp_pct.toNumber();
              hasUpdates = true;
              tpUpdated = true;
            }
            if (tpUpdated) {
              console.log(`[POSITION-SERVICE] ✓ TP atualizado: enabled=${updateData.tp_enabled || false}, pct=${updateData.tp_pct || 'null'}`);
            }
          }
        } else {
          console.warn(`[POSITION-SERVICE] ⚠️ SL/TP faltando mas nenhum parâmetro encontrado para posição ${positionId}`);
        }
      }

      // Atualizar posição se houver mudanças
      if (hasUpdates) {
        await this.prisma.tradePosition.update({
          where: { id: positionId },
          data: updateData,
        });
        
        console.log(`[POSITION-SERVICE] ✅ Posição ${positionId} atualizada com sucesso:`, updateData);
        return true;
      } else {
        console.log(`[POSITION-SERVICE] ℹ️ Nenhum parâmetro encontrado para atualizar posição ${positionId}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[POSITION-SERVICE] ❌ Erro ao validar/atualizar parâmetros da posição ${positionId}: ${error.message}`);
      console.error(`[POSITION-SERVICE] Stack: ${error.stack}`);
      return false;
    }
  }

  /**
   * Valida se a venda atende ao lucro mínimo configurado na posição
   * @param positionId ID da posição
   * @param sellPrice Preço de venda
   * @returns Resultado da validação
   */
  async validateMinProfit(
    positionId: number,
    sellPrice: number
  ): Promise<{ valid: boolean; reason: string; profitPct?: number; minProfitPct?: number }> {
    try {
      const position = await this.prisma.tradePosition.findUnique({
        where: { id: positionId },
      });

      if (!position) {
        return {
          valid: true,
          reason: 'Posição não encontrada - permitindo venda',
        };
      }

      // Se min_profit_pct não estiver configurado, permitir venda
      if (!position.min_profit_pct) {
        return {
          valid: true,
          reason: 'min_profit_pct não configurado na posição - permitindo venda',
        };
      }

      const minProfitPct = position.min_profit_pct.toNumber();
      const priceOpen = position.price_open.toNumber();

      // Calcular lucro percentual
      const profitPct = ((sellPrice - priceOpen) / priceOpen) * 100;

      console.log(`[POSITION-SERVICE] Validação de lucro mínimo: posição ${positionId}, preço abertura=${priceOpen}, preço venda=${sellPrice}, lucro=${profitPct.toFixed(2)}%, mínimo=${minProfitPct.toFixed(2)}%`);

      // Validar se atende ao lucro mínimo
      if (profitPct < minProfitPct) {
        return {
          valid: false,
          reason: `Lucro atual (${profitPct.toFixed(2)}%) abaixo do mínimo configurado na posição (${minProfitPct.toFixed(2)}%)`,
          profitPct,
          minProfitPct,
        };
      }

      return {
        valid: true,
        reason: `Lucro mínimo atendido: ${profitPct.toFixed(2)}% >= ${minProfitPct.toFixed(2)}%`,
        profitPct,
        minProfitPct,
      };
    } catch (error: any) {
      console.error(`[POSITION-SERVICE] Erro ao validar lucro mínimo: ${error.message}`);
      // Em caso de erro, permitir venda mas registrar aviso
      return {
        valid: true,
        reason: `Erro ao validar: ${error.message}`,
      };
    }
  }

  async onSellExecuted(
    jobId: number,
    executionId: number,
    executedQty: number,
    avgPrice: number,
    origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING'
  ): Promise<void> {
    const job = await this.prisma.tradeJob.findUnique({
      where: { id: jobId },
      include: { exchange_account: true },
    });

    if (!job || job.side !== 'SELL') {
      throw new Error('Invalid sell job');
    }

    // Get eligible positions (FIFO)
    const eligiblePositions = await this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: job.exchange_account_id,
        trade_mode: job.trade_mode,
        symbol: job.symbol,
        side: 'LONG',
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
        ...(origin === 'WEBHOOK' ? { lock_sell_by_webhook: false } : {}),
      },
      orderBy: { created_at: 'asc' },
    });

    if (eligiblePositions.length === 0) {
      await this.prisma.tradeJob.update({
        where: { id: jobId },
        data: {
          status: 'SKIPPED',
          reason_code: origin === 'WEBHOOK' ? 'WEBHOOK_LOCK' : 'NO_ELIGIBLE_POSITIONS',
          reason_message: 'No eligible positions found',
        },
      });
      return;
    }

    let remainingToSell = executedQty;

    for (const position of eligiblePositions) {
      if (remainingToSell <= 0) break;

      const qtyToClose = Math.min(position.qty_remaining.toNumber(), remainingToSell);
      const profitUsd = (avgPrice - position.price_open.toNumber()) * qtyToClose;

      const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
      const newRealizedProfit = position.realized_profit_usd.toNumber() + profitUsd;

      await this.prisma.tradePosition.update({
        where: { id: position.id },
        data: {
          qty_remaining: newQtyRemaining,
          realized_profit_usd: newRealizedProfit,
          status: newQtyRemaining === 0 ? PositionStatus.CLOSED : PositionStatus.OPEN,
          closed_at: newQtyRemaining === 0 ? new Date() : null,
          close_reason: newQtyRemaining === 0 ? this.getCloseReason(origin) : null,
        },
      });

      // Create position fill
      await this.prisma.positionFill.create({
        data: {
          position_id: position.id,
          trade_execution_id: executionId,
          side: 'SELL',
          qty: qtyToClose,
          price: avgPrice,
        },
      });

      remainingToSell -= qtyToClose;
    }

    if (remainingToSell > 0) {
      // Partial execution - update job
      await this.prisma.tradeJob.update({
        where: { id: jobId },
        data: {
          status: 'PARTIALLY_FILLED',
          reason_message: `Only ${executedQty - remainingToSell} executed, ${remainingToSell} remaining`,
        },
      });
    }
  }

  async getEligiblePositions(
    accountId: number,
    tradeMode: TradeMode,
    symbol: string,
    origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL'
  ): Promise<any[]> {
    return this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: accountId,
        trade_mode: tradeMode,
        symbol,
        side: 'LONG',
        status: PositionStatus.OPEN,
        qty_remaining: { gt: 0 },
        ...(origin === 'WEBHOOK' ? { lock_sell_by_webhook: false } : {}),
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async updateSLTP(positionId: number, slEnabled?: boolean, slPct?: number, tpEnabled?: boolean, tpPct?: number): Promise<any> {
    const updateData: any = {};
    if (slEnabled !== undefined) updateData.sl_enabled = slEnabled;
    if (slPct !== undefined) updateData.sl_pct = slPct;
    if (tpEnabled !== undefined) updateData.tp_enabled = tpEnabled;
    if (tpPct !== undefined) updateData.tp_pct = tpPct;

    return this.prisma.tradePosition.update({
      where: { id: positionId },
      data: updateData,
    });
  }

  async lockSellByWebhook(positionId: number, lock: boolean): Promise<any> {
    return this.prisma.tradePosition.update({
      where: { id: positionId },
      data: { lock_sell_by_webhook: lock },
    });
  }

  async closePosition(
    positionId: number,
    quantity?: number,
    orderType: 'MARKET' | 'LIMIT' = 'MARKET',
    limitPrice?: number
  ): Promise<{ positionId: number; qtyToClose: number; tradeJobId: number }> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: { exchange_account: true },
    });

    if (!position || position.status === PositionStatus.CLOSED) {
      throw new Error('Position not found or already closed');
    }

    const qtyToClose = quantity || position.qty_remaining.toNumber();
    if (qtyToClose > position.qty_remaining.toNumber()) {
      throw new Error('Quantity exceeds remaining');
    }

    if (qtyToClose <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
    // Se for LIMIT, usar limitPrice para validação; se for MARKET, buscar preço atual
    let sellPrice: number;
    
    if (orderType === 'LIMIT' && limitPrice) {
      sellPrice = limitPrice;
    } else {
      // Para MARKET, buscar preço atual
      const { AdapterFactory } = await import('@mvcashnode/exchange');
      const adapter = AdapterFactory.createAdapter(position.exchange_account.exchange as ExchangeType);
      const ticker = await adapter.fetchTicker(position.symbol);
      sellPrice = ticker.last;
    }
    
    const validationResult = await this.validateMinProfit(positionId, sellPrice);

    if (!validationResult.valid) {
      throw new Error(`Venda não permitida: ${validationResult.reason}`);
    }

    // Create trade job for selling
    const { TradeJobService } = await import('../trading/trade-job.service');
    const tradeJobService = new TradeJobService(this.prisma);

    const tradeJob = await tradeJobService.createJob({
      exchangeAccountId: position.exchange_account_id,
      tradeMode: position.trade_mode as TradeMode,
      symbol: position.symbol,
      side: 'SELL',
      orderType: orderType,
      baseQuantity: qtyToClose,
      limitPrice: limitPrice,
      skipParameterValidation: true, // Já temos a quantidade definida
    });

    return { positionId, qtyToClose, tradeJobId: tradeJob.id };
  }

  async createLimitSellOrder(
    positionId: number,
    limitPrice: number,
    quantity?: number,
    expiresInHours?: number
  ): Promise<{ positionId: number; tradeJobId: number; limitPrice: number; quantity: number }> {
    const position = await this.prisma.tradePosition.findUnique({
      where: { id: positionId },
      include: { exchange_account: true },
    });

    if (!position || position.status === PositionStatus.CLOSED) {
      throw new Error('Position not found or already closed');
    }

    if (limitPrice <= 0) {
      throw new Error('Limit price must be greater than zero');
    }

    const qtyToSell = quantity || position.qty_remaining.toNumber();
    if (qtyToSell > position.qty_remaining.toNumber()) {
      throw new Error('Quantity exceeds remaining');
    }

    if (qtyToSell <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    // VALIDAÇÃO DE LUCRO MÍNIMO: Verificar se a venda atende ao lucro mínimo configurado na posição
    // Usa o limitPrice fornecido para validação
    const validationResult = await this.validateMinProfit(positionId, limitPrice);

    if (!validationResult.valid) {
      throw new Error(`Venda não permitida: ${validationResult.reason}`);
    }

    // Verificar se já existe ordem LIMIT pendente para esta posição
    const existingLimitOrder = await this.prisma.tradeJob.findFirst({
      where: {
        exchange_account_id: position.exchange_account_id,
        trade_mode: position.trade_mode,
        symbol: position.symbol,
        side: 'SELL',
        order_type: 'LIMIT',
        status: 'PENDING_LIMIT',
      },
      include: {
        position_open: {
          where: { id: positionId },
        },
      },
    });

    if (existingLimitOrder) {
      throw new Error(`Position already has a pending LIMIT order (job_id: ${existingLimitOrder.id})`);
    }

    // Calcular data de expiração se fornecida
    let expiresAt: Date | undefined;
    if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    }

    // Create trade job with LIMIT order
    const { TradeJobService } = await import('../trading/trade-job.service');
    const tradeJobService = new TradeJobService(this.prisma);

    const tradeJob = await tradeJobService.createJob({
      exchangeAccountId: position.exchange_account_id,
      tradeMode: position.trade_mode as TradeMode,
      symbol: position.symbol,
      side: 'SELL',
      orderType: 'LIMIT',
      baseQuantity: qtyToSell,
      limitPrice: limitPrice,
      limitOrderExpiresAt: expiresAt,
      skipParameterValidation: true, // Já temos a quantidade definida
    });

    return { positionId, tradeJobId: tradeJob.id, limitPrice, quantity: qtyToSell };
  }

  private getCloseReason(origin: string): CloseReason {
    switch (origin) {
      case 'STOP_LOSS':
        return CloseReason.STOP_LOSS;
      case 'TAKE_PROFIT':
        return CloseReason.TARGET_HIT;
      case 'WEBHOOK':
        return CloseReason.WEBHOOK_SELL;
      case 'MANUAL':
        return CloseReason.MANUAL;
      default:
        return CloseReason.MANUAL;
    }
  }
}

