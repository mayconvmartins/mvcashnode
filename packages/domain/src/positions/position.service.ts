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

  async onBuyExecuted(
    jobId: number, 
    executionId: number, 
    executedQty: number, 
    avgPrice: number,
    feeAmount?: number,
    feeCurrency?: string
  ): Promise<number> {
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
    let groupPositionsEnabled: boolean = false;
    let groupPositionsIntervalMinutes: number | null = null;

    try {
      console.log(`[POSITION-SERVICE] Buscando parâmetros para posição: account=${job.exchange_account_id}, symbol=${job.symbol}`);
      
      // Função auxiliar para normalizar símbolo (mesma lógica do trade-parameter.service.ts)
      const normalizeSymbol = (s: string): string => {
        if (!s) return '';
        return s.trim().toUpperCase().replace(/\.(P|F|PERP|FUTURES)$/i, '').replace(/\//g, '').replace(/\s/g, '');
      };
      
      const jobSymbolNorm = normalizeSymbol(job.symbol);
      
      // Buscar todos os parâmetros da conta para verificar se algum contém o símbolo
      const allBothParameters = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: job.exchange_account_id,
          side: 'BOTH',
        },
      });
      
      const allBuyParameters = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: job.exchange_account_id,
          side: 'BUY',
        },
      });
      
      const allSellParameters = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: job.exchange_account_id,
          side: 'SELL',
        },
      });
      
      // Função auxiliar para verificar se um parâmetro corresponde ao símbolo
      const parameterMatchesSymbol = (param: any): boolean => {
        if (!param.symbol) return false;
        
        // Se o parâmetro tem múltiplos símbolos separados por vírgula
        if (param.symbol.includes(',')) {
          const symbolList = param.symbol.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          return symbolList.some((s: string) => normalizeSymbol(s) === jobSymbolNorm);
        } else {
          // Símbolo único
          return normalizeSymbol(param.symbol) === jobSymbolNorm;
        }
      };
      
      // Buscar parâmetro BOTH que corresponde ao símbolo
      let bothParameter = allBothParameters.find(parameterMatchesSymbol);
      
      // Buscar parâmetro BUY que corresponde ao símbolo
      let buyParameter = allBuyParameters.find(parameterMatchesSymbol);
      
      // Buscar parâmetro SELL que corresponde ao símbolo
      let sellParameter = allSellParameters.find(parameterMatchesSymbol);
      
      if (bothParameter) {
        console.log(`[POSITION-SERVICE] Parâmetro BOTH encontrado (ID: ${bothParameter.id}, symbol: ${bothParameter.symbol})`);
      }
      if (buyParameter) {
        console.log(`[POSITION-SERVICE] Parâmetro BUY encontrado (ID: ${buyParameter.id}, symbol: ${buyParameter.symbol})`);
      }
      if (sellParameter) {
        console.log(`[POSITION-SERVICE] Parâmetro SELL encontrado (ID: ${sellParameter.id}, symbol: ${sellParameter.symbol})`);
      }

      // Priorizar BOTH, mas usar BUY e SELL se necessário
      const parameter = bothParameter || buyParameter || sellParameter;

      // Buscar configurações de agrupamento
      if (bothParameter) {
        groupPositionsEnabled = bothParameter.group_positions_enabled || false;
        groupPositionsIntervalMinutes = bothParameter.group_positions_interval_minutes || null;
      } else if (buyParameter) {
        groupPositionsEnabled = buyParameter.group_positions_enabled || false;
        groupPositionsIntervalMinutes = buyParameter.group_positions_interval_minutes || null;
      }

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

    // Verificar se agrupamento está habilitado e buscar posição elegível
    let eligiblePosition: any = null;
    
    if (groupPositionsEnabled && groupPositionsIntervalMinutes && groupPositionsIntervalMinutes > 0) {
      console.log(`[POSITION-SERVICE] 🔄 Agrupamento habilitado (intervalo: ${groupPositionsIntervalMinutes} minutos)`);
      console.log(`[POSITION-SERVICE] Buscando posição elegível para: account=${job.exchange_account_id}, symbol=${job.symbol}, mode=${job.trade_mode}`);
      
      try {
        // Calcular data limite para agrupamento
        const intervalStart = new Date();
        intervalStart.setMinutes(intervalStart.getMinutes() - groupPositionsIntervalMinutes);
        console.log(`[POSITION-SERVICE] Intervalo de agrupamento: de ${intervalStart.toISOString()} até agora`);
        
        // Buscar jobs que já estão agrupados para excluir suas posições da busca
        const groupedJobIds = await this.prisma.positionGroupedJob.findMany({
          select: { trade_job_id: true },
        });
        const groupedJobIdsSet = new Set(groupedJobIds.map(gj => gj.trade_job_id));
        
        // Buscar posições elegíveis para agrupamento
        // Deve ser: mesma conta, mesmo modo, mesmo símbolo, aberta, e:
        // - Já é uma posição agrupada OU
        // - Foi criada dentro do intervalo de tempo
        // E o job de abertura não deve estar já agrupado em outra posição
        const whereClause: any = {
          exchange_account_id: job.exchange_account_id,
          trade_mode: job.trade_mode,
          symbol: job.symbol,
          side: 'LONG',
          status: PositionStatus.OPEN,
          qty_remaining: { gt: 0 },
        };
        
        // Excluir posições cujo job de abertura já está agrupado em outra posição
        if (groupedJobIdsSet.size > 0) {
          whereClause.NOT = {
            trade_job_id_open: { in: Array.from(groupedJobIdsSet) },
          };
        }
        
        // Adicionar condição OR usando sintaxe correta do Prisma
        // Para posições agrupadas, verificar se group_started_at (ou created_at) está dentro do intervalo
        // Para posições não agrupadas, verificar se created_at está dentro do intervalo
        whereClause.OR = [
          {
            AND: [
              { is_grouped: true },
              {
                OR: [
                  { group_started_at: { gte: intervalStart } },
                  {
                    AND: [
                      { group_started_at: null },
                      { created_at: { gte: intervalStart } },
                    ],
                  },
                ],
              },
            ],
          },
          {
            AND: [
              { is_grouped: false },
              { created_at: { gte: intervalStart } },
            ],
          },
        ];
        
        console.log(`[POSITION-SERVICE] Query de busca:`, JSON.stringify(whereClause, null, 2));
        console.log(`[POSITION-SERVICE] Jobs já agrupados (excluídos): ${Array.from(groupedJobIdsSet).join(', ') || 'nenhum'}`);
        
        // Priorizar posições agrupadas: primeiro buscar posições agrupadas, depois não agrupadas
        // Isso garante que novas posições sempre se juntem à posição agrupada existente se ela estiver dentro do intervalo
        
        // Construir where clause para posições agrupadas (sem a condição NOT que pode excluir incorretamente)
        const groupedWhereClause: any = {
          exchange_account_id: job.exchange_account_id,
          trade_mode: job.trade_mode,
          symbol: job.symbol,
          side: 'LONG',
          status: PositionStatus.OPEN,
          qty_remaining: { gt: 0 },
          is_grouped: true,
          OR: [
            { group_started_at: { gte: intervalStart } },
            {
              AND: [
                { group_started_at: null },
                { created_at: { gte: intervalStart } },
              ],
            },
          ],
        };
        
        // Para posições agrupadas, não aplicar a condição NOT porque queremos encontrar a posição agrupada existente
        // A condição NOT só é necessária para evitar agrupar posições cujo job já está agrupado em OUTRA posição
        // Mas quando uma posição é agrupada, ela mantém seu trade_job_id_open original, então não será excluída
        
        let groupedPosition = await this.prisma.tradePosition.findFirst({
          where: groupedWhereClause,
          orderBy: [
            { group_started_at: 'asc' },
            { created_at: 'asc' },
          ],
        });
        
        if (groupedPosition) {
          eligiblePosition = groupedPosition;
          const posDate = groupedPosition.group_started_at || groupedPosition.created_at;
          const isWithinInterval = new Date(posDate) >= intervalStart;
          console.log(`[POSITION-SERVICE] ✅ Posição agrupada encontrada (prioridade): ID=${groupedPosition.id}, is_grouped=${groupedPosition.is_grouped}, group_started_at=${groupedPosition.group_started_at?.toISOString() || 'null'}, dentro do intervalo=${isWithinInterval}`);
        } else {
          console.log(`[POSITION-SERVICE] ℹ️ Nenhuma posição agrupada encontrada, buscando posições não agrupadas`);
          // Se não encontrou posição agrupada, buscar posições não agrupadas
          eligiblePosition = await this.prisma.tradePosition.findFirst({
            where: whereClause,
            orderBy: { created_at: 'asc' },
          });
        }

        if (eligiblePosition) {
          const posDate = eligiblePosition.group_started_at || eligiblePosition.created_at;
          const isWithinInterval = new Date(posDate) >= intervalStart;
          console.log(`[POSITION-SERVICE] ✅ Posição elegível encontrada para agrupamento: ID=${eligiblePosition.id}, is_grouped=${eligiblePosition.is_grouped}, created_at=${eligiblePosition.created_at.toISOString()}, group_started_at=${eligiblePosition.group_started_at?.toISOString() || 'null'}, dentro do intervalo=${isWithinInterval}`);
        } else {
          console.log(`[POSITION-SERVICE] ℹ️ Nenhuma posição elegível encontrada para agrupamento`);
          // Log adicional: verificar quantas posições existem que atendem os critérios básicos
          const allMatchingPositions = await this.prisma.tradePosition.findMany({
            where: {
              exchange_account_id: job.exchange_account_id,
              trade_mode: job.trade_mode,
              symbol: job.symbol,
              side: 'LONG',
              status: PositionStatus.OPEN,
              qty_remaining: { gt: 0 },
            },
            select: {
              id: true,
              is_grouped: true,
              created_at: true,
              group_started_at: true,
              trade_job_id_open: true,
            },
          });
          console.log(`[POSITION-SERVICE] Total de posições abertas encontradas: ${allMatchingPositions.length}`);
          
          // Separar posições agrupadas e não agrupadas para melhor diagnóstico
          const groupedPositions = allMatchingPositions.filter((p: any) => p.is_grouped);
          const ungroupedPositions = allMatchingPositions.filter((p: any) => !p.is_grouped);
          
          console.log(`[POSITION-SERVICE] Posições agrupadas: ${groupedPositions.length}`);
          groupedPositions.forEach((p: any) => {
            const posDate = p.group_started_at || p.created_at;
            const isWithinInterval = new Date(posDate) >= intervalStart;
            const isJobGrouped = groupedJobIdsSet.has(p.trade_job_id_open);
            console.log(`[POSITION-SERVICE]   [AGRUPADA] Posição ${p.id}: created_at=${p.created_at.toISOString()}, group_started_at=${p.group_started_at?.toISOString() || 'null'}, dentro do intervalo=${isWithinInterval}, job já agrupado=${isJobGrouped}`);
          });
          
          console.log(`[POSITION-SERVICE] Posições não agrupadas: ${ungroupedPositions.length}`);
          ungroupedPositions.forEach((p: any) => {
            const posDate = p.group_started_at || p.created_at;
            const isWithinInterval = new Date(posDate) >= intervalStart;
            const isJobGrouped = groupedJobIdsSet.has(p.trade_job_id_open);
            console.log(`[POSITION-SERVICE]   [NÃO AGRUPADA] Posição ${p.id}: created_at=${p.created_at.toISOString()}, dentro do intervalo=${isWithinInterval}, job já agrupado=${isJobGrouped}`);
          });
        }
      } catch (error: any) {
        console.error(`[POSITION-SERVICE] ❌ Erro ao buscar posição elegível para agrupamento: ${error.message}`);
        console.error(`[POSITION-SERVICE] Stack: ${error.stack}`);
        // Continuar criando nova posição em caso de erro
      }
    } else {
      console.log(`[POSITION-SERVICE] ℹ️ Agrupamento desabilitado ou intervalo não configurado (enabled=${groupPositionsEnabled}, interval=${groupPositionsIntervalMinutes})`);
    }

    // Calcular taxa em USD para atualização da posição
    let feeUsd = 0;
    if (feeAmount && feeAmount > 0 && feeCurrency) {
      const quoteAsset = job.symbol.split('/')[1] || 'USDT';
      if (feeCurrency === 'USDT' || feeCurrency === 'USD' || feeCurrency === quoteAsset) {
        // Taxa já está em USD ou em quote asset (que geralmente é USDT)
        feeUsd = feeAmount;
      } else if (feeCurrency === job.symbol.split('/')[0]) {
        // Taxa em base asset, converter usando preço médio
        feeUsd = feeAmount * avgPrice;
      } else {
        // Outra moeda, usar aproximação (assumir 1:1 com USD se não conseguir converter)
        feeUsd = feeAmount;
        console.warn(`[POSITION-SERVICE] Taxa em moeda desconhecida ${feeCurrency}, usando valor direto`);
      }
    }

    // Se encontrou posição elegível, agrupar
    if (eligiblePosition) {
      return await this.prisma.$transaction(async (tx) => {
        // Re-buscar posição com lock para evitar race conditions
        const positionToUpdate = await tx.tradePosition.findUnique({
          where: { id: eligiblePosition.id },
        });

        if (!positionToUpdate || positionToUpdate.status !== PositionStatus.OPEN) {
          // Posição não existe mais ou foi fechada, criar nova
          console.log(`[POSITION-SERVICE] ⚠️ Posição elegível não está mais disponível, criando nova posição`);
          return await this.createNewPosition(tx, job, jobId, executionId, executedQty, avgPrice, minProfitPct, slEnabled, slPct, tpEnabled, tpPct, false, null, feeUsd);
        }

        // Calcular novo custo médio ponderado
        const existingQty = positionToUpdate.qty_total.toNumber();
        const existingPrice = positionToUpdate.price_open.toNumber();
        const newQty = executedQty;
        const newPrice = avgPrice;

        // Custo médio ponderado: (qty_existente * price_existente + qty_nova * price_nova) / (qty_existente + qty_nova)
        const totalCost = existingQty * existingPrice + newQty * newPrice;
        const totalQty = existingQty + newQty;
        const weightedAvgPrice = totalCost / totalQty;

        console.log(`[POSITION-SERVICE] 📊 Calculando custo médio ponderado:`);
        console.log(`[POSITION-SERVICE]   - Qty existente: ${existingQty}, Preço: ${existingPrice}`);
        console.log(`[POSITION-SERVICE]   - Qty nova: ${newQty}, Preço: ${newPrice}`);
        console.log(`[POSITION-SERVICE]   - Custo médio ponderado: ${weightedAvgPrice.toFixed(8)}`);
        console.log(`[POSITION-SERVICE]   - Taxa na compra: ${feeUsd} USD`);

        // Determinar group_started_at (usar o mais antigo)
        const groupStartedAt = positionToUpdate.group_started_at || positionToUpdate.created_at;

        // Atualizar taxas acumuladas
        const existingFeesOnBuy = positionToUpdate.fees_on_buy_usd.toNumber();
        const existingTotalFees = positionToUpdate.total_fees_paid_usd.toNumber();

        // Atualizar posição existente
        const updatedPosition = await tx.tradePosition.update({
          where: { id: positionToUpdate.id },
          data: {
            qty_total: totalQty,
            qty_remaining: totalQty,
            price_open: weightedAvgPrice,
            is_grouped: true,
            group_started_at: groupStartedAt,
            fees_on_buy_usd: existingFeesOnBuy + feeUsd,
            total_fees_paid_usd: existingTotalFees + feeUsd,
          },
        });

        // Criar position fill
        await tx.positionFill.create({
          data: {
            position_id: updatedPosition.id,
            trade_execution_id: executionId,
            side: 'BUY',
            qty: executedQty,
            price: avgPrice,
          },
        });

        // Criar registro de agrupamento para rastrear o job original (novo job)
        await tx.positionGroupedJob.create({
          data: {
            position_id: updatedPosition.id,
            trade_job_id: jobId,
          },
        });

        // Criar registro de agrupamento também para o job da posição existente (se ainda não existir)
        if (positionToUpdate.trade_job_id_open) {
          const existingGroupedJob = await tx.positionGroupedJob.findFirst({
            where: {
              position_id: updatedPosition.id,
              trade_job_id: positionToUpdate.trade_job_id_open,
            },
          });
          
          if (!existingGroupedJob) {
            await tx.positionGroupedJob.create({
              data: {
                position_id: updatedPosition.id,
                trade_job_id: positionToUpdate.trade_job_id_open,
              },
            });
            console.log(`[POSITION-SERVICE] ✅ Criado PositionGroupedJob para job existente: ${positionToUpdate.trade_job_id_open}`);
          }
        }

        console.log(`[POSITION-SERVICE] ✅ Posição ${updatedPosition.id} atualizada com agrupamento (total qty: ${totalQty}, avg price: ${weightedAvgPrice.toFixed(8)})`);

        return updatedPosition.id;
      });
    }

    // Se não encontrou posição elegível ou agrupamento desabilitado, criar nova posição
    return await this.createNewPosition(
      this.prisma,
      job,
      jobId,
      executionId,
      executedQty,
      avgPrice,
      minProfitPct,
      slEnabled,
      slPct,
      tpEnabled,
      tpPct,
      false,
      null,
      feeUsd
    );
  }

  /**
   * Método auxiliar para criar nova posição
   */
  private async createNewPosition(
    prisma: any,
    job: any,
    jobId: number,
    executionId: number,
    executedQty: number,
    avgPrice: number,
    minProfitPct: number | null,
    slEnabled: boolean,
    slPct: number | null,
    tpEnabled: boolean,
    tpPct: number | null,
    isGrouped: boolean,
    groupStartedAt: Date | null,
    feesOnBuyUsd: number = 0
  ): Promise<number> {
    // Create new position
    const position = await prisma.tradePosition.create({
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
        is_grouped: isGrouped,
        group_started_at: groupStartedAt,
        fees_on_buy_usd: feesOnBuyUsd,
        total_fees_paid_usd: feesOnBuyUsd,
      },
    });

    // Create position fill
    await prisma.positionFill.create({
      data: {
        position_id: position.id,
        trade_execution_id: executionId,
        side: 'BUY',
        qty: executedQty,
        price: avgPrice,
      },
    });

    // VALIDAÇÃO DE SEGURANÇA: Verificar se os parâmetros foram copiados corretamente e atualizar se necessário
    const needsUpdate = await this.validateAndUpdatePositionParamsPublic(
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
  async validateAndUpdatePositionParamsPublic(
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

      // Função auxiliar para normalizar símbolo (mesma lógica do trade-parameter.service.ts)
      const normalizeSymbol = (s: string): string => {
        if (!s) return '';
        return s.trim().toUpperCase().replace(/\.(P|F|PERP|FUTURES)$/i, '').replace(/\//g, '').replace(/\s/g, '');
      };
      
      const symbolNorm = normalizeSymbol(symbol);
      
      // Buscar todos os parâmetros da conta para verificar se algum contém o símbolo
      const allBothParameters = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: exchangeAccountId,
          side: 'BOTH',
        },
      });
      
      const allBuyParameters = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: exchangeAccountId,
          side: 'BUY',
        },
      });
      
      const allSellParameters = await this.prisma.tradeParameter.findMany({
        where: {
          exchange_account_id: exchangeAccountId,
          side: 'SELL',
        },
      });
      
      // Função auxiliar para verificar se um parâmetro corresponde ao símbolo
      const parameterMatchesSymbol = (param: any): boolean => {
        if (!param.symbol) return false;
        
        // Se o parâmetro tem múltiplos símbolos separados por vírgula
        if (param.symbol.includes(',')) {
          const symbolList = param.symbol.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          return symbolList.some((s: string) => normalizeSymbol(s) === symbolNorm);
        } else {
          // Símbolo único
          return normalizeSymbol(param.symbol) === symbolNorm;
        }
      };
      
      // Buscar parâmetros que correspondem ao símbolo
      const bothParameter = allBothParameters.find(parameterMatchesSymbol);
      const buyParameter = allBuyParameters.find(parameterMatchesSymbol);
      const sellParameter = allSellParameters.find(parameterMatchesSymbol);
      
      if (bothParameter) {
        console.log(`[POSITION-SERVICE] Parâmetro BOTH encontrado para validação (ID: ${bothParameter.id}, symbol: ${bothParameter.symbol})`);
      }
      if (buyParameter) {
        console.log(`[POSITION-SERVICE] Parâmetro BUY encontrado para validação (ID: ${buyParameter.id}, symbol: ${buyParameter.symbol})`);
      }
      if (sellParameter) {
        console.log(`[POSITION-SERVICE] Parâmetro SELL encontrado para validação (ID: ${sellParameter.id}, symbol: ${sellParameter.symbol})`);
      }

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
    origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING',
    feeAmount?: number,
    feeCurrency?: string
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

    // Calcular taxa em USD para a venda
    let feeUsd = 0;
    if (feeAmount && feeAmount > 0 && feeCurrency) {
      const quoteAsset = job.symbol.split('/')[1] || 'USDT';
      if (feeCurrency === 'USDT' || feeCurrency === 'USD' || feeCurrency === quoteAsset) {
        // Taxa já está em USD ou em quote asset
        feeUsd = feeAmount;
      } else if (feeCurrency === job.symbol.split('/')[0]) {
        // Taxa em base asset, converter usando preço de venda
        feeUsd = feeAmount * avgPrice;
      } else {
        // Outra moeda, usar aproximação
        feeUsd = feeAmount;
        console.warn(`[POSITION-SERVICE] Taxa em moeda desconhecida ${feeCurrency}, usando valor direto`);
      }
    }

    // Proporção da taxa para cada posição (baseado na quantidade vendida)
    const totalQtySold = executedQty;
    let remainingToSell = executedQty;
    let totalFeeDistributed = 0;

    for (const position of eligiblePositions) {
      if (remainingToSell <= 0) break;

      const qtyToClose = Math.min(position.qty_remaining.toNumber(), remainingToSell);
      
      // Calcular proporção da taxa para esta posição
      const feeProportion = totalQtySold > 0 ? (qtyToClose / totalQtySold) : 0;
      const positionFeeUsd = feeUsd * feeProportion;
      totalFeeDistributed += positionFeeUsd;
      
      // Calcular lucro descontando a taxa proporcional
      const grossProfitUsd = (avgPrice - position.price_open.toNumber()) * qtyToClose;
      const profitUsd = grossProfitUsd - positionFeeUsd;

      const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
      const existingRealizedProfit = position.realized_profit_usd.toNumber();
      const existingFeesOnSell = position.fees_on_sell_usd.toNumber();
      const existingTotalFees = position.total_fees_paid_usd.toNumber();
      const newRealizedProfit = existingRealizedProfit + profitUsd;

      await this.prisma.tradePosition.update({
        where: { id: position.id },
        data: {
          qty_remaining: newQtyRemaining,
          realized_profit_usd: newRealizedProfit,
          fees_on_sell_usd: existingFeesOnSell + positionFeeUsd,
          total_fees_paid_usd: existingTotalFees + positionFeeUsd,
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

  /**
   * Valida se as posições podem ser agrupadas
   * @param positionIds Array de IDs das posições a agrupar
   * @returns Resultado da validação com posições válidas e erros
   */
  async validatePositionsForGrouping(positionIds: number[]): Promise<{ valid: boolean; errors: string[]; positions: any[] }> {
    const errors: string[] = [];
    
    // Validar mínimo de 2 posições
    if (positionIds.length < 2) {
      errors.push('É necessário selecionar pelo menos 2 posições para agrupar');
      return { valid: false, errors, positions: [] };
    }

    // Buscar todas as posições com seus exchange_accounts
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        id: { in: positionIds },
      },
      include: {
        exchange_account: {
          select: {
            id: true,
            user_id: true,
          },
        },
      },
    });

    // Verificar se todas as posições foram encontradas
    if (positions.length !== positionIds.length) {
      const foundIds = positions.map(p => p.id);
      const missingIds = positionIds.filter(id => !foundIds.includes(id));
      errors.push(`Posições não encontradas: ${missingIds.join(', ')}`);
      return { valid: false, errors, positions: [] };
    }

    // Validar que todas pertencem ao mesmo usuário
    const userIds = new Set(positions.map(p => p.exchange_account.user_id));
    if (userIds.size > 1) {
      errors.push('Todas as posições devem pertencer ao mesmo usuário');
    }

    // Validar mesmo exchange_account_id
    const accountIds = new Set(positions.map(p => p.exchange_account_id));
    if (accountIds.size > 1) {
      errors.push('Todas as posições devem pertencer à mesma conta de exchange');
    }

    // Validar mesmo trade_mode
    const tradeModes = new Set(positions.map(p => p.trade_mode));
    if (tradeModes.size > 1) {
      errors.push('Todas as posições devem ter o mesmo modo de trading (REAL ou SIMULATION)');
    }

    // Validar mesmo symbol
    const symbols = new Set(positions.map(p => p.symbol));
    if (symbols.size > 1) {
      errors.push('Todas as posições devem ser do mesmo símbolo');
    }

    // Validar status OPEN
    const closedPositions = positions.filter(p => p.status !== PositionStatus.OPEN);
    if (closedPositions.length > 0) {
      errors.push(`Posições fechadas não podem ser agrupadas: ${closedPositions.map(p => p.id).join(', ')}`);
    }

    // Validar qty_remaining > 0
    const zeroQtyPositions = positions.filter(p => p.qty_remaining.toNumber() <= 0);
    if (zeroQtyPositions.length > 0) {
      errors.push(`Posições com quantidade restante zero não podem ser agrupadas: ${zeroQtyPositions.map(p => p.id).join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      positions: positions.map(p => ({
        ...p,
        qty_total: p.qty_total.toNumber(),
        qty_remaining: p.qty_remaining.toNumber(),
        price_open: p.price_open.toNumber(),
      })),
    };
  }

  /**
   * Calcula preview do agrupamento sem persistir
   * @param positionIds Array de IDs das posições a agrupar
   * @returns Preview do agrupamento
   */
  async calculateGroupPreview(positionIds: number[]): Promise<any> {
    // Validar posições
    const validation = await this.validatePositionsForGrouping(positionIds);
    if (!validation.valid) {
      throw new Error(`Validação falhou: ${validation.errors.join('; ')}`);
    }

    const positions = validation.positions;

    // Identificar posição base
    // Prioridade: posição já agrupada > posição mais antiga
    const groupedPositions = positions.filter(p => p.is_grouped);
    let basePosition: any;
    
    if (groupedPositions.length > 0) {
      // Se houver posições agrupadas, usar a mais antiga entre elas
      basePosition = groupedPositions.reduce((oldest, current) => {
        const oldestDate = oldest.group_started_at || oldest.created_at;
        const currentDate = current.group_started_at || current.created_at;
        return new Date(oldestDate) < new Date(currentDate) ? oldest : current;
      });
    } else {
      // Se não houver posições agrupadas, usar a mais antiga
      basePosition = positions.reduce((oldest, current) => {
        return new Date(oldest.created_at) < new Date(current.created_at) ? oldest : current;
      });
    }

    // Calcular totais
    let totalQty = 0;
    let totalQtyRemaining = 0;
    let totalCost = 0;
    let oldestDate = new Date(basePosition.created_at);

    positions.forEach(position => {
      totalQty += position.qty_total;
      totalQtyRemaining += position.qty_remaining;
      totalCost += position.qty_total * position.price_open;
      
      const posDate = position.group_started_at 
        ? new Date(position.group_started_at) 
        : new Date(position.created_at);
      if (posDate < oldestDate) {
        oldestDate = posDate;
      }
    });

    // Calcular custo médio ponderado
    const weightedAvgPrice = totalQty > 0 ? totalCost / totalQty : 0;

    return {
      positions: positions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        qty_total: p.qty_total,
        qty_remaining: p.qty_remaining,
        price_open: p.price_open,
        is_grouped: p.is_grouped,
        created_at: p.created_at,
      })),
      base_position_id: basePosition.id,
      total_qty: totalQty,
      total_qty_remaining: totalQtyRemaining,
      weighted_avg_price: weightedAvgPrice,
      total_invested: totalCost,
      group_started_at: oldestDate.toISOString(),
    };
  }

  /**
   * Agrupa múltiplas posições em uma única posição
   * @param positionIds Array de IDs das posições a agrupar
   * @returns ID da posição agrupada resultante
   */
  async groupPositions(positionIds: number[]): Promise<number> {
    return await this.prisma.$transaction(async (tx) => {
      // Validar posições novamente (pode ter mudado desde o preview)
      const validation = await this.validatePositionsForGrouping(positionIds);
      if (!validation.valid) {
        throw new Error(`Validação falhou: ${validation.errors.join('; ')}`);
      }

      // Buscar posições completas com relacionamentos
      const positions = await tx.tradePosition.findMany({
        where: {
          id: { in: positionIds },
        },
        include: {
          exchange_account: {
            select: {
              user_id: true,
            },
          },
        },
      });

      // Identificar posição base
      const groupedPositions = positions.filter(p => p.is_grouped);
      let basePosition: any;
      
      if (groupedPositions.length > 0) {
        basePosition = groupedPositions.reduce((oldest, current) => {
          const oldestDate = oldest.group_started_at || oldest.created_at;
          const currentDate = current.group_started_at || current.created_at;
          return new Date(oldestDate) < new Date(currentDate) ? oldest : current;
        });
      } else {
        basePosition = positions.reduce((oldest, current) => {
          return new Date(oldest.created_at) < new Date(current.created_at) ? oldest : current;
        });
      }

      // Calcular novos valores
      let totalQty = 0;
      let totalQtyRemaining = 0;
      let totalCost = 0;
      let oldestDate = new Date(basePosition.created_at);

      positions.forEach(position => {
        const qtyTotal = position.qty_total.toNumber();
        const qtyRemaining = position.qty_remaining.toNumber();
        const priceOpen = position.price_open.toNumber();
        
        totalQty += qtyTotal;
        totalQtyRemaining += qtyRemaining;
        totalCost += qtyTotal * priceOpen;
        
        const posDate = position.group_started_at 
          ? new Date(position.group_started_at) 
          : new Date(position.created_at);
        if (posDate < oldestDate) {
          oldestDate = posDate;
        }
      });

      const weightedAvgPrice = totalQty > 0 ? totalCost / totalQty : 0;

      // Identificar posições que serão deletadas (todas exceto base)
      const positionsToDelete = positions.filter(p => p.id !== basePosition.id);
      const positionsToDeleteIds = positionsToDelete.map(p => p.id);

      // Mover PositionFill das posições agrupadas para a base
      if (positionsToDeleteIds.length > 0) {
        await tx.positionFill.updateMany({
          where: {
            position_id: { in: positionsToDeleteIds },
          },
          data: {
            position_id: basePosition.id,
          },
        });
      }

      // Criar PositionGroupedJob para cada posição agrupada (incluindo base)
      // Primeiro, criar para as posições que serão deletadas
      for (const position of positionsToDelete) {
        // Verificar se já existe para evitar duplicatas
        const existing = await tx.positionGroupedJob.findFirst({
          where: {
            position_id: basePosition.id,
            trade_job_id: position.trade_job_id_open,
          },
        });
        
        if (!existing) {
          await tx.positionGroupedJob.create({
            data: {
              position_id: basePosition.id,
              trade_job_id: position.trade_job_id_open,
            },
          });
          console.log(`[POSITION-SERVICE] ✅ Criado PositionGroupedJob para posição deletada: job ${position.trade_job_id_open}`);
        }
      }
      
      // Também criar PositionGroupedJob para o job da posição base (se ainda não existir)
      if (basePosition.trade_job_id_open) {
        const existingBaseGroupedJob = await tx.positionGroupedJob.findFirst({
          where: {
            position_id: basePosition.id,
            trade_job_id: basePosition.trade_job_id_open,
          },
        });
        
        if (!existingBaseGroupedJob) {
          await tx.positionGroupedJob.create({
            data: {
              position_id: basePosition.id,
              trade_job_id: basePosition.trade_job_id_open,
            },
          });
          console.log(`[POSITION-SERVICE] ✅ Criado PositionGroupedJob para posição base: job ${basePosition.trade_job_id_open}`);
        }
      }

      // Atualizar posição base
      const updatedPosition = await tx.tradePosition.update({
        where: { id: basePosition.id },
        data: {
          qty_total: totalQty,
          qty_remaining: totalQtyRemaining,
          price_open: weightedAvgPrice,
          is_grouped: true,
          group_started_at: oldestDate,
        },
      });

      // Deletar posições agrupadas
      if (positionsToDeleteIds.length > 0) {
        const deleteResult = await tx.tradePosition.deleteMany({
          where: {
            id: { in: positionsToDeleteIds },
          },
        });
        
        console.log(`[POSITION-SERVICE] 🗑️ Deletando ${positionsToDeleteIds.length} posição(ões) agrupada(s): IDs ${positionsToDeleteIds.join(', ')}`);
        console.log(`[POSITION-SERVICE]   - Resultado: ${deleteResult.count} posição(ões) deletada(s)`);
        
        if (deleteResult.count !== positionsToDeleteIds.length) {
          console.warn(`[POSITION-SERVICE] ⚠️ Aviso: Esperado deletar ${positionsToDeleteIds.length} posições, mas apenas ${deleteResult.count} foram deletadas`);
        }
      }

      console.log(`[POSITION-SERVICE] ✅ Posições agrupadas: ${positionsToDeleteIds.length} posição(ões) agrupada(s) na posição base ${basePosition.id}`);
      console.log(`[POSITION-SERVICE]   - Qty total: ${totalQty}, Qty restante: ${totalQtyRemaining}, Preço médio: ${weightedAvgPrice.toFixed(8)}`);

      return updatedPosition.id;
    });
  }

  /**
   * Limpa posições órfãs de agrupamento
   * Busca posições que têm PositionGroupedJob mas não deveriam existir mais
   * ou posições que foram agrupadas mas não foram deletadas corretamente
   * @returns Estatísticas da limpeza
   */
  async cleanupOrphanedGroupedPositions(): Promise<{
    checked: number;
    deleted: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let checked = 0;
    let deleted = 0;

    try {
      // Buscar todas as posições agrupadas que têm PositionGroupedJob
      const groupedPositions = await this.prisma.tradePosition.findMany({
        where: {
          is_grouped: true,
          status: PositionStatus.OPEN,
        },
        include: {
          grouped_jobs: {
            select: {
              trade_job_id: true,
            },
          },
        },
      });

      checked = groupedPositions.length;

      for (const groupedPosition of groupedPositions) {
        try {
          // Buscar posições que têm trade_job_id_open que está em grouped_jobs desta posição
          const groupedJobIds = groupedPosition.grouped_jobs.map(gj => gj.trade_job_id);
          
          if (groupedJobIds.length > 0) {
            // Buscar posições que têm esses trade_job_id_open e não são a posição agrupada
            const orphanedPositions = await this.prisma.tradePosition.findMany({
              where: {
                trade_job_id_open: { in: groupedJobIds },
                id: { not: groupedPosition.id },
                status: PositionStatus.OPEN,
              },
            });

            // Deletar posições órfãs encontradas
            if (orphanedPositions.length > 0) {
              const orphanedIds = orphanedPositions.map(p => p.id);
              
              // Mover PositionFill para a posição agrupada
              await this.prisma.positionFill.updateMany({
                where: {
                  position_id: { in: orphanedIds },
                },
                data: {
                  position_id: groupedPosition.id,
                },
              });

              // Deletar posições órfãs
              await this.prisma.tradePosition.deleteMany({
                where: {
                  id: { in: orphanedIds },
                },
              });

              deleted += orphanedPositions.length;
              console.log(
                `[POSITION-SERVICE] ✅ Limpeza: ${orphanedPositions.length} posição(ões) órfã(s) deletada(s) relacionada(s) à posição agrupada ${groupedPosition.id}`
              );
            }
          }
        } catch (error: any) {
          const errorMsg = `Erro ao limpar posições órfãs da posição ${groupedPosition.id}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
        }
      }

      console.log(
        `[POSITION-SERVICE] ✅ Limpeza concluída: ${checked} posição(ões) agrupada(s) verificada(s), ${deleted} posição(ões) órfã(s) deletada(s)`
      );
    } catch (error: any) {
      const errorMsg = `Erro geral na limpeza de posições órfãs: ${error.message}`;
      errors.push(errorMsg);
      console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
    }

    return { checked, deleted, errors };
  }

  /**
   * Verifica se uma posição agrupada está aberta para novas ordens (dentro do intervalo de tempo)
   * @param position Posição com campos is_grouped, group_started_at e created_at
   * @param parameter Parâmetro de trade com group_positions_enabled e group_positions_interval_minutes
   * @returns true se está aberta, false se está fechada, null se não aplicável
   */
  isGroupingOpen(
    position: { 
      is_grouped: boolean; 
      group_started_at: Date | null; 
      created_at: Date 
    },
    parameter: { 
      group_positions_enabled: boolean; 
      group_positions_interval_minutes: number | null 
    } | null
  ): boolean | null {
    // Se a posição não está agrupada, não aplicável
    if (!position.is_grouped) {
      return null;
    }

    // Se não há parâmetro ou agrupamento não está habilitado, não aplicável
    if (!parameter || !parameter.group_positions_enabled || !parameter.group_positions_interval_minutes) {
      return null;
    }

    // Calcular data de início do agrupamento
    const startDate = position.group_started_at || position.created_at;
    
    // Calcular data limite (início + intervalo)
    const intervalEnd = new Date(startDate);
    intervalEnd.setMinutes(intervalEnd.getMinutes() + parameter.group_positions_interval_minutes);
    
    // Verificar se ainda está dentro do intervalo
    const now = new Date();
    return now < intervalEnd;
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

