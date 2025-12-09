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
    // Usar transação para garantir atomicidade e evitar race conditions
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.tradeJob.findUnique({
        where: { id: jobId },
        include: { exchange_account: true },
      });

      if (!job || job.side !== 'SELL') {
        throw new Error('Invalid sell job');
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

      // Se o job tem position_id_to_close, fechar apenas essa posição específica
      // Caso contrário, usar FIFO como antes
      let eligiblePositions: any[] = [];

      if (job.position_id_to_close) {
        // Buscar a posição específica vinculada ao job
        const targetPosition = await tx.tradePosition.findUnique({
          where: { id: job.position_id_to_close },
        });

        if (!targetPosition) {
          await tx.tradeJob.update({
            where: { id: jobId },
            data: {
              status: 'SKIPPED',
              reason_code: 'POSITION_NOT_FOUND',
              reason_message: `Position ${job.position_id_to_close} not found`,
            },
          });
          return;
        }

        // Validar se a posição é elegível
        if (
          targetPosition.exchange_account_id !== job.exchange_account_id ||
          targetPosition.trade_mode !== job.trade_mode ||
          targetPosition.symbol !== job.symbol ||
          targetPosition.side !== 'LONG' ||
          targetPosition.status !== PositionStatus.OPEN ||
          targetPosition.qty_remaining.toNumber() <= 0
        ) {
          await tx.tradeJob.update({
            where: { id: jobId },
            data: {
              status: 'SKIPPED',
              reason_code: 'POSITION_NOT_ELIGIBLE',
              reason_message: `Position ${job.position_id_to_close} is not eligible for closing`,
            },
          });
          return;
        }

        // Verificar lock para webhook
        if (origin === 'WEBHOOK' && targetPosition.lock_sell_by_webhook) {
          await tx.tradeJob.update({
            where: { id: jobId },
            data: {
              status: 'SKIPPED',
              reason_code: 'WEBHOOK_LOCK',
              reason_message: 'Position is locked for webhook sells',
            },
          });
          return;
        }

        // Se a posição é agrupada, verificar se há outras posições relacionadas
        // Para posições agrupadas, fechar apenas a posição agrupada (que já contém todas as quantidades)
        eligiblePositions = [targetPosition];
      } else {
        // Quando não tem position_id_to_close, buscar posição com quantidade exata primeiro
        // Isso evita fragmentar posições desnecessariamente
        const baseWhereConditions: any = {
          exchange_account_id: job.exchange_account_id,
          trade_mode: job.trade_mode,
          symbol: job.symbol,
          side: 'LONG',
          status: PositionStatus.OPEN,
        };

        if (origin === 'WEBHOOK') {
          baseWhereConditions.lock_sell_by_webhook = false;
        }

        // Primeiro tentar encontrar posição com quantidade exata
        const exactMatch = await tx.tradePosition.findFirst({
          where: {
            ...baseWhereConditions,
            qty_remaining: executedQty, // Quantidade exata
          },
          orderBy: { created_at: 'asc' },
        });

        if (exactMatch) {
          // Encontrou posição com quantidade exata, usar apenas ela
          eligiblePositions = [exactMatch];
          console.log(`[POSITION-SERVICE] Encontrada posição com quantidade exata: ID=${exactMatch.id}, qty=${executedQty}`);
        } else {
          // Se não encontrou quantidade exata, usar FIFO como fallback
          console.log(`[POSITION-SERVICE] Nenhuma posição com quantidade exata (${executedQty}), usando FIFO...`);
          eligiblePositions = await tx.tradePosition.findMany({
            where: {
              ...baseWhereConditions,
              qty_remaining: { gt: 0 },
            },
            orderBy: { created_at: 'asc' },
          });

          if (eligiblePositions.length === 0) {
            await tx.tradeJob.update({
              where: { id: jobId },
              data: {
                status: 'SKIPPED',
                reason_code: origin === 'WEBHOOK' ? 'WEBHOOK_LOCK' : 'NO_ELIGIBLE_POSITIONS',
                reason_message: 'No eligible positions found',
              },
            });
            return;
          }
        }
      }

      // Proporção da taxa para cada posição (baseado na quantidade vendida)
      const totalQtySold = executedQty;
      let remainingToSell = executedQty;
      let totalFeeDistributed = 0;

      for (const position of eligiblePositions) {
        if (remainingToSell <= 0) break;

        // Re-buscar posição dentro da transação para garantir dados atualizados
        const currentPosition = await tx.tradePosition.findUnique({
          where: { id: position.id },
        });

        if (!currentPosition || currentPosition.status !== PositionStatus.OPEN || currentPosition.qty_remaining.toNumber() <= 0) {
          console.warn(`[POSITION-SERVICE] Posição ${position.id} não está mais disponível, pulando...`);
          continue;
        }

        const qtyToClose = Math.min(currentPosition.qty_remaining.toNumber(), remainingToSell);
        
        // Calcular proporção da taxa para esta posição
        const feeProportion = totalQtySold > 0 ? (qtyToClose / totalQtySold) : 0;
        const positionFeeUsd = feeUsd * feeProportion;
        totalFeeDistributed += positionFeeUsd;
        
        // Calcular lucro descontando a taxa proporcional
        const grossProfitUsd = (avgPrice - currentPosition.price_open.toNumber()) * qtyToClose;
        const profitUsd = grossProfitUsd - positionFeeUsd;

        const newQtyRemaining = currentPosition.qty_remaining.toNumber() - qtyToClose;
        const existingRealizedProfit = currentPosition.realized_profit_usd.toNumber();
        const existingFeesOnSell = currentPosition.fees_on_sell_usd.toNumber();
        const existingTotalFees = currentPosition.total_fees_paid_usd.toNumber();
        const newRealizedProfit = existingRealizedProfit + profitUsd;

        await tx.tradePosition.update({
          where: { id: currentPosition.id },
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
        await tx.positionFill.create({
          data: {
            position_id: currentPosition.id,
            trade_execution_id: executionId,
            side: 'SELL',
            qty: qtyToClose,
            price: avgPrice,
          },
        });

        remainingToSell -= qtyToClose;
      }

      // Update job status based on remaining quantity
      if (remainingToSell > 0) {
        // Partial execution - update job
        await tx.tradeJob.update({
          where: { id: jobId },
          data: {
            status: 'PARTIALLY_FILLED',
            reason_message: `Only ${executedQty - remainingToSell} executed, ${remainingToSell} remaining`,
          },
        });
      } else {
        // All quantity was sold - mark as FILLED
        await tx.tradeJob.update({
          where: { id: jobId },
          data: {
            status: 'FILLED',
            reason_code: null,
            reason_message: null,
          },
        });
      }
    });
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
      positionIdToClose: positionId, // Vincular posição específica
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
      positionIdToClose: positionId, // Vincular posição específica
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

      // Determinar se a posição agrupada será dust ou não
      // Se todas são dust: manter is_dust = true
      // Se misturado: is_dust = false (posição normal com resíduo incorporado)
      const allAreDust = positions.every(p => p.is_dust === true);
      const finalIsDust = allAreDust;

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
          is_dust: finalIsDust,
          // Se agrupando resíduos, recalcular dust_value_usd
          ...(finalIsDust ? {
            dust_value_usd: totalQtyRemaining * weightedAvgPrice, // Aproximação, será atualizado quando buscar preço real
          } : {}),
        },
      });

      // VALIDAÇÃO FINAL: Verificar se todos os jobs foram adicionados ao PositionGroupedJob
      const allJobIds = positions
        .map(p => p.trade_job_id_open)
        .filter((id): id is number => id !== null);
      
      const groupedJobs = await tx.positionGroupedJob.findMany({
        where: {
          position_id: updatedPosition.id,
          trade_job_id: { in: allJobIds },
        },
        select: { trade_job_id: true },
      });
      
      const groupedJobIds = new Set(groupedJobs.map(gj => gj.trade_job_id));
      const missingJobIds = allJobIds.filter(jobId => !groupedJobIds.has(jobId));
      
      if (missingJobIds.length > 0) {
        console.warn(`[POSITION-SERVICE] ⚠️ Aviso: ${missingJobIds.length} job(s) não foram adicionados ao PositionGroupedJob: ${missingJobIds.join(', ')}`);
        // Criar os que estão faltando
        for (const jobId of missingJobIds) {
          try {
            await tx.positionGroupedJob.create({
              data: {
                position_id: updatedPosition.id,
                trade_job_id: jobId,
              },
            });
            console.log(`[POSITION-SERVICE] ✅ Criado PositionGroupedJob faltante para job ${jobId}`);
          } catch (error: any) {
            console.error(`[POSITION-SERVICE] ❌ Erro ao criar PositionGroupedJob para job ${jobId}: ${error.message}`);
            throw new Error(`Falha ao criar PositionGroupedJob para job ${jobId}: ${error.message}`);
          }
        }
      }

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

      // Verificação final de integridade: garantir que não há posições órfãs
      const orphanedPositions = await tx.tradePosition.findMany({
        where: {
          trade_job_id_open: { in: allJobIds },
          id: { not: updatedPosition.id },
          status: PositionStatus.OPEN,
        },
      });

      if (orphanedPositions.length > 0) {
        const orphanedIds = orphanedPositions.map(p => p.id);
        console.warn(`[POSITION-SERVICE] ⚠️ Aviso: Encontradas ${orphanedPositions.length} posição(ões) órfã(s) após agrupamento: IDs ${orphanedIds.join(', ')}`);
        // Mover fills e deletar posições órfãs
        for (const orphaned of orphanedPositions) {
          await tx.positionFill.updateMany({
            where: { position_id: orphaned.id },
            data: { position_id: updatedPosition.id },
          });
          await tx.tradePosition.delete({ where: { id: orphaned.id } });
          console.log(`[POSITION-SERVICE] ✅ Posição órfã ${orphaned.id} removida e fills movidos para posição agrupada`);
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
   * Também verifica posições CLOSED e jobs órfãos
   * Primeiro corrige PositionGroupedJob faltantes baseado nos fills
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
      // PRIMEIRO: Corrigir PositionGroupedJob faltantes baseado nos fills
      // Isso garante que todos os jobs dos fills estejam em PositionGroupedJob
      console.log(`[POSITION-SERVICE] 🔧 Corrigindo PositionGroupedJob faltantes baseado em fills...`);
      const fixResult = await this.fixMissingGroupedJobsFromFills();
      console.log(
        `[POSITION-SERVICE] ✅ Correção de PositionGroupedJob: ${fixResult.checked} posição(ões) verificada(s), ${fixResult.added} job(s) adicionado(s), ${fixResult.orphanedRemoved} posição(ões) órfã(s) removida(s)`
      );
      deleted += fixResult.orphanedRemoved;
      errors.push(...fixResult.errors);
      // Buscar todas as posições agrupadas que têm PositionGroupedJob (OPEN e CLOSED)
      const groupedPositions = await this.prisma.tradePosition.findMany({
        where: {
          is_grouped: true,
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
            // Verificar tanto OPEN quanto CLOSED para garantir limpeza completa
            // IMPORTANTE: Isso identifica posições que foram recriadas pelo sync mas não deveriam existir
            // Exemplo: posição #211 foi recriada, mas o job #499 está em PositionGroupedJob da posição #195
            const orphanedPositions = await this.prisma.tradePosition.findMany({
              where: {
                trade_job_id_open: { in: groupedJobIds },
                id: { not: groupedPosition.id },
              },
            });
            
            // Também verificar posições que foram recriadas mas o job não está mais apontando para elas
            // (position_open é null ou apontando para outra posição, mas o job está agrupado)
            const jobsWithNullPosition = await this.prisma.tradeJob.findMany({
              where: {
                id: { in: groupedJobIds },
                position_open: null,
              },
            });
            
            // Se há jobs com position_open null, verificar se há posições órfãs que foram criadas
            // mas não estão sendo referenciadas pelo job (isso pode acontecer em casos de race condition)
            if (jobsWithNullPosition.length > 0) {
              const jobsWithNullPositionIds = jobsWithNullPosition.map(j => j.id);
              const additionalOrphanedPositions = await this.prisma.tradePosition.findMany({
                where: {
                  trade_job_id_open: { in: jobsWithNullPositionIds },
                  id: { not: groupedPosition.id },
                },
              });
              
              // Adicionar às posições órfãs encontradas
              if (additionalOrphanedPositions.length > 0) {
                orphanedPositions.push(...additionalOrphanedPositions);
                console.log(
                  `[POSITION-SERVICE] 🔍 Encontradas ${additionalOrphanedPositions.length} posição(ões) órfã(s) adicional(is) recriada(s) para jobs com position_open null`
                );
              }
            }

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
                `[POSITION-SERVICE] ✅ Limpeza: ${orphanedPositions.length} posição(ões) órfã(s) deletada(s) relacionada(s) à posição agrupada ${groupedPosition.id} (status: ${groupedPosition.status})`
              );
            }

            // Verificar jobs órfãos: jobs que estão em PositionGroupedJob desta posição
            // mas têm position_open null ou apontando para outra posição
            const jobsWithIncorrectPosition = await this.prisma.tradeJob.findMany({
              where: {
                id: { in: groupedJobIds },
                OR: [
                  { position_open: null },
                  { position_open: { id: { not: groupedPosition.id } } },
                ],
              },
              include: {
                position_open: {
                  select: { id: true },
                },
              },
            });

            if (jobsWithIncorrectPosition.length > 0) {
              console.log(
                `[POSITION-SERVICE] ⚠️ Encontrados ${jobsWithIncorrectPosition.length} job(s) com position_open incorreto relacionado(s) à posição agrupada ${groupedPosition.id}`
              );
              
              // Corrigir automaticamente: verificar se há posições órfãs que foram recriadas
              for (const job of jobsWithIncorrectPosition) {
                const currentPositionId = job.position_open?.id;
                
                // Se o job tem position_open apontando para outra posição, verificar se é órfã
                if (currentPositionId && currentPositionId !== groupedPosition.id) {
                  const currentPosition = await this.prisma.tradePosition.findUnique({
                    where: { id: currentPositionId },
                    include: {
                      fills: {
                        select: { id: true },
                      },
                    },
                  });

                  if (currentPosition) {
                    // Verificar se esta posição é órfã (não deveria existir porque o job está agrupado)
                    // Verificar se o job não está em outro PositionGroupedJob válido
                    const otherGroupedJobs = await this.prisma.positionGroupedJob.findMany({
                      where: {
                        trade_job_id: job.id,
                        position_id: { not: groupedPosition.id },
                      },
                      include: {
                        position: {
                          select: { id: true, status: true },
                        },
                      },
                    });

                    // Se não há outros PositionGroupedJob válidos, ou se todos apontam para posições CLOSED,
                    // então esta posição atual é órfã e deve ser removida
                    const hasValidOtherGroupedJob = otherGroupedJobs.some(
                      gj => gj.position && gj.position.status === PositionStatus.OPEN
                    );

                    if (!hasValidOtherGroupedJob) {
                      // Esta posição é órfã, mover fills e deletar
                      console.log(
                        `[POSITION-SERVICE] 🔧 Corrigindo: Movendo fills da posição órfã ${currentPositionId} (job ${job.id}) para posição agrupada ${groupedPosition.id}`
                      );
                      
                      await this.prisma.positionFill.updateMany({
                        where: { position_id: currentPositionId },
                        data: { position_id: groupedPosition.id },
                      });

                      await this.prisma.tradePosition.delete({
                        where: { id: currentPositionId },
                      });

                      deleted++;
                      console.log(
                        `[POSITION-SERVICE] ✅ Posição órfã ${currentPositionId} removida e fills movidos para posição agrupada ${groupedPosition.id}`
                      );
                    }
                  }
                }
              }
            }

            // Verificação adicional: Buscar fills da posição agrupada que pertencem a jobs não agrupados
            // Isso identifica casos onde o fill foi movido mas o job não foi adicionado ao PositionGroupedJob
            const fillsWithJobs = await this.prisma.positionFill.findMany({
              where: {
                position_id: groupedPosition.id,
                side: 'BUY',
              },
              include: {
                execution: {
                  include: {
                    trade_job: {
                      select: {
                        id: true,
                        side: true,
                      },
                    },
                  },
                },
              },
            });

            // Coletar job IDs dos fills que não estão em PositionGroupedJob
            const fillsWithMissingJobs: number[] = [];
            for (const fill of fillsWithJobs) {
              if (fill.execution?.trade_job?.id && fill.execution.trade_job.side === 'BUY') {
                const jobId = fill.execution.trade_job.id;
                if (!groupedJobIds.includes(jobId)) {
                  fillsWithMissingJobs.push(jobId);
                }
              }
            }

            // Se há fills de jobs não agrupados, adicionar ao PositionGroupedJob
            if (fillsWithMissingJobs.length > 0) {
              const uniqueMissingJobIds = Array.from(new Set(fillsWithMissingJobs));
              console.log(
                `[POSITION-SERVICE] 🔍 Posição agrupada ${groupedPosition.id}: Encontrados fills de ${uniqueMissingJobIds.length} job(s) não agrupado(s): ${uniqueMissingJobIds.join(', ')}`
              );

              for (const jobId of uniqueMissingJobIds) {
                try {
                  // Verificar se já existe
                  const existing = await this.prisma.positionGroupedJob.findFirst({
                    where: {
                      position_id: groupedPosition.id,
                      trade_job_id: jobId,
                    },
                  });

                  if (!existing) {
                    await this.prisma.positionGroupedJob.create({
                      data: {
                        position_id: groupedPosition.id,
                        trade_job_id: jobId,
                      },
                    });
                    console.log(
                      `[POSITION-SERVICE] ✅ Adicionado PositionGroupedJob baseado em fill: posição ${groupedPosition.id}, job ${jobId}`
                    );
                  }

                  // Verificar se há posição órfã com este job
                  const orphanedPosition = await this.prisma.tradePosition.findFirst({
                    where: {
                      trade_job_id_open: jobId,
                      id: { not: groupedPosition.id },
                      status: PositionStatus.OPEN,
                    },
                  });

                  if (orphanedPosition) {
                    console.log(
                      `[POSITION-SERVICE] 🔧 Identificada posição órfã ${orphanedPosition.id} (job ${jobId}) que tem fill na posição agrupada ${groupedPosition.id}`
                    );

                    // Mover fills restantes para a posição agrupada
                    const orphanedFills = await this.prisma.positionFill.findMany({
                      where: {
                        position_id: orphanedPosition.id,
                      },
                    });

                    if (orphanedFills.length > 0) {
                      await this.prisma.positionFill.updateMany({
                        where: {
                          position_id: orphanedPosition.id,
                        },
                        data: {
                          position_id: groupedPosition.id,
                        },
                      });
                      console.log(
                        `[POSITION-SERVICE] ✅ ${orphanedFills.length} fill(s) movido(s) da posição órfã ${orphanedPosition.id} para posição agrupada ${groupedPosition.id}`
                      );
                    }

                    // Deletar posição órfã
                    await this.prisma.tradePosition.delete({
                      where: { id: orphanedPosition.id },
                    });

                    deleted++;
                    console.log(
                      `[POSITION-SERVICE] ✅ Posição órfã ${orphanedPosition.id} removida`
                    );
                  }
                } catch (error: any) {
                  const errorMsg = `Erro ao processar job ${jobId} dos fills: ${error.message}`;
                  errors.push(errorMsg);
                  console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
                }
              }
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
   * Verifica e corrige inconsistências entre TradeJob.position_open e PositionGroupedJob
   * Garante que se um job está em PositionGroupedJob, ele não deve ter position_open
   * apontando para outra posição ou null quando deveria apontar para a posição agrupada
   * @returns Estatísticas da correção
   */
  async fixJobPositionIntegrity(): Promise<{
    checked: number;
    fixed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let checked = 0;
    let fixed = 0;

    try {
      // Buscar todos os PositionGroupedJob
      const allGroupedJobs = await this.prisma.positionGroupedJob.findMany({
        include: {
          position: {
            select: {
              id: true,
              status: true,
            },
          },
          trade_job: {
            select: {
              id: true,
              position_open: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      checked = allGroupedJobs.length;

      for (const groupedJob of allGroupedJobs) {
        try {
          const job = groupedJob.trade_job;
          const expectedPositionId = groupedJob.position.id;
          const currentPositionId = job.position_open?.id;

          // Se o job tem position_open null ou apontando para outra posição,
          // isso é uma inconsistência que precisa ser corrigida
          if (!currentPositionId || currentPositionId !== expectedPositionId) {
            // Verificar se a posição agrupada ainda existe
            const groupedPosition = await this.prisma.tradePosition.findUnique({
              where: { id: expectedPositionId },
            });

            if (!groupedPosition) {
              // Posição agrupada não existe mais, remover PositionGroupedJob
              await this.prisma.positionGroupedJob.delete({
                where: {
                  id: groupedJob.id,
                },
              });
              console.log(
                `[POSITION-SERVICE] ✅ Removido PositionGroupedJob ${groupedJob.id} (posição agrupada ${expectedPositionId} não existe mais)`
              );
              fixed++;
            } else {
              // Posição agrupada existe, mas o job não está apontando para ela
              // Não podemos corrigir automaticamente porque o relacionamento position_open
              // é gerenciado pelo Prisma através do trade_job_id_open na posição
              // Mas podemos logar para diagnóstico
              console.warn(
                `[POSITION-SERVICE] ⚠️ Inconsistência detectada: Job ${job.id} está em PositionGroupedJob da posição ${expectedPositionId}, mas position_open ${currentPositionId ? `aponta para ${currentPositionId}` : 'é null'}`
              );
              
              // Se há uma posição atual que não é a agrupada, verificar se é órfã
              if (currentPositionId && currentPositionId !== expectedPositionId) {
                const currentPosition = await this.prisma.tradePosition.findUnique({
                  where: { id: currentPositionId },
                  include: {
                    fills: {
                      select: { id: true },
                    },
                  },
                });

                if (currentPosition) {
                  // Verificar se esta posição é órfã (não deveria existir)
                  const otherGroupedJobs = await this.prisma.positionGroupedJob.findMany({
                    where: {
                      trade_job_id: job.id,
                      position_id: { not: expectedPositionId },
                    },
                  });

                  if (otherGroupedJobs.length === 0) {
                    // Esta posição é órfã, mover fills e deletar
                    console.log(
                      `[POSITION-SERVICE] 🔧 Corrigindo: Movendo fills da posição órfã ${currentPositionId} para posição agrupada ${expectedPositionId}`
                    );
                    
                    await this.prisma.positionFill.updateMany({
                      where: { position_id: currentPositionId },
                      data: { position_id: expectedPositionId },
                    });

                    await this.prisma.tradePosition.delete({
                      where: { id: currentPositionId },
                    });

                    fixed++;
                    console.log(
                      `[POSITION-SERVICE] ✅ Posição órfã ${currentPositionId} removida e fills movidos para posição agrupada ${expectedPositionId}`
                    );
                  }
                }
              }
            }
          }
        } catch (error: any) {
          const errorMsg = `Erro ao corrigir integridade do job ${groupedJob.trade_job_id}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
        }
      }

      console.log(
        `[POSITION-SERVICE] ✅ Verificação de integridade concluída: ${checked} PositionGroupedJob(s) verificado(s), ${fixed} inconsistência(s) corrigida(s)`
      );
    } catch (error: any) {
      const errorMsg = `Erro geral na verificação de integridade: ${error.message}`;
      errors.push(errorMsg);
      console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
    }

    return { checked, fixed, errors };
  }

  /**
   * Corrige PositionGroupedJob faltantes baseado nos fills das posições agrupadas
   * Identifica fills de jobs que não estão em PositionGroupedJob e adiciona
   * Também identifica posições órfãs que têm fills na agrupada mas o job não está agrupado
   * @returns Estatísticas da correção
   */
  async fixMissingGroupedJobsFromFills(): Promise<{
    checked: number;
    added: number;
    orphanedRemoved: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let checked = 0;
    let added = 0;
    let orphanedRemoved = 0;

    try {
      // Buscar todas as posições agrupadas
      const groupedPositions = await this.prisma.tradePosition.findMany({
        where: {
          is_grouped: true,
        },
        include: {
          fills: {
            where: {
              side: 'BUY',
            },
            include: {
              execution: {
                include: {
                  trade_job: {
                    select: {
                      id: true,
                      side: true,
                    },
                  },
                },
              },
            },
          },
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
          const existingGroupedJobIds = new Set(
            groupedPosition.grouped_jobs.map(gj => gj.trade_job_id)
          );

          // Coletar todos os job IDs dos fills BUY
          const jobIdsFromFills = new Set<number>();
          for (const fill of groupedPosition.fills) {
            if (fill.execution?.trade_job?.id && fill.execution.trade_job.side === 'BUY') {
              jobIdsFromFills.add(fill.execution.trade_job.id);
            }
          }

          // Verificar quais jobs dos fills não estão em PositionGroupedJob
          const missingJobIds = Array.from(jobIdsFromFills).filter(
            jobId => !existingGroupedJobIds.has(jobId)
          );

          if (missingJobIds.length > 0) {
            console.log(
              `[POSITION-SERVICE] 🔍 Posição agrupada ${groupedPosition.id}: Encontrados ${missingJobIds.length} job(s) faltante(s) nos fills: ${missingJobIds.join(', ')}`
            );

            // Adicionar jobs faltantes ao PositionGroupedJob
            for (const jobId of missingJobIds) {
              try {
                // Verificar se o job existe e é BUY
                const job = await this.prisma.tradeJob.findUnique({
                  where: { id: jobId },
                  select: { id: true, side: true },
                });

                if (!job || job.side !== 'BUY') {
                  console.warn(
                    `[POSITION-SERVICE] ⚠️ Job ${jobId} não encontrado ou não é BUY, pulando`
                  );
                  continue;
                }

                // Verificar se já existe (pode ter sido criado em outra iteração)
                const existing = await this.prisma.positionGroupedJob.findFirst({
                  where: {
                    position_id: groupedPosition.id,
                    trade_job_id: jobId,
                  },
                });

                if (!existing) {
                  await this.prisma.positionGroupedJob.create({
                    data: {
                      position_id: groupedPosition.id,
                      trade_job_id: jobId,
                    },
                  });
                  added++;
                  console.log(
                    `[POSITION-SERVICE] ✅ Adicionado PositionGroupedJob: posição ${groupedPosition.id}, job ${jobId}`
                  );
                }
              } catch (error: any) {
                const errorMsg = `Erro ao adicionar PositionGroupedJob para job ${jobId}: ${error.message}`;
                errors.push(errorMsg);
                console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
              }
            }
          }

          // Identificar posições órfãs que têm fills nesta posição agrupada
          // mas o job não está em PositionGroupedJob (agora já adicionamos, mas pode haver posições órfãs)
          for (const fill of groupedPosition.fills) {
            if (fill.execution?.trade_job?.id && fill.execution.trade_job.side === 'BUY') {
              const jobId = fill.execution.trade_job.id;
              
              // Verificar se há uma posição órfã com este job
              const orphanedPosition = await this.prisma.tradePosition.findFirst({
                where: {
                  trade_job_id_open: jobId,
                  id: { not: groupedPosition.id },
                  status: PositionStatus.OPEN,
                },
              });

              if (orphanedPosition) {
                // Verificar se o job está em PositionGroupedJob (pode ter sido adicionado acima)
                const isJobGrouped = await this.prisma.positionGroupedJob.findFirst({
                  where: {
                    position_id: groupedPosition.id,
                    trade_job_id: jobId,
                  },
                });

                if (isJobGrouped) {
                  // O job está agrupado, então esta posição é órfã e deve ser removida
                  console.log(
                    `[POSITION-SERVICE] 🔧 Identificada posição órfã ${orphanedPosition.id} (job ${jobId}) que tem fill na posição agrupada ${groupedPosition.id}`
                  );

                  // Mover fills restantes para a posição agrupada (se houver)
                  const orphanedFills = await this.prisma.positionFill.findMany({
                    where: {
                      position_id: orphanedPosition.id,
                    },
                  });

                  if (orphanedFills.length > 0) {
                    await this.prisma.positionFill.updateMany({
                      where: {
                        position_id: orphanedPosition.id,
                      },
                      data: {
                        position_id: groupedPosition.id,
                      },
                    });
                    console.log(
                      `[POSITION-SERVICE] ✅ ${orphanedFills.length} fill(s) movido(s) da posição órfã ${orphanedPosition.id} para posição agrupada ${groupedPosition.id}`
                    );
                  }

                  // Deletar posição órfã
                  await this.prisma.tradePosition.delete({
                    where: { id: orphanedPosition.id },
                  });

                  orphanedRemoved++;
                  console.log(
                    `[POSITION-SERVICE] ✅ Posição órfã ${orphanedPosition.id} removida`
                  );
                }
              }
            }
          }
        } catch (error: any) {
          const errorMsg = `Erro ao corrigir PositionGroupedJob da posição ${groupedPosition.id}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
        }
      }

      console.log(
        `[POSITION-SERVICE] ✅ Correção de PositionGroupedJob concluída: ${checked} posição(ões) agrupada(s) verificada(s), ${added} job(s) adicionado(s), ${orphanedRemoved} posição(ões) órfã(s) removida(s)`
      );
    } catch (error: any) {
      const errorMsg = `Erro geral na correção de PositionGroupedJob: ${error.message}`;
      errors.push(errorMsg);
      console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
    }

    return { checked, added, orphanedRemoved, errors };
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

  /**
   * Identifica posições candidatas a resíduo
   * Critérios: qty_remaining < 1% da qty_total E valor < US$ 5.00
   */
  async findDustPositions(): Promise<Array<{
    positionId: number;
    symbol: string;
    exchangeAccountId: number;
    qtyRemaining: number;
    qtyTotal: number;
    percentage: number;
    currentValueUsd: number;
    currentPrice: number;
  }>> {
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        status: PositionStatus.OPEN,
        trade_mode: TradeMode.REAL,
        qty_remaining: { gt: 0 },
        is_dust: false,
      },
      include: {
        exchange_account: {
          select: {
            id: true,
            exchange: true,
            is_simulation: true,
          },
        },
      },
    });

    const dustCandidates: Array<{
      positionId: number;
      symbol: string;
      exchangeAccountId: number;
      qtyRemaining: number;
      qtyTotal: number;
      percentage: number;
      currentValueUsd: number;
      currentPrice: number;
    }> = [];

    const { AdapterFactory } = await import('@mvcashnode/exchange');

    for (const position of positions) {
      // Pular contas de simulação
      if (position.exchange_account.is_simulation) {
        continue;
      }

      const qtyRemaining = position.qty_remaining.toNumber();
      const qtyTotal = position.qty_total.toNumber();
      const percentage = (qtyRemaining / qtyTotal) * 100;

      // Se porcentagem >= 1%, não é resíduo
      if (percentage >= 1) {
        continue;
      }

      try {
        // Buscar preço atual
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );
        const ticker = await adapter.fetchTicker(position.symbol);
        const currentPrice = ticker.last;

        if (!currentPrice || currentPrice <= 0) {
          continue;
        }

        const currentValueUsd = qtyRemaining * currentPrice;

        // Se valor >= US$ 5.00, não é resíduo
        if (currentValueUsd >= 5.00) {
          continue;
        }

        dustCandidates.push({
          positionId: position.id,
          symbol: position.symbol,
          exchangeAccountId: position.exchange_account_id,
          qtyRemaining,
          qtyTotal,
          percentage,
          currentValueUsd,
          currentPrice,
        });
      } catch (error: any) {
        console.warn(`[PositionService] Erro ao buscar preço para posição ${position.id}: ${error.message}`);
        continue;
      }
    }

    return dustCandidates;
  }

  /**
   * Converte uma posição para resíduo
   * Cria nova posição resíduo e fecha a posição original
   */
  async convertToDustPosition(positionId: number): Promise<number> {
    return await this.prisma.$transaction(async (tx) => {
      const originalPosition = await tx.tradePosition.findUnique({
        where: { id: positionId },
        include: {
          exchange_account: true,
          fills: {
            where: { side: 'BUY' },
            orderBy: { created_at: 'asc' },
            take: 1,
          },
        },
      });

      if (!originalPosition || originalPosition.status !== PositionStatus.OPEN) {
        throw new Error('Posição não encontrada ou já fechada');
      }

      if (originalPosition.is_dust) {
        throw new Error('Posição já é um resíduo');
      }

      const qtyRemaining = originalPosition.qty_remaining.toNumber();
      const qtyTotal = originalPosition.qty_total.toNumber();
      const percentage = (qtyRemaining / qtyTotal) * 100;

      if (percentage >= 1) {
        throw new Error('Posição não atende critério de porcentagem (< 1%)');
      }

      // Buscar preço atual para validar valor
      const { AdapterFactory } = await import('@mvcashnode/exchange');
      const adapter = AdapterFactory.createAdapter(
        originalPosition.exchange_account.exchange as ExchangeType
      );
      const ticker = await adapter.fetchTicker(originalPosition.symbol);
      const currentPrice = ticker.last;
      const currentValueUsd = qtyRemaining * currentPrice;

      if (currentValueUsd >= 5.00) {
        throw new Error('Posição não atende critério de valor (< US$ 5.00)');
      }

      // Criar job temporário para a nova posição resíduo (necessário para trade_job_id_open)
      const { TradeJobService } = await import('../trading/trade-job.service');
      const tradeJobService = new TradeJobService(tx as any);
      const dustJob = await tradeJobService.createJob({
        exchangeAccountId: originalPosition.exchange_account_id,
        tradeMode: originalPosition.trade_mode as TradeMode,
        symbol: originalPosition.symbol,
        side: 'BUY',
        orderType: 'MARKET',
        baseQuantity: qtyRemaining,
        skipParameterValidation: true,
      });

      // Criar execução temporária para o fill (necessário para trade_execution_id)
      const dustExecution = await tx.tradeExecution.create({
        data: {
          trade_job_id: dustJob.id,
          exchange_account_id: originalPosition.exchange_account_id,
          trade_mode: originalPosition.trade_mode,
          exchange: originalPosition.exchange_account.exchange,
          exchange_order_id: `DUST-${positionId}-${Date.now()}`,
          client_order_id: `dust-${positionId}-${Date.now()}`,
          status_exchange: 'FILLED',
          executed_qty: qtyRemaining,
          cumm_quote_qty: qtyRemaining * originalPosition.price_open.toNumber(),
          avg_price: originalPosition.price_open,
        },
      });

      // Criar nova posição resíduo
      const dustPosition = await tx.tradePosition.create({
        data: {
          exchange_account_id: originalPosition.exchange_account_id,
          trade_mode: originalPosition.trade_mode,
          symbol: originalPosition.symbol,
          side: originalPosition.side,
          trade_job_id_open: dustJob.id,
          qty_total: qtyRemaining,
          qty_remaining: qtyRemaining,
          price_open: originalPosition.price_open, // Manter preço original para cálculo de PnL
          status: PositionStatus.OPEN,
          is_dust: true,
          dust_value_usd: currentValueUsd,
          original_position_id: positionId,
          is_grouped: false,
          sl_enabled: false,
          tp_enabled: false,
          trailing_enabled: false,
          lock_sell_by_webhook: false,
          realized_profit_usd: 0,
          total_fees_paid_usd: 0,
          fees_on_buy_usd: 0,
          fees_on_sell_usd: 0,
        },
      });

      // Criar fill de BUY na posição resíduo
      await tx.positionFill.create({
        data: {
          position_id: dustPosition.id,
          trade_execution_id: dustExecution.id,
          side: 'BUY',
          qty: qtyRemaining,
          price: originalPosition.price_open,
        },
      });

      // "Fechar" posição original
      await tx.tradePosition.update({
        where: { id: positionId },
        data: {
          status: PositionStatus.CLOSED,
          qty_remaining: 0,
          close_reason: 'CONVERTED_TO_DUST',
          closed_at: new Date(),
        },
      });

      // Criar execução temporária de SELL para o fill da posição original
      const sellExecution = await tx.tradeExecution.create({
        data: {
          trade_job_id: originalPosition.trade_job_id_open, // Usar o job original
          exchange_account_id: originalPosition.exchange_account_id,
          trade_mode: originalPosition.trade_mode,
          exchange: originalPosition.exchange_account.exchange,
          exchange_order_id: `DUST-SELL-${positionId}-${Date.now()}`,
          client_order_id: `dust-sell-${positionId}-${Date.now()}`,
          status_exchange: 'FILLED',
          executed_qty: qtyRemaining,
          cumm_quote_qty: qtyRemaining * currentPrice,
          avg_price: currentPrice,
        },
      });

      // Criar fill de SELL na posição original (simulando venda do resíduo)
      await tx.positionFill.create({
        data: {
          position_id: positionId,
          trade_execution_id: sellExecution.id,
          side: 'SELL',
          qty: qtyRemaining,
          price: currentPrice, // Preço atual para cálculo de PnL
        },
      });

      // Atualizar PnL realizado da posição original
      const profitUsd = (currentPrice - originalPosition.price_open.toNumber()) * qtyRemaining;
      await tx.tradePosition.update({
        where: { id: positionId },
        data: {
          realized_profit_usd: originalPosition.realized_profit_usd.toNumber() + profitUsd,
        },
      });

      return dustPosition.id;
    });
  }

  /**
   * Agrupa resíduos por símbolo e exchange_account_id
   * Retorna grupos que somados atingem >= US$ 5.00
   */
  async getDustPositionsBySymbol(): Promise<Array<{
    symbol: string;
    exchangeAccountId: number;
    exchange: string;
    totalQty: number;
    totalValueUsd: number;
    positionCount: number;
    positionIds: number[];
    canClose: boolean;
  }>> {
    const dustPositions = await this.prisma.tradePosition.findMany({
      where: {
        status: PositionStatus.OPEN,
        is_dust: true,
        qty_remaining: { gt: 0 },
      },
      include: {
        exchange_account: {
          select: {
            id: true,
            exchange: true,
          },
        },
      },
    });

    // Agrupar por símbolo e exchange_account_id
    const groups = new Map<string, {
      symbol: string;
      exchangeAccountId: number;
      exchange: string;
      totalQty: number;
      totalValueUsd: number;
      positionIds: number[];
    }>();

    const { AdapterFactory } = await import('@mvcashnode/exchange');

    for (const position of dustPositions) {
      const key = `${position.exchange_account_id}:${position.symbol}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          symbol: position.symbol,
          exchangeAccountId: position.exchange_account_id,
          exchange: position.exchange_account.exchange,
          totalQty: 0,
          totalValueUsd: 0,
          positionIds: [],
        });
      }

      const group = groups.get(key)!;
      const qtyRemaining = position.qty_remaining.toNumber();
      group.totalQty += qtyRemaining;
      group.positionIds.push(position.id);

      // Buscar preço atual para calcular valor
      try {
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );
        const ticker = await adapter.fetchTicker(position.symbol);
        const currentPrice = ticker.last;
        if (currentPrice && currentPrice > 0) {
          group.totalValueUsd += qtyRemaining * currentPrice;
        } else if (position.dust_value_usd) {
          // Usar valor armazenado se não conseguir buscar preço
          group.totalValueUsd += position.dust_value_usd.toNumber();
        }
      } catch (error: any) {
        // Se não conseguir buscar preço, usar valor armazenado
        if (position.dust_value_usd) {
          group.totalValueUsd += position.dust_value_usd.toNumber();
        }
      }
    }

    // Converter para array e adicionar flag canClose
    return Array.from(groups.values()).map(group => ({
      ...group,
      positionCount: group.positionIds.length,
      canClose: group.totalValueUsd >= 5.00,
    }));
  }

  /**
   * Fecha múltiplas posições resíduo do mesmo símbolo em uma única ordem
   * Valida que valor total >= US$ 5.00
   */
  async closeDustPositions(
    symbol: string,
    exchangeAccountId: number,
    positionIds: number[],
    _skipMinProfit: boolean = true
  ): Promise<{ tradeJobId: number; totalQty: number; totalValueUsd: number }> {
    return await this.prisma.$transaction(async (tx) => {
      // Buscar posições resíduo
      const dustPositions = await tx.tradePosition.findMany({
        where: {
          id: { in: positionIds },
          symbol,
          exchange_account_id: exchangeAccountId,
          status: PositionStatus.OPEN,
          is_dust: true,
          qty_remaining: { gt: 0 },
        },
        include: {
          exchange_account: true,
        },
      });

      if (dustPositions.length === 0) {
        throw new Error('Nenhuma posição resíduo encontrada');
      }

      // Somar quantidades
      let totalQty = 0;
      for (const position of dustPositions) {
        totalQty += position.qty_remaining.toNumber();
      }

      // Buscar preço atual para validar valor mínimo
      const { AdapterFactory } = await import('@mvcashnode/exchange');
      const adapter = AdapterFactory.createAdapter(
        dustPositions[0].exchange_account.exchange as ExchangeType
      );
      const ticker = await adapter.fetchTicker(symbol);
      const currentPrice = ticker.last;
      const totalValueUsd = totalQty * currentPrice;

      // Validar mínimo de US$ 5.00
      if (totalValueUsd < 5.00) {
        throw new Error(`Valor total (US$ ${totalValueUsd.toFixed(2)}) é menor que o mínimo de US$ 5.00`);
      }

      // Criar job de venda
      const { TradeJobService } = await import('../trading/trade-job.service');
      const tradeJobService = new TradeJobService(tx as any);
      const tradeJob = await tradeJobService.createJob({
        exchangeAccountId,
        tradeMode: dustPositions[0].trade_mode as TradeMode,
        symbol,
        side: 'SELL',
        orderType: 'MARKET',
        baseQuantity: totalQty,
        skipParameterValidation: true,
      });

      // Marcar posições resíduo para ignorar validação de lucro mínimo
      // Isso será verificado no executor/processor quando processar a venda
      // Por enquanto, apenas criar o job - a validação será feita no executor

      return {
        tradeJobId: tradeJob.id,
        totalQty,
        totalValueUsd,
      };
    });
  }

  /**
   * Reverter uma execução de venda e corrigir posições fechadas incorretamente
   * Remove os fills de SELL relacionados e recalcula tudo corretamente
   * @param executionId ID da execução de venda a ser revertida
   * @param shouldReprocess Se true, reprocessa a venda com a lógica corrigida (busca quantidade exata primeiro)
   * @returns Estatísticas da correção
   */
  async revertSellExecution(executionId: number, shouldReprocess: boolean = false): Promise<{
    success: boolean;
    positionsFixed: number;
    fillsRemoved: number;
    message: string;
    reprocessed?: boolean;
    errors?: string[];
  }> {
    const errors: string[] = [];
    let positionsFixed = 0;
    let fillsRemoved = 0;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Buscar a execução
        const execution = await tx.tradeExecution.findUnique({
          where: { id: executionId },
          include: {
            trade_job: true,
          },
        });

        if (!execution) {
          throw new Error(`Execução ${executionId} não encontrada`);
        }

        if (execution.trade_job.side !== 'SELL') {
          throw new Error(`Execução ${executionId} não é uma venda (side: ${execution.trade_job.side})`);
        }

        // Buscar todos os fills de SELL relacionados a esta execução
        const sellFills = await tx.positionFill.findMany({
          where: {
            trade_execution_id: executionId,
            side: 'SELL',
          },
          include: {
            position: true,
          },
        });

        if (sellFills.length === 0) {
          return {
            success: true,
            positionsFixed: 0,
            fillsRemoved: 0,
            message: `Nenhum fill de venda encontrado para execução ${executionId}`,
          };
        }

        console.log(`[POSITION-SERVICE] Revertendo execução ${executionId}: ${sellFills.length} fill(s) encontrado(s)`);

        // Para cada fill, reverter as mudanças na posição
        for (const fill of sellFills) {
          try {
            const position = fill.position;
            const qtyClosed = fill.qty.toNumber();
            const sellPrice = fill.price.toNumber();
            const buyPrice = position.price_open.toNumber();

            // Recalcular valores
            const oldQtyRemaining = position.qty_remaining.toNumber();
            const newQtyRemaining = oldQtyRemaining + qtyClosed; // Reverter: adicionar de volta

            // Recalcular PnL: remover o lucro/prejuízo desta venda
            const profitFromThisSale = (sellPrice - buyPrice) * qtyClosed;
            const oldRealizedProfit = position.realized_profit_usd.toNumber();
            const newRealizedProfit = oldRealizedProfit - profitFromThisSale;

            // Buscar taxa paga nesta venda (proporcional)
            // Assumir que a taxa foi distribuída proporcionalmente
            const totalQtySold = execution.executed_qty.toNumber();
            const feeProportion = totalQtySold > 0 ? (qtyClosed / totalQtySold) : 0;
            const executionFee = execution.fee_amount?.toNumber() || 0;
            const positionFeeUsd = executionFee * feeProportion;

            const oldFeesOnSell = position.fees_on_sell_usd.toNumber();
            const newFeesOnSell = Math.max(0, oldFeesOnSell - positionFeeUsd);

            const oldTotalFees = position.total_fees_paid_usd.toNumber();
            const newTotalFees = Math.max(0, oldTotalFees - positionFeeUsd);

            // Atualizar posição
            await tx.tradePosition.update({
              where: { id: position.id },
              data: {
                qty_remaining: newQtyRemaining,
                realized_profit_usd: newRealizedProfit,
                fees_on_sell_usd: newFeesOnSell,
                total_fees_paid_usd: newTotalFees,
                status: newQtyRemaining > 0 ? PositionStatus.OPEN : PositionStatus.CLOSED,
                closed_at: newQtyRemaining > 0 ? null : position.closed_at,
                close_reason: newQtyRemaining > 0 ? null : position.close_reason,
              },
            });

            // Remover o fill
            await tx.positionFill.delete({
              where: { id: fill.id },
            });

            positionsFixed++;
            fillsRemoved++;

            console.log(
              `[POSITION-SERVICE] ✅ Posição ${position.id} revertida: qty_remaining ${oldQtyRemaining} -> ${newQtyRemaining}, ` +
              `realized_profit ${oldRealizedProfit.toFixed(2)} -> ${newRealizedProfit.toFixed(2)}`
            );
          } catch (error: any) {
            const errorMsg = `Erro ao reverter fill ${fill.id} da posição ${fill.position_id}: ${error.message}`;
            errors.push(errorMsg);
            console.error(`[POSITION-SERVICE] ❌ ${errorMsg}`);
          }
        }

        return {
          success: errors.length === 0,
          positionsFixed,
          fillsRemoved,
          message: `Execução ${executionId} revertida: ${positionsFixed} posição(ões) corrigida(s), ${fillsRemoved} fill(s) removido(s)`,
          errors: errors.length > 0 ? errors : undefined,
        };
      }, {
        timeout: 30000, // 30 segundos de timeout
      });

      // Se solicitado e a reversão foi bem-sucedida, reprocessar a venda com a lógica correta
      // Isso deve ser feito FORA da transação, pois onSellExecuted cria sua própria transação
      let reprocessed = false;
      if (shouldReprocess && result.success && result.positionsFixed > 0) {
        try {
          console.log(`[POSITION-SERVICE] Reprocessando venda ${executionId} com lógica corrigida...`);
          
          // Buscar execução novamente para garantir dados atualizados
          const executionAfterRevert = await this.prisma.tradeExecution.findUnique({
            where: { id: executionId },
            include: {
              trade_job: true,
            },
          });

          if (!executionAfterRevert) {
            throw new Error('Execução não encontrada após reversão');
          }

          const executedQty = executionAfterRevert.executed_qty.toNumber();
          const avgPrice = executionAfterRevert.avg_price.toNumber();
          const feeAmount = executionAfterRevert.fee_amount?.toNumber();
          const feeCurrency = executionAfterRevert.fee_currency || undefined;

          // Determinar origin baseado no job
          let origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING' = 'MANUAL';
          const job = executionAfterRevert.trade_job;
          
          if (!job) {
            throw new Error('Job não encontrado na execução');
          }
          
          // Buscar posição relacionada para determinar origin
          const relatedPosition = await this.prisma.tradePosition.findFirst({
            where: {
              exchange_account_id: job.exchange_account_id,
              symbol: job.symbol,
              trade_mode: job.trade_mode,
              status: PositionStatus.OPEN,
            },
          });

          if (relatedPosition) {
            if (relatedPosition.tp_triggered) origin = 'TAKE_PROFIT';
            else if (relatedPosition.sl_triggered) origin = 'STOP_LOSS';
            else if (relatedPosition.trailing_triggered) origin = 'TRAILING';
            else if (job.webhook_event_id) origin = 'WEBHOOK';
          }

          // Reprocessar com a nova lógica (que busca quantidade exata primeiro)
          await this.onSellExecuted(
            job.id,
            executionId,
            executedQty,
            avgPrice,
            origin,
            feeAmount,
            feeCurrency
          );

          reprocessed = true;
          console.log(`[POSITION-SERVICE] ✅ Venda ${executionId} reprocessada com sucesso`);
        } catch (reprocessError: any) {
          console.error(`[POSITION-SERVICE] ❌ Erro ao reprocessar venda ${executionId}: ${reprocessError.message}`);
          // Não falhar a reversão se o reprocessamento falhar
          const currentErrors = result.errors || [];
          currentErrors.push(`Aviso: Reversão concluída, mas reprocessamento falhou: ${reprocessError.message}`);
          result.errors = currentErrors.length > 0 ? currentErrors : undefined;
        }
      }

      return {
        ...result,
        reprocessed,
      };
    } catch (error: any) {
      console.error(`[POSITION-SERVICE] ❌ Erro ao reverter execução ${executionId}: ${error.message}`);
      return {
        success: false,
        positionsFixed,
        fillsRemoved,
        message: `Erro ao reverter execução ${executionId}: ${error.message}`,
        errors: [error.message],
      };
    }
  }

  /**
   * Identificar execuções de venda que podem ter fechado posições incorretamente
   * Busca vendas recentes que fecharam múltiplas posições quando deveriam ter fechado apenas uma
   * @param days Número de dias para buscar (padrão: 7)
   * @returns Lista de execuções suspeitas
   */
  async findSuspiciousSellExecutions(days: number = 7): Promise<Array<{
    executionId: number;
    jobId: number;
    symbol: string;
    executedQty: number;
    positionsAffected: number;
    hasExactMatch: boolean;
    reason: string;
  }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Buscar execuções de venda recentes
    const sellExecutions = await this.prisma.tradeExecution.findMany({
      where: {
        trade_job: {
          side: 'SELL',
          created_at: { gte: cutoffDate },
        },
      },
      include: {
        trade_job: true,
        position_fills: {
          where: { side: 'SELL' },
          include: {
            position: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const suspicious: Array<{
      executionId: number;
      jobId: number;
      symbol: string;
      executedQty: number;
      positionsAffected: number;
      hasExactMatch: boolean;
      reason: string;
    }> = [];

    for (const execution of sellExecutions) {
      const fills = execution.position_fills;
      if (fills.length === 0) continue;

      const executedQty = execution.executed_qty.toNumber();
      const positionsAffected = fills.length;

      // Verificar se alguma posição tinha quantidade exata
      const hasExactMatch = fills.some(
        fill => Math.abs(fill.position.qty_remaining.toNumber() + fill.qty.toNumber() - executedQty) < 0.00000001
      );

      // Se afetou múltiplas posições e não tinha match exato, é suspeito
      if (positionsAffected > 1 && !hasExactMatch) {
        suspicious.push({
          executionId: execution.id,
          jobId: execution.trade_job_id,
          symbol: execution.trade_job.symbol,
          executedQty,
          positionsAffected,
          hasExactMatch: false,
          reason: `Fechou ${positionsAffected} posição(ões) quando deveria ter encontrado uma com quantidade exata (${executedQty})`,
        });
      }
    }

    return suspicious;
  }
}

