import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, TradeJobStatus, normalizeSymbol, isValidSymbol } from '@mvcashnode/shared';
import { TradeParameterService } from './trade-parameter.service';

export interface CreateTradeJobDto {
  webhookEventId?: number;
  exchangeAccountId: number;
  tradeMode: TradeMode;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LIMIT';
  quoteAmount?: number;
  baseQuantity?: number;
  limitPrice?: number;
  vaultId?: number;
  limitOrderExpiresAt?: Date;
  positionIdToClose?: number; // ID da posição específica a fechar (para SELL)
  skipParameterValidation?: boolean; // Para casos onde já temos quantidade definida
  createdBy?: string; // Quem ou qual serviço criou a ordem (USER_MANUAL, WEBHOOK, SLTP_MONITOR, etc.)
}

export class TradeJobService {
  private tradeParameterService: TradeParameterService;

  constructor(private prisma: PrismaClient) {
    this.tradeParameterService = new TradeParameterService(prisma);
  }

  async createJob(dto: CreateTradeJobDto): Promise<any> {
    // ✅ BUG 2-4 FIX: Validar e normalizar símbolo antes de usar (sem barra)
    let normalizedSymbol: string;
    try {
      normalizedSymbol = normalizeSymbol(dto.symbol);
      if (!isValidSymbol(normalizedSymbol)) {
        throw new Error(`Símbolo normalizado "${normalizedSymbol}" não é válido após normalização`);
      }
      console.log(`[TRADE-JOB-SERVICE] Símbolo normalizado: "${dto.symbol}" -> "${normalizedSymbol}"`);
    } catch (error: any) {
      throw new Error(`Erro ao validar/normalizar símbolo "${dto.symbol}": ${error.message}`);
    }

    // Atualizar dto com símbolo normalizado
    dto.symbol = normalizedSymbol;

    let quoteAmount = dto.quoteAmount;
    let baseQuantity = dto.baseQuantity;

    // Se não forneceu quantidade e não pediu para pular validação, calcular usando TradeParameterService
    if (!dto.skipParameterValidation && !quoteAmount && !baseQuantity && dto.side === 'BUY') {
      try {
        // Validar se pode abrir nova ordem
        const canOpen = await this.tradeParameterService.canOpenNewOrder(
          dto.exchangeAccountId,
          dto.symbol,
          dto.side
        );

        if (!canOpen) {
          throw new Error('Cannot open new order: rate limit or interval restriction');
        }

        // Calcular quote amount
        quoteAmount = await this.tradeParameterService.computeQuoteAmount(
          dto.exchangeAccountId,
          dto.symbol,
          dto.side,
          dto.tradeMode
        );
      } catch (error: any) {
        // Se não encontrou parâmetro, permitir criar job sem quantidade (será calculado depois)
        if (error.message.includes('not found')) {
          // Permitir criar job sem quantidade
        } else {
          throw error;
        }
      }
    }

    // ✅ NOVO: Validar SELL - position_id_to_close é obrigatório
    if (dto.side === 'SELL') {
      if (!dto.positionIdToClose || dto.positionIdToClose <= 0) {
        throw new Error('SELL orders must have positionIdToClose. FIFO logic has been removed. All sell orders must specify which position to close.');
      }
      if (!dto.baseQuantity || dto.baseQuantity <= 0) {
        throw new Error('SELL orders must have valid baseQuantity greater than zero.');
      }
    }

    // VALIDAÇÃO: Se for ordem LIMIT, limitPrice é obrigatório
    if (dto.orderType === 'LIMIT' && (!dto.limitPrice || dto.limitPrice <= 0)) {
      throw new Error(`Ordem LIMIT requer limitPrice válido. Recebido: ${dto.limitPrice}`);
    }

    // VALIDAÇÃO: Se for venda via webhook (tem webhookEventId), deve ser LIMIT
    if (dto.webhookEventId && dto.side === 'SELL' && dto.orderType !== 'LIMIT') {
      console.warn(`[TRADE-JOB-SERVICE] ⚠️ Venda via webhook deve ser LIMIT, mas recebeu ${dto.orderType}. Forçando LIMIT.`);
      dto.orderType = 'LIMIT';
      if (!dto.limitPrice || dto.limitPrice <= 0) {
        throw new Error(`Venda via webhook requer limitPrice válido. Recebido: ${dto.limitPrice}`);
      }
    }

    // ✅ VALIDAÇÃO: Prevenir múltiplas ordens para a mesma posição
    // Esta validação é crítica para evitar vendas duplicadas na exchange
    if (dto.side === 'SELL' && dto.positionIdToClose) {
      const existingOrder = await this.prisma.tradeJob.findFirst({
        where: {
          position_id_to_close: dto.positionIdToClose,
          side: 'SELL',
          status: {
            in: [
              'PENDING',
              'PENDING_LIMIT',
              'EXECUTING',
              'PARTIALLY_FILLED' // ← ADICIONAR
            ],
          },
        },
        select: {
          id: true,
          status: true,
          order_type: true,
          created_by: true,
          base_quantity: true,
        },
      });

      if (existingOrder) {
        const creatorInfo = existingOrder.created_by ? ` (criado por: ${existingOrder.created_by})` : '';
        const qtyInfo = existingOrder.base_quantity ? ` (qty: ${existingOrder.base_quantity})` : '';
        
        throw new Error(
          `[DUPLICATE-ORDER-BLOCKED] Já existe uma ordem ${existingOrder.order_type} para a posição ${dto.positionIdToClose}${creatorInfo}. ` +
          `Job ID: ${existingOrder.id}, Status: ${existingOrder.status}${qtyInfo}. ` +
          `Não é permitido criar múltiplas ordens para a mesma posição.`
        );
      }
    }

    // ✅ VALIDAÇÃO: SELL deve sempre ter position_id_to_close
    if (dto.side === 'SELL' && !dto.positionIdToClose) {
      throw new Error(
        `[MISSING-POSITION-ID] Todas ordens de VENDA devem ter position_id_to_close. ` +
        `Não é permitido criar job de venda sem posição vinculada.`
      );
    }

    // Determinar status inicial baseado no order type
    let initialStatus = TradeJobStatus.PENDING;
    if (dto.orderType === 'LIMIT') {
      initialStatus = TradeJobStatus.PENDING_LIMIT;
    }

    console.log(`[TRADE-JOB-SERVICE] ========== CRIANDO JOB NO BANCO ==========`);
    console.log(`[TRADE-JOB-SERVICE] side: ${dto.side}`);
    console.log(`[TRADE-JOB-SERVICE] orderType (dto): ${dto.orderType} (tipo: ${typeof dto.orderType})`);
    console.log(`[TRADE-JOB-SERVICE] limitPrice (dto): ${dto.limitPrice} (tipo: ${typeof dto.limitPrice})`);
    console.log(`[TRADE-JOB-SERVICE] initialStatus: ${initialStatus}`);
    console.log(`[TRADE-JOB-SERVICE] Dados que serão salvos:`, {
      order_type: dto.orderType,
      limit_price: dto.limitPrice,
      side: dto.side,
      webhook_event_id: dto.webhookEventId,
    });

    const job = await this.prisma.tradeJob.create({
      data: {
        webhook_event_id: dto.webhookEventId || null,
        exchange_account_id: dto.exchangeAccountId,
        trade_mode: dto.tradeMode,
        symbol: dto.symbol,
        side: dto.side,
        order_type: dto.orderType,
        quote_amount: quoteAmount || null,
        base_quantity: baseQuantity || null,
        limit_price: dto.limitPrice || null,
        vault_id: dto.vaultId || null,
        limit_order_expires_at: dto.limitOrderExpiresAt || null,
        position_id_to_close: dto.positionIdToClose || null,
        created_by: dto.createdBy || null,
        status: initialStatus,
      },
    });

    console.log(`[TRADE-JOB-SERVICE] ========== JOB CRIADO NO BANCO ==========`);
    console.log(`[TRADE-JOB-SERVICE] Job ID: ${job.id}`);
    console.log(`[TRADE-JOB-SERVICE] order_type (salvo): ${job.order_type}`);
    console.log(`[TRADE-JOB-SERVICE] limit_price (salvo): ${job.limit_price ? job.limit_price.toNumber() : 'NULL'}`);
    console.log(`[TRADE-JOB-SERVICE] status (salvo): ${job.status}`);

    // VALIDAÇÃO PÓS-CRIAÇÃO: Verificar se foi salvo corretamente
    if (dto.orderType === 'LIMIT' && job.order_type !== 'LIMIT') {
      console.error(`[TRADE-JOB-SERVICE] ⚠️ ERRO: Job criado com orderType incorreto! Esperado: LIMIT, Recebido: ${job.order_type}`);
    }
    if (dto.orderType === 'LIMIT' && (!job.limit_price || job.limit_price.toNumber() <= 0)) {
      console.error(`[TRADE-JOB-SERVICE] ⚠️ ERRO: Job LIMIT criado sem limitPrice válido!`);
    }

    console.log(`[TRADE-JOB-SERVICE] ✅ Job criado: ID=${job.id}, order_type=${job.order_type}, limit_price=${job.limit_price?.toNumber() || 'NULL'}, status=${job.status}`);
    return job;
  }

  async updateJobStatus(jobId: number, status: TradeJobStatus, reasonCode?: string, reasonMessage?: string): Promise<any> {
    return this.prisma.tradeJob.update({
      where: { id: jobId },
      data: {
        status,
        reason_code: reasonCode || null,
        reason_message: reasonMessage || null,
      },
    });
  }

  async getJobsByStatus(status: TradeJobStatus, tradeMode?: TradeMode): Promise<any[]> {
    const where: any = { status };
    if (tradeMode) where.trade_mode = tradeMode;

    return this.prisma.tradeJob.findMany({
      where,
      include: {
        exchange_account: true,
        executions: true,
      },
    });
  }
}

