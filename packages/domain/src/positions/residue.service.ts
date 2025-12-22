import { PrismaClient } from '@mvcashnode/db';
import { TradeMode, normalizeQuantity } from '@mvcashnode/shared';

export class ResidueService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Move resíduo de uma posição para a posição de resíduo consolidada
   * @param sourcePositionId - Posição com resíduo
   * @param residueQty - Quantidade do resíduo
   * @param currentPrice - Preço atual para validação
   */
  async moveToResiduePosition(
    sourcePositionId: number,
    residueQty: number,
    currentPrice: number
  ): Promise<number> {
    return await this.prisma.$transaction(async (tx) => {
      // Buscar posição source
      const sourcePosition = await tx.tradePosition.findUnique({
        where: { id: sourcePositionId },
        select: {
          id: true,
          symbol: true,
          exchange_account_id: true,
          trade_mode: true,
          price_open: true,
          qty_remaining: true,
          status: true,
        }
      });

      if (!sourcePosition) {
        throw new Error(`Source position ${sourcePositionId} not found`);
      }

      // Validar que é realmente um resíduo pequeno
      const residueValueUSD = residueQty * currentPrice;
      if (residueValueUSD >= 1) {
        throw new Error(
          `Residue value ($${residueValueUSD.toFixed(2)}) is too large. ` +
          `Only residues < $1 USD should be moved to residue position.`
        );
      }

      // Validar que quantidade não excede saldo da posição
      if (residueQty > sourcePosition.qty_remaining.toNumber()) {
        throw new Error(
          `Residue qty (${residueQty}) exceeds position qty_remaining (${sourcePosition.qty_remaining.toNumber()})`
        );
      }

      // Buscar ou criar posição de resíduo para este símbolo
      let residuePosition = await tx.tradePosition.findFirst({
        where: {
          symbol: sourcePosition.symbol,
          exchange_account_id: sourcePosition.exchange_account_id,
          trade_mode: sourcePosition.trade_mode,
          is_residue_position: true,
          status: 'OPEN',
        }
      });

      if (!residuePosition) {
        // Criar nova posição de resíduo
        // Buscar um job de abertura válido (pode ser null para posições de resíduo)
        const dummyJob = await tx.tradeJob.findFirst({
          where: {
            exchange_account_id: sourcePosition.exchange_account_id,
            trade_mode: sourcePosition.trade_mode,
            symbol: sourcePosition.symbol,
            side: 'BUY',
          },
          orderBy: { created_at: 'desc' },
          select: { id: true }
        });

        residuePosition = await tx.tradePosition.create({
          data: {
            exchange_account_id: sourcePosition.exchange_account_id,
            trade_mode: sourcePosition.trade_mode as TradeMode,
            symbol: sourcePosition.symbol,
            side: 'LONG',
            price_open: currentPrice,
            qty_total: residueQty,
            qty_remaining: residueQty,
            status: 'OPEN',
            is_residue_position: true,
            is_grouped: false,
            trade_job_id_open: dummyJob?.id || 1, // Usar job existente ou fallback
            fees_on_buy_usd: 0,
            fees_on_sell_usd: 0,
            total_fees_paid_usd: 0,
            realized_profit_usd: 0,
          }
        });

        console.log(
          `[RESIDUE-SERVICE] ✅ Posição de resíduo criada: ` +
          `ID=${residuePosition.id}, symbol=${sourcePosition.symbol}, qty=${residueQty}`
        );
      } else {
        // Atualizar posição de resíduo existente
        // Normalizar para evitar imprecisão de ponto flutuante
        const newQtyTotal = normalizeQuantity(residuePosition.qty_total.toNumber() + residueQty);
        const newQtyRemaining = normalizeQuantity(residuePosition.qty_remaining.toNumber() + residueQty);
        const newPriceOpen = (
          (residuePosition.price_open.toNumber() * residuePosition.qty_total.toNumber()) +
          (currentPrice * residueQty)
        ) / newQtyTotal; // Preço médio ponderado

        await tx.tradePosition.update({
          where: { id: residuePosition.id },
          data: {
            qty_total: newQtyTotal,
            qty_remaining: newQtyRemaining,
            price_open: newPriceOpen,
          }
        });

        console.log(
          `[RESIDUE-SERVICE] ✅ Resíduo adicionado à posição existente: ` +
          `ID=${residuePosition.id}, qty anterior=${residuePosition.qty_remaining.toNumber()}, ` +
          `qty adicionada=${residueQty}, novo total=${newQtyRemaining}`
        );
      }

      // Subtrair resíduo da posição source
      // Normalizar para evitar imprecisão de ponto flutuante
      const newSourceQtyRemaining = normalizeQuantity(sourcePosition.qty_remaining.toNumber() - residueQty);
      const sourceStatus = newSourceQtyRemaining === 0 ? 'CLOSED' : 'OPEN';

      await tx.tradePosition.update({
        where: { id: sourcePositionId },
        data: {
          qty_remaining: newSourceQtyRemaining,
          status: sourceStatus,
          parent_position_id: residuePosition.id, // Link para posição de resíduo
          ...(sourceStatus === 'CLOSED' ? {
            closed_at: new Date(),
            close_reason: 'RESIDUE_MOVED'
          } : {})
        }
      });

      // Criar job de transferência para auditoria
      const transferJob = await tx.residueTransferJob.create({
        data: {
          source_position_id: sourcePositionId,
          target_position_id: residuePosition.id,
          symbol: sourcePosition.symbol,
          qty_transferred: residueQty,
          status: 'COMPLETED',
          completed_at: new Date(),
        }
      });

      console.log(
        `[RESIDUE-SERVICE] ✅ Transferência completa: ` +
        `Job ID=${transferJob.id}, source=${sourcePositionId}, target=${residuePosition.id}, qty=${residueQty}`
      );

      return residuePosition.id;
    });
  }

  /**
   * Busca posição de resíduo consolidada para um símbolo
   */
  async getResiduePosition(
    symbol: string,
    exchangeAccountId: number,
    tradeMode: TradeMode
  ): Promise<any | null> {
    return await this.prisma.tradePosition.findFirst({
      where: {
        symbol,
        exchange_account_id: exchangeAccountId,
        trade_mode: tradeMode,
        is_residue_position: true,
        status: 'OPEN',
      },
      include: {
        residue_moves: {
          select: {
            id: true,
            symbol: true,
            qty_total: true,
            created_at: true,
          },
          take: 10,
          orderBy: { created_at: 'desc' }
        }
      }
    });
  }
}

