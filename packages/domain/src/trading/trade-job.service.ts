import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, TradeJobStatus } from '@mvcashnode/shared';
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
  skipParameterValidation?: boolean; // Para casos onde já temos quantidade definida
}

export class TradeJobService {
  private tradeParameterService: TradeParameterService;

  constructor(private prisma: PrismaClient) {
    this.tradeParameterService = new TradeParameterService(prisma);
  }

  async createJob(dto: CreateTradeJobDto): Promise<any> {
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

    // Determinar status inicial baseado no order type
    let initialStatus = TradeJobStatus.PENDING;
    if (dto.orderType === 'LIMIT') {
      initialStatus = TradeJobStatus.PENDING_LIMIT;
    }

    return this.prisma.tradeJob.create({
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
        status: initialStatus,
      },
    });
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

