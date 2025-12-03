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

    // Buscar parâmetro de trading para copiar min_profit_pct
    let minProfitPct: number | null = null;
    try {
      const parameter = await this.prisma.tradeParameter.findFirst({
        where: {
          exchange_account_id: job.exchange_account_id,
          symbol: job.symbol,
          side: { in: ['SELL', 'BOTH'] },
        },
      });

      if (parameter && parameter.min_profit_pct) {
        minProfitPct = parameter.min_profit_pct.toNumber();
        console.log(`[POSITION-SERVICE] Copiando min_profit_pct=${minProfitPct}% dos parâmetros para posição`);
      } else {
        console.log(`[POSITION-SERVICE] Parâmetro não encontrado ou sem min_profit_pct, deixando como null`);
      }
    } catch (error: any) {
      console.warn(`[POSITION-SERVICE] Erro ao buscar parâmetro para copiar min_profit_pct: ${error.message}`);
      // Continuar sem min_profit_pct se houver erro
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

    return position.id;
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

