import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, CacheService, ExchangeType } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';
import { AdapterFactory } from '@mvcashnode/exchange';
import { EncryptionService } from '@mvcashnode/shared';
import { PositionService } from '@mvcashnode/domain';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSystemController {
  private cacheService: CacheService;

  constructor(
    private adminService: AdminService,
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {
    // Inicializar cache service Redis
    this.cacheService = new CacheService(
      process.env.REDIS_HOST || 'localhost',
      parseInt(process.env.REDIS_PORT || '6379'),
      process.env.REDIS_PASSWORD
    );
    this.cacheService.connect().catch((err) => {
      console.error('[AdminSystemController] Erro ao conectar ao Redis:', err);
    });
  }

  @Get('health')
  @ApiOperation({ 
    summary: 'Health check do sistema',
    description: 'Verifica o status de saúde do sistema, incluindo conectividade com banco de dados. Útil para monitoramento e alertas.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Status do sistema retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
        database: { type: 'string', enum: ['connected', 'disconnected'], example: 'connected' },
        timestamp: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('metrics')
  @ApiOperation({ 
    summary: 'Métricas gerais do sistema',
    description: 'Retorna métricas agregadas do sistema para dashboard administrativo, incluindo contagem de usuários, posições abertas e trades totais.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Métricas retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number', example: 10, description: 'Total de usuários cadastrados' },
        activeUsers: { type: 'number', example: 8, description: 'Usuários ativos' },
        openPositions: { type: 'number', example: 15, description: 'Posições abertas no sistema' },
        totalTrades: { type: 'number', example: 500, description: 'Total de trades executados' },
        timestamp: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  async getMetrics() {
    const [totalUsers, activeUsers, openPositions, totalTrades] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { is_active: true } }),
      this.prisma.tradePosition.count({ where: { status: 'OPEN' } }),
      this.prisma.tradeJob.count(),
    ]);

    return {
      totalUsers,
      activeUsers,
      openPositions,
      totalTrades,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Estatísticas do dashboard admin',
    description: 'Retorna estatísticas agregadas para o dashboard de administração'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas do sistema',
    schema: {
      example: {
        totalUsers: 10,
        activeUsers: 8,
        activeSessions: 5,
        auditEvents: 25,
        uptime: '99.9%',
        recentActivity: [],
        alerts: []
      }
    }
  })
  async getStats() {
    const startTime = Date.now();
    
    // Verificar cache primeiro (TTL: 1 minuto)
    const cacheKey = 'admin:stats';
    const cachedStats = await this.cacheService.get<any>(cacheKey);
    if (cachedStats) {
      return cachedStats;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      totalUsers,
      activeUsers,
      activeSessions,
      auditEventsToday,
      recentAuditLogs,
      systemAlerts,
      openPositions,
      totalTrades
    ] = await Promise.all([
      // Total de usuários
      this.prisma.user.count(),
      // Usuários ativos
      this.prisma.user.count({ where: { is_active: true } }),
      // Sessões ativas (logins nas últimas 24h)
      this.prisma.loginHistory.count({
        where: {
          success: true,
          created_at: { gte: yesterday }
        }
      }),
      // Eventos de auditoria de hoje
      this.prisma.auditLog.count({
        where: {
          created_at: { gte: today }
        }
      }),
      // Atividade recente (últimos 10 eventos)
      this.prisma.auditLog.findMany({
        take: 10,
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: { email: true }
          }
        }
      }),
      // Alertas do sistema (não resolvidos)
      this.prisma.systemAlert.findMany({
        where: {
          resolved_at: null
        },
        orderBy: { created_at: 'desc' },
        take: 5
      }),
      // Posições abertas
      this.prisma.tradePosition.count({ where: { status: 'OPEN' } }),
      // Total de trades
      this.prisma.tradeJob.count()
    ]);

    // Formatar atividade recente
    const recentActivity = recentAuditLogs.map(log => ({
      id: log.id,
      action: `${log.action} ${log.entity_type || ''}`.trim(),
      user: log.user?.email || 'Sistema',
      timestamp: log.created_at,
      entityType: log.entity_type,
      entityId: log.entity_id
    }));

    // Formatar alertas
    const alerts = systemAlerts.map(alert => ({
      id: alert.id,
      level: alert.severity,
      title: alert.alert_type.replace(/_/g, ' '),
      message: alert.message,
      timestamp: alert.created_at
    }));

    const stats = {
      totalUsers,
      activeUsers,
      activeSessions,
      auditEvents: auditEventsToday,
      uptime: '99.9%',
      openPositions,
      totalTrades,
      recentActivity,
      alerts,
      timestamp: new Date().toISOString()
    };

    // Cachear resultado por 1 minuto
    await this.cacheService.set(cacheKey, stats, { ttl: 60 });

    const duration = Date.now() - startTime;
    
    // Log de performance para queries lentas (>1s)
    if (duration > 1000) {
      console.warn(`[AdminSystemController] GET /admin/stats executou em ${duration}ms (LENTO!)`);
    }

    return stats;
  }

  @Post('system/sync-execution-fees')
  @ApiOperation({
    summary: 'Sincronizar taxas de execuções existentes',
    description: 'Busca execuções sem taxas preenchidas e atualiza buscando informações na API da exchange. Recalcula posições afetadas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronização concluída',
    schema: {
      example: {
        total_checked: 100,
        updated: 85,
        errors: 5,
        details: [],
      },
    },
  })
  async syncExecutionFees() {
    console.log('[ADMIN] Iniciando sincronização de taxas de execuções...');
    
    const startTime = Date.now();
    let totalChecked = 0;
    let updated = 0;
    const errors: Array<{ executionId: number; error: string }> = [];

    try {
      // Buscar execuções sem fee_amount preenchido (apenas REAL, com exchange_order_id)
      const executionsWithoutFees = await this.prisma.tradeExecution.findMany({
        where: {
          fee_amount: null,
          trade_mode: 'REAL',
          exchange_order_id: { not: null },
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              exchange: true,
              api_key_enc: true,
              api_secret_enc: true,
              testnet: true,
              fee_rate_buy_limit: true,
              fee_rate_buy_market: true,
              fee_rate_sell_limit: true,
              fee_rate_sell_market: true,
            },
          },
          trade_job: {
            select: {
              id: true,
              side: true,
              symbol: true,
              order_type: true,
            },
          },
        },
        take: 1000, // Limitar para não sobrecarregar
      });

      totalChecked = executionsWithoutFees.length;
      console.log(`[ADMIN] Encontradas ${totalChecked} execuções sem taxas`);

      const positionService = new PositionService(this.prisma);

      // Processar em paralelo com limite de concorrência para evitar timeout
      const BATCH_SIZE = 10; // Processar 10 por vez
      const batches = [];
      for (let i = 0; i < executionsWithoutFees.length; i += BATCH_SIZE) {
        batches.push(executionsWithoutFees.slice(i, i + BATCH_SIZE));
      }

      console.log(`[ADMIN] Processando ${executionsWithoutFees.length} execuções em ${batches.length} lotes de ${BATCH_SIZE}`);

      for (const batch of batches) {
        await Promise.all(
          batch.map(async (execution) => {
            try {
              if (!execution.exchange_order_id || !execution.trade_job) {
                return; // Pular esta execução
              }

              const account = execution.exchange_account;
              if (!account.api_key_enc || !account.api_secret_enc) {
                console.warn(`[ADMIN] Conta ${account.id} sem API keys, pulando execução ${execution.id}`);
                return; // Pular esta execução
              }

          // Decriptar API keys
          const apiKey = await this.encryptionService.decrypt(account.api_key_enc);
          const apiSecret = await this.encryptionService.decrypt(account.api_secret_enc);

          // Criar adapter
          const adapter = AdapterFactory.createAdapter(
            account.exchange as ExchangeType,
            apiKey,
            apiSecret,
            { testnet: account.testnet }
          );

          // Buscar ordem na exchange
          // Para Bybit, usar fetchClosedOrder para ordens antigas (fora das últimas 500)
          let order: any;
          let rawOrder: any = null; // Guardar ordem original antes da conversão
          try {
            if (account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
              // Acessar ordem original antes da conversão
              const exchange = (adapter as any).exchange;
              if (exchange && exchange.has && exchange.has['fetchClosedOrder']) {
                rawOrder = await (exchange as any).fetchClosedOrder(
                  execution.exchange_order_id,
                  execution.trade_job.symbol
                );
              } else {
                rawOrder = await exchange.fetchOrder(
                  execution.exchange_order_id,
                  execution.trade_job.symbol,
                  { acknowledged: true }
                );
              }
              // Converter para OrderResult
              order = await adapter.fetchClosedOrder(
                execution.exchange_order_id,
                execution.trade_job.symbol
              );
            } else {
              // Para outras exchanges, buscar ordem original
              const exchange = (adapter as any).exchange;
              const params = account.exchange === 'BYBIT_SPOT' ? { acknowledged: true } : undefined;
              rawOrder = await exchange.fetchOrder(
                execution.exchange_order_id,
                execution.trade_job.symbol,
                params
              );
              // Converter para OrderResult
              order = await adapter.fetchOrder(
                execution.exchange_order_id,
                execution.trade_job.symbol,
                params
              );
            }
          } catch (fetchError: any) {
            // Se falhar com fetchClosedOrder, tentar fetchOrder com acknowledged: true
            if (account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
              try {
                const exchange = (adapter as any).exchange;
                rawOrder = await exchange.fetchOrder(
                  execution.exchange_order_id,
                  execution.trade_job.symbol,
                  { acknowledged: true }
                );
                order = await adapter.fetchOrder(
                  execution.exchange_order_id,
                  execution.trade_job.symbol,
                  { acknowledged: true }
                );
              } catch (retryError: any) {
                // Se ainda falhar, verificar se é o erro específico de ordem antiga
                if (retryError.message?.includes('last 500 orders')) {
                  throw new Error(
                    `Ordem muito antiga (fora das últimas 500). Não é possível buscar taxas para execução ${execution.id}.`
                  );
                }
                throw retryError;
              }
            } else {
              // Para outras exchanges, verificar se é erro de ordem antiga
              if (fetchError.message?.includes('last 500 orders')) {
                throw new Error(
                  `Ordem muito antiga (fora das últimas 500). Não é possível buscar taxas para execução ${execution.id}.`
                );
              }
              throw fetchError;
            }
          }
          
          // Sempre priorizar rawOrder se disponível (tem informações originais da exchange)
          // O CCXT pode converter e perder alguns campos como commission nos fills
          let orderToExtract: any = rawOrder || order;
          
          // Se rawOrder tem fills mas order não tem, ou se rawOrder tem mais informações, usar rawOrder
          if (rawOrder) {
            if ((!order.fills || order.fills.length === 0) && rawOrder.fills && rawOrder.fills.length > 0) {
              // rawOrder tem fills que order não tem
              orderToExtract = rawOrder;
            } else if (order.fills && order.fills.length > 0 && rawOrder.fills && rawOrder.fills.length > 0) {
              // Ambos têm fills, verificar se rawOrder tem commission e order não
              const rawOrderHasCommission = rawOrder.fills.some((f: any) => f.commission !== undefined && f.commission !== null);
              const orderHasCommission = order.fills.some((f: any) => f.commission !== undefined && f.commission !== null);
              
              if (rawOrderHasCommission && !orderHasCommission) {
                // rawOrder tem commission mas order não tem, usar rawOrder
                orderToExtract = rawOrder;
              }
            }
          }

          // Log detalhado da ordem para debug
          console.log(`[ADMIN] Execução ${execution.id}: Ordem recebida:`, {
            id: order.id,
            symbol: order.symbol,
            side: order.side,
            status: order.status,
            fills: order.fills ? `${order.fills.length} fills` : 'sem fills',
            fillsSample: order.fills && order.fills.length > 0 ? JSON.stringify(order.fills[0]) : 'sem fills',
            fee: order.fee ? JSON.stringify(order.fee) : 'sem fee',
            commission: order.commission || 'sem commission',
            cost: order.cost,
            filled: order.filled,
            rawOrderFills: rawOrder?.fills ? `${rawOrder.fills.length} fills` : 'sem fills no rawOrder',
            rawOrderFillsSample: rawOrder?.fills && rawOrder.fills.length > 0 ? JSON.stringify(rawOrder.fills[0]) : 'sem fills no rawOrder',
            rawOrderFee: rawOrder?.fee ? JSON.stringify(rawOrder.fee) : 'sem fee no rawOrder',
            rawOrderCommission: rawOrder?.commission || 'sem commission no rawOrder',
            usingRawOrder: orderToExtract === rawOrder,
          });

          // Extrair taxas - usar orderToExtract (pode ser rawOrder ou order)
          // O extractFeesFromOrder procura por:
          // 1. fill.commission e fill.commissionAsset (Binance usa este formato)
          // 2. fill.fee (outras exchanges)
          // 3. order.fee ou order.commission
          const fees = adapter.extractFeesFromOrder(
            orderToExtract,
            execution.trade_job.side.toLowerCase() as 'buy' | 'sell'
          );
          
          // IMPORTANTE: Só usar taxas configuradas na conta como FALLBACK
          // quando realmente não encontrou taxas na resposta da exchange
          // (fees.feeAmount === 0 significa que não encontrou taxas na ordem)
          if (fees.feeAmount === 0 && order.cost && order.filled) {
            const side = execution.trade_job.side.toLowerCase();
            const orderType = execution.trade_job.order_type?.toLowerCase() || 'market'; // Assumir market se não especificado
            
            // Determinar qual taxa usar baseado no lado e tipo de ordem
            let feeRate: number | null = null;
            if (side === 'buy') {
              feeRate = orderType === 'limit' 
                ? account.fee_rate_buy_limit?.toNumber() || null
                : account.fee_rate_buy_market?.toNumber() || null;
            } else {
              feeRate = orderType === 'limit'
                ? account.fee_rate_sell_limit?.toNumber() || null
                : account.fee_rate_sell_market?.toNumber() || null;
            }

            if (feeRate !== null && feeRate > 0) {
              // Determinar em qual moeda a taxa é paga baseado na exchange e lado da ordem
              // Binance geralmente paga taxa em base asset para BUY e quote asset para SELL
              // Bybit geralmente paga taxa em base asset para BUY
              const baseAsset = execution.trade_job.symbol.split('/')[0];
              const quoteAsset = execution.trade_job.symbol.split('/')[1] || 'USDT';
              
              // Para compras, taxa geralmente é em base asset (ex: BTC)
              // Para vendas, taxa geralmente é em quote asset (ex: USDT)
              if (side === 'buy') {
                // Taxa em base asset: calcular baseado na quantidade executada
                const calculatedFee = order.filled * feeRate;
                fees.feeAmount = calculatedFee;
                fees.feeCurrency = baseAsset;
                console.log(
                  `[ADMIN] Execução ${execution.id}: Não encontrou taxas na ordem, usando taxa configurada na conta (${(feeRate * 100).toFixed(4)}%): ${calculatedFee} ${baseAsset}`
                );
              } else {
                // Taxa em quote asset: calcular baseado no valor (cost)
                const calculatedFee = order.cost * feeRate;
                fees.feeAmount = calculatedFee;
                fees.feeCurrency = quoteAsset;
                console.log(
                  `[ADMIN] Execução ${execution.id}: Não encontrou taxas na ordem, usando taxa configurada na conta (${(feeRate * 100).toFixed(4)}%): ${calculatedFee} ${quoteAsset}`
                );
              }
            } else {
              console.warn(
                `[ADMIN] ⚠️ Execução ${execution.id}: Não encontrou taxas na ordem e não há taxa configurada na conta para ${side.toUpperCase()} ${orderType.toUpperCase()}`
              );
            }
          }

          console.log(`[ADMIN] Execução ${execution.id}: Taxas extraídas:`, {
            feeAmount: fees.feeAmount,
            feeCurrency: fees.feeCurrency,
          });

          if (fees.feeAmount > 0) {
            // Calcular taxa percentual baseado na moeda da taxa
            let feeRate: number | null = null;
            const cummQuoteQty = execution.cumm_quote_qty.toNumber();
            const executedQty = execution.executed_qty.toNumber();
            
            if (fees.feeCurrency === execution.trade_job.symbol.split('/')[1] || fees.feeCurrency === 'USDT' || fees.feeCurrency === 'USD') {
              // Taxa em quote asset, calcular percentual baseado no valor
              feeRate = cummQuoteQty > 0 ? (fees.feeAmount / cummQuoteQty) * 100 : null;
            } else if (fees.feeCurrency === execution.trade_job.symbol.split('/')[0]) {
              // Taxa em base asset, calcular percentual baseado na quantidade
              feeRate = executedQty > 0 ? (fees.feeAmount / executedQty) * 100 : null;
            }

            // Ajustar quantidade se necessário
            let adjustedExecutedQty = execution.executed_qty.toNumber();
            let adjustedCummQuoteQty = execution.cumm_quote_qty.toNumber();

            if (execution.trade_job.side === 'BUY' && fees.feeCurrency === execution.trade_job.symbol.split('/')[0]) {
              adjustedExecutedQty = Math.max(0, adjustedExecutedQty - fees.feeAmount);
            }

            if (execution.trade_job.side === 'SELL' && fees.feeCurrency === execution.trade_job.symbol.split('/')[1]) {
              adjustedCummQuoteQty = Math.max(0, adjustedCummQuoteQty - fees.feeAmount);
            }

            // Atualizar execução
            await this.prisma.tradeExecution.update({
              where: { id: execution.id },
              data: {
                fee_amount: fees.feeAmount,
                fee_currency: fees.feeCurrency,
                fee_rate: feeRate || undefined,
                executed_qty: adjustedExecutedQty,
                cumm_quote_qty: adjustedCummQuoteQty,
              },
            });

            // Recalcular posições afetadas
            if (execution.trade_job.side === 'BUY') {
              // Buscar posição aberta por este job
              const position = await this.prisma.tradePosition.findFirst({
                where: {
                  trade_job_id_open: execution.trade_job.id,
                  status: 'OPEN',
                },
              });

              if (position) {
                // Calcular taxa em USD para registro
                const quoteAsset = execution.trade_job.symbol.split('/')[1] || 'USDT';
                const baseAsset = execution.trade_job.symbol.split('/')[0];
                let feeUsd = fees.feeAmount;
                
                if (fees.feeCurrency === baseAsset) {
                  // Taxa em base asset, converter para USD usando preço médio
                  feeUsd = fees.feeAmount * execution.avg_price.toNumber();
                } else if (fees.feeCurrency !== 'USDT' && fees.feeCurrency !== 'USD' && fees.feeCurrency !== quoteAsset) {
                  // Outra moeda, tentar converter se possível
                  feeUsd = fees.feeAmount;
                  console.warn(`[ADMIN] Taxa em moeda desconhecida ${fees.feeCurrency}, usando valor direto`);
                }
                // Se já está em USDT/USD/quoteAsset, usar direto

                // Atualizar APENAS as taxas da posição, não a quantidade
                // A quantidade já foi ajustada na execução (adjustedExecutedQty)
                // Mas não devemos atualizar qty_total aqui pois pode estar agrupada
                // A quantidade será recalculada pelo PositionService quando necessário
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: {
                    fees_on_buy_usd: position.fees_on_buy_usd.toNumber() + feeUsd,
                    total_fees_paid_usd: position.total_fees_paid_usd.toNumber() + feeUsd,
                    // NÃO atualizar qty_total aqui - deixar o PositionService gerenciar
                  },
                });
              }
            } else {
              // SELL - recalcular PnL das posições fechadas
              // Buscar posições que foram fechadas por esta execução
              const positionFills = await this.prisma.positionFill.findMany({
                where: {
                  trade_execution_id: execution.id,
                  side: 'SELL',
                },
                include: {
                  position: true,
                },
              });

              for (const fill of positionFills) {
                const position = fill.position;
                const qtySold = fill.qty.toNumber();
                const totalQtySold = execution.executed_qty.toNumber();
                const feeProportion = totalQtySold > 0 ? (qtySold / totalQtySold) : 0;

                // Calcular taxa em USD
                const quoteAsset = execution.trade_job.symbol.split('/')[1] || 'USDT';
                let feeUsd = fees.feeAmount * feeProportion;
                if (fees.feeCurrency !== 'USDT' && fees.feeCurrency !== 'USD' && fees.feeCurrency !== quoteAsset) {
                  if (fees.feeCurrency === execution.trade_job.symbol.split('/')[0]) {
                    feeUsd = fees.feeAmount * feeProportion * execution.avg_price.toNumber();
                  }
                }

                // Recalcular PnL descontando taxa
                const grossProfit = (execution.avg_price.toNumber() - position.price_open.toNumber()) * qtySold;
                const netProfit = grossProfit - feeUsd;

                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: {
                    realized_profit_usd: position.realized_profit_usd.toNumber() - (grossProfit - netProfit),
                    fees_on_sell_usd: position.fees_on_sell_usd.toNumber() + feeUsd,
                    total_fees_paid_usd: position.total_fees_paid_usd.toNumber() + feeUsd,
                  },
                });
              }
            }

            updated++;
            console.log(`[ADMIN] ✅ Execução ${execution.id} atualizada com taxas: ${fees.feeAmount} ${fees.feeCurrency}`);
          } else {
            console.warn(`[ADMIN] ⚠️ Execução ${execution.id} não tem taxas na exchange (feeAmount: ${fees.feeAmount})`);
            // Log detalhado para entender por que não encontrou taxas
            console.log(`[ADMIN] Debug execução ${execution.id} - Estrutura completa da ordem:`, {
              hasFills: !!order.fills,
              fillsCount: order.fills ? order.fills.length : 0,
              fills: order.fills ? JSON.stringify(order.fills.slice(0, 2), null, 2) : 'sem fills',
              orderFee: order.fee,
              orderCommission: order.commission,
              orderCommissionAsset: order.commissionAsset,
              orderInfo: order.info ? JSON.stringify(order.info).substring(0, 500) : 'sem info',
              orderKeys: Object.keys(order),
              rawOrderFills: rawOrder?.fills ? JSON.stringify(rawOrder.fills.slice(0, 2), null, 2) : 'sem fills no rawOrder',
              rawOrderFee: rawOrder?.fee,
              rawOrderCommission: rawOrder?.commission,
              rawOrderInfo: rawOrder?.info ? JSON.stringify(rawOrder.info).substring(0, 1000) : 'sem info no rawOrder',
              rawOrderKeys: rawOrder ? Object.keys(rawOrder) : [],
            });
          }
            } catch (error: any) {
              const errorMessage = error.message || 'Erro desconhecido';
              errors.push({
                executionId: execution.id,
                error: errorMessage,
              });
              
              // Log mais detalhado para erros específicos
              if (errorMessage.includes('last 500 orders') || errorMessage.includes('muito antiga')) {
                console.warn(
                  `[ADMIN] ⚠️ Execução ${execution.id}: Ordem muito antiga (fora das últimas 500 ordens da Bybit). ` +
                  `Não é possível buscar taxas via API. Considere atualizar manualmente ou usar dados históricos.`
                );
              } else {
                console.error(`[ADMIN] ❌ Erro ao processar execução ${execution.id}:`, errorMessage);
              }
            }
          })
        );
        
        // Pequeno delay entre lotes para não sobrecarregar a API
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Sincronização concluída em ${duration}ms: ${updated}/${totalChecked} atualizadas, ${errors.length} erros`);

      return {
        total_checked: totalChecked,
        updated,
        errors: errors.length,
        error_details: errors.slice(0, 10), // Limitar detalhes de erros
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na sincronização de taxas:', error);
      throw error;
    }
  }

  @Post('system/fix-incorrect-fees')
  @ApiOperation({
    summary: 'Corrigir taxas calculadas incorretamente',
    description: 'Recalcula taxas de execuções que foram preenchidas com taxas em moeda incorreta (ex: USDT quando deveria ser BTC).',
  })
  @ApiResponse({
    status: 200,
    description: 'Correção concluída',
  })
  async fixIncorrectFees() {
    console.log('[ADMIN] Iniciando correção de taxas incorretas...');
    
    const startTime = Date.now();
    let totalChecked = 0;
    let fixed = 0;
    const errors: Array<{ executionId: number; error: string }> = [];

    try {
      // Buscar execuções com taxas preenchidas que podem estar incorretas
      // Critério: taxa em quote asset (USDT) mas deveria ser em base asset para BUY
      const executionsWithFees = await this.prisma.tradeExecution.findMany({
        where: {
          fee_amount: { not: null },
          trade_mode: 'REAL',
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              exchange: true,
              fee_rate_buy_limit: true,
              fee_rate_buy_market: true,
              fee_rate_sell_limit: true,
              fee_rate_sell_market: true,
            },
          },
          trade_job: {
            select: {
              id: true,
              side: true,
              symbol: true,
              order_type: true,
            },
          },
        },
        take: 1000,
      });

      totalChecked = executionsWithFees.length;
      console.log(`[ADMIN] Encontradas ${totalChecked} execuções com taxas para verificar`);

      for (const execution of executionsWithFees) {
        try {
          if (!execution.trade_job) {
            continue;
          }

          const side = execution.trade_job.side.toLowerCase();
          const symbol = execution.trade_job.symbol;
          const baseAsset = symbol.split('/')[0];
          const quoteAsset = symbol.split('/')[1] || 'USDT';
          const feeCurrency = execution.fee_currency || '';
          const feeAmount = execution.fee_amount?.toNumber() || 0;

          // Verificar se a taxa está na moeda errada
          // Para BUY: taxa geralmente é em base asset (BTC), não em quote asset (USDT)
          // Para SELL: taxa geralmente é em quote asset (USDT)
          let needsFix = false;
          let correctFeeCurrency = '';
          let correctFeeAmount = 0;

          if (side === 'buy' && feeCurrency === quoteAsset && feeAmount > 0) {
            // Taxa está em quote asset (USDT) mas deveria estar em base asset (BTC)
            // IMPORTANTE: Quando a taxa estava em USDT, ela NÃO foi subtraída da quantidade
            // Portanto, a quantidade atual (executed_qty) É a quantidade original bruta
            
            const currentExecutedQty = execution.executed_qty.toNumber();
            const cummQuoteQty = execution.cumm_quote_qty.toNumber();
            const avgPrice = execution.avg_price.toNumber();
            
            if (avgPrice > 0 && currentExecutedQty > 0 && cummQuoteQty > 0) {
              // Calcular taxa percentual baseada na taxa antiga (em USDT)
              // Isso nos dá a taxa percentual real que foi aplicada
              const feeRatePercent = feeAmount / cummQuoteQty;
              
              // Calcular taxa correta em base asset: quantidade_original * taxa_percentual
              // Esta é a forma correta: taxa sobre a quantidade comprada
              correctFeeAmount = currentExecutedQty * feeRatePercent;
              correctFeeCurrency = baseAsset;
              needsFix = true;
              
              console.log(
                `[ADMIN] Execução ${execution.id}: Taxa incorreta detectada - ${feeAmount} ${feeCurrency} (${(feeRatePercent * 100).toFixed(4)}%)`
              );
              console.log(
                `[ADMIN] Execução ${execution.id}: Quantidade original: ${currentExecutedQty} ${baseAsset}, Taxa calculada: ${correctFeeAmount.toFixed(8)} ${baseAsset} (${(feeRatePercent * 100).toFixed(4)}% sobre quantidade)`
              );
            }
          }

          if (needsFix) {
            // IMPORTANTE: Quando a taxa estava em USDT (quote asset), ela NÃO foi subtraída da quantidade
            // Portanto, a quantidade atual (executed_qty) É a quantidade original bruta
            const originalQty = execution.executed_qty.toNumber();
            const cummQuoteQty = execution.cumm_quote_qty.toNumber();
            const avgPrice = execution.avg_price.toNumber();
            
            // Calcular taxa percentual baseada na taxa antiga (em USDT)
            // Isso nos dá a taxa percentual real que foi aplicada
            const feeRatePercent = cummQuoteQty > 0 ? (feeAmount / cummQuoteQty) : 0;
            
            // Verificar se a quantidade atual já foi reduzida incorretamente
            // Se a quantidade atual * preço médio for muito menor que cumm_quote_qty, pode ter sido reduzida
            const expectedQtyFromCost = cummQuoteQty / avgPrice;
            const qtyDifference = Math.abs(originalQty - expectedQtyFromCost);
            
            // Se a diferença for significativa (mais de 1%), pode ter sido reduzida incorretamente
            // Nesse caso, usar a quantidade calculada a partir do cost
            let actualOriginalQty = originalQty;
            if (qtyDifference > expectedQtyFromCost * 0.01 && expectedQtyFromCost > originalQty) {
              // Quantidade pode ter sido reduzida incorretamente, restaurar do cost
              actualOriginalQty = expectedQtyFromCost;
              console.log(
                `[ADMIN] Execução ${execution.id}: Quantidade parece ter sido reduzida incorretamente. Restaurando: ${originalQty} -> ${actualOriginalQty}`
              );
            }
            
            // Recalcular taxa correta baseada na quantidade original real
            correctFeeAmount = actualOriginalQty * feeRatePercent;
            
            // Calcular quantidade líquida após subtrair a taxa em base asset
            const adjustedExecutedQty = Math.max(0, actualOriginalQty - correctFeeAmount);

            // Calcular taxa percentual correta (baseada na quantidade original)
            const feeRate = actualOriginalQty > 0 ? (correctFeeAmount / actualOriginalQty) * 100 : null;

            // Atualizar execução
            await this.prisma.tradeExecution.update({
              where: { id: execution.id },
              data: {
                fee_amount: correctFeeAmount,
                fee_currency: correctFeeCurrency,
                fee_rate: feeRate || undefined,
                executed_qty: adjustedExecutedQty,
                // cumm_quote_qty não precisa ser ajustado pois a taxa não afeta o valor pago
              },
            });

            // Recalcular posições afetadas
            if (side === 'buy') {
              const position = await this.prisma.tradePosition.findFirst({
                where: {
                  trade_job_id_open: execution.trade_job.id,
                  status: 'OPEN',
                },
              });

              if (position) {
                // Calcular taxa em USD (base asset * preço médio)
                const feeUsd = correctFeeAmount * execution.avg_price.toNumber();
                
                // Remover a taxa antiga (incorreta) e adicionar a nova (correta)
                const oldFeeUsd = feeAmount; // Taxa antiga já estava em USD
                const feeDifference = feeUsd - oldFeeUsd;

                // Calcular diferença de quantidade (quantidade original real - quantidade ajustada)
                const qtyDifference = actualOriginalQty - adjustedExecutedQty;
                
                // Ajustar quantidade total e restante
                // Se a quantidade original real é maior que a quantidade atual da execução, 
                // significa que a quantidade foi reduzida incorretamente e precisa ser restaurada
                const currentPositionQty = position.qty_total.toNumber();
                const currentPositionQtyRemaining = position.qty_remaining.toNumber();
                
                // Se a quantidade original real é maior que a atual da execução, restaurar primeiro
                let newQtyTotal = currentPositionQty;
                let newQtyRemaining = currentPositionQtyRemaining;
                
                if (actualOriginalQty > originalQty) {
                  // Quantidade foi reduzida incorretamente, restaurar
                  const qtyToRestore = actualOriginalQty - originalQty;
                  newQtyTotal = currentPositionQty + qtyToRestore;
                  newQtyRemaining = currentPositionQtyRemaining + qtyToRestore;
                  console.log(
                    `[ADMIN] Execução ${execution.id}: Restaurando quantidade na posição: ${currentPositionQty} -> ${newQtyTotal} (+${qtyToRestore})`
                  );
                }
                
                // Agora subtrair a taxa correta (diferença entre quantidade original e ajustada)
                newQtyTotal = newQtyTotal - qtyDifference;
                newQtyRemaining = newQtyRemaining - qtyDifference;
                
                await this.prisma.tradePosition.update({
                  where: { id: position.id },
                  data: {
                    fees_on_buy_usd: position.fees_on_buy_usd.toNumber() + feeDifference,
                    total_fees_paid_usd: position.total_fees_paid_usd.toNumber() + feeDifference,
                    // Ajustar quantidade total e restante
                    qty_total: newQtyTotal,
                    qty_remaining: newQtyRemaining,
                  },
                });
                
                console.log(
                  `[ADMIN] Execução ${execution.id}: Posição ${position.id} atualizada - Qty: ${currentPositionQty} -> ${newQtyTotal}, Taxa: ${oldFeeUsd.toFixed(4)} USDT -> ${feeUsd.toFixed(4)} USD (${correctFeeAmount.toFixed(8)} ${correctFeeCurrency})`
                );
              }
            }

            fixed++;
            console.log(`[ADMIN] ✅ Execução ${execution.id} corrigida`);
          }
        } catch (error: any) {
          errors.push({
            executionId: execution.id,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao corrigir execução ${execution.id}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Correção concluída em ${duration}ms: ${fixed}/${totalChecked} corrigidas, ${errors.length} erros`);

      return {
        total_checked: totalChecked,
        fixed,
        errors: errors.length,
        error_details: errors.slice(0, 10),
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na correção de taxas:', error);
      throw error;
    }
  }
}

