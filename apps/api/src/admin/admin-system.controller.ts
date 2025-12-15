import { Controller, Get, Post, Put, UseGuards, Body, BadRequestException, Param, ParseIntPipe, NotFoundException, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
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
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';

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
    private encryptionService: EncryptionService,
    private tradeJobQueueService: TradeJobQueueService
  ) {
    // Inicializar cache service Redis
    this.cacheService = new CacheService(
      process.env.REDIS_HOST || 'localhost',
      this.safeParseInt(process.env.REDIS_PORT || '6379', 6379, 1, 65535),
      process.env.REDIS_PASSWORD
    );
    this.cacheService.connect().catch((err) => {
      console.error('[AdminSystemController] Erro ao conectar ao Redis:', err);
    });
  }

  /**
   * ✅ BUG-ALTO-007 FIX: Validar e sanitizar parseInt com limites min/max
   */
  private safeParseInt(value: string | undefined | null, defaultValue: number, min: number = Number.MIN_SAFE_INTEGER, max: number = Number.MAX_SAFE_INTEGER): number {
    if (!value) return defaultValue;
    const parsed = parseInt(String(value), 10);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(min, Math.min(max, parsed));
  }

  /**
   * ✅ BUG-ALTO-007 FIX: Validar e sanitizar parseFloat com limites min/max
   */
  private safeParseFloat(value: string | undefined | null, defaultValue: number, min: number = Number.MIN_SAFE_INTEGER, max: number = Number.MAX_SAFE_INTEGER): number {
    if (!value) return defaultValue;
    const parsed = parseFloat(String(value));
    if (isNaN(parsed)) return defaultValue;
    return Math.max(min, Math.min(max, parsed));
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
      // ✅ BUG-BAIXO-004 FIX: Adicionar paginação padrão
      const executionsWithoutFees = await this.prisma.tradeExecution.findMany({
        where: {
          fee_amount: null,
          trade_mode: 'REAL',
        },
        take: 50,
        skip: 0,
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

          // Extrair taxas - PRIORIDADE: usar fetchMyTrades (fonte confiável)
          let fees = { feeAmount: 0, feeCurrency: '' };
          
          // 1. Tentar buscar trades reais da exchange (fonte mais confiável)
          if (execution.exchange_order_id) {
            try {
              const since = execution.created_at.getTime() - 3600000; // 1 hora antes da execução
              const trades = await adapter.fetchMyTrades(execution.trade_job.symbol, since, 100);
              
              // Filtrar trades que correspondem à ordem
              const orderTrades = trades.filter((t: any) => {
                return t.order === execution.exchange_order_id || 
                       t.orderId === execution.exchange_order_id || 
                       (t.info && (t.info.orderId === execution.exchange_order_id || t.info.orderListId === execution.exchange_order_id));
              });
              
              if (orderTrades.length > 0) {
                fees = adapter.extractFeesFromTrades(orderTrades);
                console.log(`[ADMIN] Execução ${execution.id}: Taxas extraídas de trades: ${fees.feeAmount} ${fees.feeCurrency} (${orderTrades.length} trade(s))`);
              }
            } catch (tradesError: any) {
              // Se fetchMyTrades falhar, continuar com fallback
              console.log(`[ADMIN] Execução ${execution.id}: Não foi possível buscar trades: ${tradesError.message}`);
            }
          }
          
          // 2. Se não encontrou em trades, usar extractFeesFromOrder (fallback)
          if (fees.feeAmount === 0) {
            fees = adapter.extractFeesFromOrder(
              orderToExtract,
              execution.trade_job.side.toLowerCase() as 'buy' | 'sell'
            );
            if (fees.feeAmount > 0) {
              console.log(`[ADMIN] Execução ${execution.id}: Taxas extraídas da ordem: ${fees.feeAmount} ${fees.feeCurrency}`);
            }
          }
          
          // ✅ TAXAS FIX: Removido fallback para taxas configuradas na conta
          // Agora usamos APENAS taxas retornadas pela exchange para manter consistência
          if (fees.feeAmount === 0 || !fees.feeCurrency) {
            const side = execution.trade_job.side.toLowerCase();
            const orderType = execution.trade_job.order_type?.toLowerCase() || 'market';
            console.warn(
              `[ADMIN] ⚠️ Execução ${execution.id}: Não foi possível obter taxas da exchange para ${side.toUpperCase()} ${orderType.toUpperCase()}. ` +
              `Taxas devem vir diretamente da exchange para manter consistência no saldo.`
            );
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
              api_key_enc: true,
              api_secret_enc: true,
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

      // Processar em lotes paralelos para melhor performance
      const BATCH_SIZE = 10; // Processar 10 execuções simultaneamente
      const batches: typeof executionsWithFees[] = [];
      
      for (let i = 0; i < executionsWithFees.length; i += BATCH_SIZE) {
        batches.push(executionsWithFees.slice(i, i + BATCH_SIZE));
      }

      console.log(`[ADMIN] Processando ${batches.length} lote(s) de até ${BATCH_SIZE} execuções cada`);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[ADMIN] Processando lote ${batchIndex + 1}/${batches.length} (${batch.length} execuções)`);

        await Promise.all(
          batch.map(async (execution) => {
            try {
              if (!execution.trade_job || !execution.exchange_order_id) {
                console.log(`[ADMIN] Execução ${execution.id}: Pulando - sem trade_job ou exchange_order_id`);
                return; // Usar return em vez de continue dentro do map
              }

          const side = execution.trade_job.side.toLowerCase();
          const symbol = execution.trade_job.symbol;
          const baseAsset = symbol.split('/')[0];
          const quoteAsset = symbol.split('/')[1] || 'USDT';
          const feeCurrency = execution.fee_currency || '';
          const feeAmount = execution.fee_amount?.toNumber() || 0;
          const currentExecutedQty = execution.executed_qty.toNumber();
          const cummQuoteQty = execution.cumm_quote_qty.toNumber();
          const avgPrice = execution.avg_price.toNumber();

          // Verificar se a taxa está na moeda errada ou se difere da taxa real da exchange
          let needsFix = false;
          let correctFeeCurrency = '';
          let correctFeeAmount = 0;
          let fixReason = '';

          // 1. Tentar buscar trades reais da exchange para comparar
          let realFeeFromTrades: { feeAmount: number; feeCurrency: string } | null = null;
          
          try {
            const apiKey = await this.encryptionService.decrypt(execution.exchange_account.api_key_enc || '');
            const apiSecret = await this.encryptionService.decrypt(execution.exchange_account.api_secret_enc || '');
            
            if (apiKey && apiSecret) {
              const adapter = AdapterFactory.createAdapter(
                execution.exchange_account.exchange as any,
                apiKey,
                apiSecret,
                { testnet: false }
              );
              
              const since = execution.created_at.getTime() - 3600000; // 1 hora antes
              const trades = await adapter.fetchMyTrades(symbol, since, 100);
              
              // Filtrar trades que correspondem à ordem
              const orderTrades = trades.filter((t: any) => {
                return t.order === execution.exchange_order_id || 
                       t.orderId === execution.exchange_order_id || 
                       (t.info && (t.info.orderId === execution.exchange_order_id || t.info.orderListId === execution.exchange_order_id));
              });
              
              if (orderTrades.length > 0) {
                realFeeFromTrades = adapter.extractFeesFromTrades(orderTrades);
                console.log(`[ADMIN] Execução ${execution.id}: Taxa real da exchange: ${realFeeFromTrades.feeAmount} ${realFeeFromTrades.feeCurrency}`);
                
                // Comparar com taxa armazenada
                if (realFeeFromTrades.feeAmount > 0) {
                  const storedFeeInRealCurrency = feeCurrency === realFeeFromTrades.feeCurrency 
                    ? feeAmount 
                    : (feeCurrency === quoteAsset && realFeeFromTrades.feeCurrency === baseAsset)
                      ? feeAmount / avgPrice // Converter USDT para base asset
                      : (feeCurrency === baseAsset && realFeeFromTrades.feeCurrency === quoteAsset)
                        ? feeAmount * avgPrice // Converter base asset para USDT
                        : feeAmount;
                  
                  const difference = Math.abs(storedFeeInRealCurrency - realFeeFromTrades.feeAmount);
                  const tolerance = realFeeFromTrades.feeAmount * 0.01; // 1% de tolerância
                  
                  if (difference > tolerance || feeCurrency !== realFeeFromTrades.feeCurrency) {
                    needsFix = true;
                    correctFeeAmount = realFeeFromTrades.feeAmount;
                    correctFeeCurrency = realFeeFromTrades.feeCurrency;
                    fixReason = `Taxa armazenada (${feeAmount} ${feeCurrency}) difere da taxa real da exchange (${realFeeFromTrades.feeAmount} ${realFeeFromTrades.feeCurrency})`;
                    console.log(`[ADMIN] Execução ${execution.id}: ${fixReason}`);
                  }
                }
              }
            }
          } catch (tradesError: any) {
            console.log(`[ADMIN] Execução ${execution.id}: Não foi possível buscar trades: ${tradesError.message}`);
          }

          // 2. Se não encontrou trades ou não precisa corrigir, verificar critérios existentes
          if (!needsFix && side === 'buy' && feeCurrency === quoteAsset && feeAmount > 0) {
            // Taxa está em quote asset (USDT) mas deveria estar em base asset (BTC)
            // IMPORTANTE: Quando a taxa estava em USDT, ela NÃO foi subtraída da quantidade
            // Portanto, a quantidade atual (executed_qty) É a quantidade original bruta
            
            if (avgPrice > 0 && currentExecutedQty > 0 && cummQuoteQty > 0) {
              // Calcular taxa percentual baseada na taxa antiga (em USDT)
              const feeRatePercent = feeAmount / cummQuoteQty;
              
              // Calcular taxa correta em base asset: quantidade_original * taxa_percentual
              correctFeeAmount = currentExecutedQty * feeRatePercent;
              correctFeeCurrency = baseAsset;
              needsFix = true;
              fixReason = `Taxa em quote asset (${feeAmount} ${feeCurrency}) mas deveria estar em base asset para BUY`;
              
              console.log(
                `[ADMIN] Execução ${execution.id}: ${fixReason} (${(feeRatePercent * 100).toFixed(4)}%)`
              );
            }
          }

          // 3. Verificar se taxa está em base asset mas quantidade não foi ajustada (BUY)
          if (!needsFix && side === 'buy' && feeCurrency === baseAsset && feeAmount > 0 && avgPrice > 0) {
            // Calcular quantidade esperada após taxa
            const expectedQtyAfterFee = currentExecutedQty + feeAmount; // Quantidade original seria maior
            const expectedCost = expectedQtyAfterFee * avgPrice;
            
            // Se o custo esperado é muito próximo do cumm_quote_qty, significa que quantidade não foi ajustada
            const costDifference = Math.abs(expectedCost - cummQuoteQty);
            if (costDifference < cummQuoteQty * 0.02) { // Diferença menor que 2%
              // Quantidade não foi ajustada, precisa corrigir
              needsFix = true;
              correctFeeAmount = feeAmount; // Taxa já está correta
              correctFeeCurrency = baseAsset; // Moeda já está correta
              fixReason = `Taxa em base asset mas quantidade não foi ajustada (qty atual: ${currentExecutedQty}, deveria ser: ${currentExecutedQty - feeAmount})`;
              console.log(`[ADMIN] Execução ${execution.id}: ${fixReason}`);
            }
          }

          if (needsFix) {
            const originalQty = execution.executed_qty.toNumber();
            const cummQuoteQty = execution.cumm_quote_qty.toNumber();
            const avgPrice = execution.avg_price.toNumber();
            
            let actualOriginalQty = originalQty;
            let adjustedExecutedQty = originalQty;
            let feeRate: number | null = null;
            
            // Se a taxa correta veio de trades reais, usar diretamente
            if (realFeeFromTrades && correctFeeCurrency === realFeeFromTrades.feeCurrency) {
              // Taxa já está correta, só precisa ajustar quantidade se necessário
              if (side === 'buy' && correctFeeCurrency === baseAsset) {
                // Taxa em base asset para BUY - quantidade deve ser reduzida
                // Verificar se já foi reduzida
                const expectedQtyAfterFee = originalQty + correctFeeAmount;
                const expectedCost = expectedQtyAfterFee * avgPrice;
                
                // Se o custo esperado é próximo do cumm_quote_qty, quantidade não foi ajustada
                if (Math.abs(expectedCost - cummQuoteQty) < cummQuoteQty * 0.02) {
                  actualOriginalQty = expectedQtyAfterFee;
                  adjustedExecutedQty = originalQty; // Quantidade atual já está correta (sem taxa)
                } else {
                  // Quantidade já foi ajustada, só atualizar taxa
                  adjustedExecutedQty = originalQty;
                  actualOriginalQty = originalQty + correctFeeAmount;
                }
              } else {
                adjustedExecutedQty = originalQty;
                actualOriginalQty = originalQty;
              }
              
              feeRate = cummQuoteQty > 0 ? (correctFeeAmount / cummQuoteQty) * 100 : null;
              if (correctFeeCurrency === baseAsset && actualOriginalQty > 0) {
                feeRate = (correctFeeAmount / actualOriginalQty) * 100;
              }
            } else {
              // Taxa precisa ser recalculada (caso de taxa em quote asset para BUY)
              // IMPORTANTE: Quando a taxa estava em USDT (quote asset), ela NÃO foi subtraída da quantidade
              const feeRatePercent = cummQuoteQty > 0 ? (feeAmount / cummQuoteQty) : 0;
              
              // Verificar se a quantidade atual já foi reduzida incorretamente
              const expectedQtyFromCost = cummQuoteQty / avgPrice;
              const qtyDifference = Math.abs(originalQty - expectedQtyFromCost);
              
              if (qtyDifference > expectedQtyFromCost * 0.01 && expectedQtyFromCost > originalQty) {
                actualOriginalQty = expectedQtyFromCost;
                console.log(
                  `[ADMIN] Execução ${execution.id}: Quantidade parece ter sido reduzida incorretamente. Restaurando: ${originalQty} -> ${actualOriginalQty}`
                );
              }
              
              // Recalcular taxa correta baseada na quantidade original real
              if (correctFeeAmount === 0) {
                correctFeeAmount = actualOriginalQty * feeRatePercent;
              }
              
              // Calcular quantidade líquida após subtrair a taxa em base asset
              if (side === 'buy' && correctFeeCurrency === baseAsset) {
                adjustedExecutedQty = Math.max(0, actualOriginalQty - correctFeeAmount);
              } else {
                adjustedExecutedQty = originalQty;
              }

              // Calcular taxa percentual correta
              feeRate = actualOriginalQty > 0 ? (correctFeeAmount / actualOriginalQty) * 100 : null;
              if (correctFeeCurrency === quoteAsset && cummQuoteQty > 0) {
                feeRate = (correctFeeAmount / cummQuoteQty) * 100;
              }
            }
            
            console.log(`[ADMIN] Execução ${execution.id}: Correção - ${fixReason}`);
            console.log(`[ADMIN] Execução ${execution.id}: Taxa: ${feeAmount} ${feeCurrency} -> ${correctFeeAmount.toFixed(8)} ${correctFeeCurrency}`);
            console.log(`[ADMIN] Execução ${execution.id}: Quantidade: ${originalQty} -> ${adjustedExecutedQty} (original: ${actualOriginalQty})`);

            // Calcular taxa em USD
            let feeUsd = 0;
            if (correctFeeCurrency === baseAsset) {
              feeUsd = correctFeeAmount * avgPrice;
            } else if (correctFeeCurrency === quoteAsset || correctFeeCurrency === 'USDT' || correctFeeCurrency === 'USD') {
              feeUsd = correctFeeAmount;
            }

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

            // SEMPRE recalcular posições afetadas pelos fills, mesmo se a taxa não precisou correção
            // Isso garante que a quantidade total esteja sempre correta
            if (side === 'buy') {
              const position = await this.prisma.tradePosition.findFirst({
                where: {
                  trade_job_id_open: execution.trade_job.id,
                  status: 'OPEN',
                },
                include: {
                  fills: {
                    include: {
                      execution: {
                        select: {
                          id: true,
                          executed_qty: true,
                          fee_amount: true,
                          fee_currency: true,
                          avg_price: true,
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

              if (position) {
                // SEMPRE recalcular quantidade total pelos fills, mesmo se a taxa não foi corrigida
                // Isso garante que a quantidade esteja sempre correta
                
                // Buscar todas as execuções relacionadas à posição para verificar taxas
                const jobIds = [
                  ...(position.grouped_jobs?.map(gj => gj.trade_job_id) || []),
                  ...(position.trade_job_id_open ? [position.trade_job_id_open] : [])
                ];
                
                const allExecutions = await this.prisma.tradeExecution.findMany({
                  where: {
                    trade_job: {
                      id: { in: jobIds },
                    },
                  },
                  select: {
                    id: true,
                    executed_qty: true,
                    fee_amount: true,
                    fee_currency: true,
                    avg_price: true,
                    cumm_quote_qty: true,
                  },
                });
                
                const executionMap = new Map(allExecutions.map(e => [e.id, e]));
                
                // RECALCULAR quantidade total da posição baseada nos fills
                // IMPORTANTE: Pode haver fills duplicados para a mesma execução
                // Agrupar fills por execução e usar apenas um fill por execução
                const fillsByExecution = new Map<number, any[]>();
                for (const fill of position.fills) {
                  if (!fillsByExecution.has(fill.trade_execution_id)) {
                    fillsByExecution.set(fill.trade_execution_id, []);
                  }
                  fillsByExecution.get(fill.trade_execution_id)!.push(fill);
                }
                
                // Para cada execução, usar apenas o fill mais recente (ou único)
                // Também remover fills órfãos (sem execução correspondente)
                const uniqueFills: any[] = [];
                for (const [execId, fills] of fillsByExecution.entries()) {
                  // Verificar se a execução existe
                  const executionExists = executionMap.has(execId);
                  
                  if (!executionExists) {
                    // Todos os fills desta execução são órfãos - DELETAR TODOS
                    console.warn(`[ADMIN] Execução ${execId} não existe - deletando ${fills.length} fill(s) órfão(s)`);
                    for (const orphanFill of fills) {
                      await this.prisma.positionFill.delete({
                        where: { id: orphanFill.id },
                      });
                    }
                    continue; // Pular esta execução
                  }
                  
                  // Ordenar por created_at (mais recente primeiro) e pegar o primeiro
                  const sortedFills = fills.sort((a, b) => 
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  );
                  uniqueFills.push(sortedFills[0]);
                  
                  // Se há múltiplos fills para a mesma execução, deletar os duplicados
                  if (fills.length > 1) {
                    const fillToKeep = sortedFills[0];
                    const fillsToDelete = sortedFills.slice(1);
                    console.log(`[ADMIN] Execução ${execId}: Encontrados ${fills.length} fills duplicados, mantendo fill ${fillToKeep.id}, deletando ${fillsToDelete.length} duplicado(s)`);
                    
                    for (const duplicateFill of fillsToDelete) {
                      await this.prisma.positionFill.delete({
                        where: { id: duplicateFill.id },
                      });
                    }
                  }
                }
                
                let totalBuyQty = 0;
                let totalSellQty = 0;
                let totalFeesUsd = 0;
                let feesOnBuyUsd = 0;
                let feesOnSellUsd = 0;
                
                const hasFillForThisExecution = uniqueFills.some(f => f.trade_execution_id === execution.id);
                
                // Processar apenas fills únicos (um por execução)
                for (const fill of uniqueFills) {
                  if (fill.side === 'BUY') {
                    const fillExecution = executionMap.get(fill.trade_execution_id);
                    let fillQty = fill.qty.toNumber();
                    let fillFeeUsd = 0;
                    
                    // Se é o fill desta execução, usar quantidade ajustada
                    if (fill.trade_execution_id === execution.id) {
                      fillQty = adjustedExecutedQty;
                      fillFeeUsd = feeUsd;
                      
                      // Atualizar o fill também
                      await this.prisma.positionFill.update({
                        where: { id: fill.id },
                        data: {
                          qty: adjustedExecutedQty,
                        },
                      });
                    } else if (fillExecution) {
                      // SEMPRE usar executed_qty da execução como quantidade correta do fill
                      // O executed_qty já deveria estar ajustado pela taxa se necessário
                      const execExecutedQty = fillExecution.executed_qty.toNumber();
                      const execFeeAmount = fillExecution.fee_amount?.toNumber() || 0;
                      const execFeeCurrency = fillExecution.fee_currency || '';
                      const execAvgPrice = fillExecution.avg_price.toNumber();
                      
                      // Se o fill tem quantidade diferente do executed_qty, atualizar
                      if (Math.abs(fillQty - execExecutedQty) > 0.00000001) {
                        fillQty = execExecutedQty;
                        console.log(`[ADMIN] Fill ${fill.id} ajustado: ${fill.qty.toNumber()} -> ${fillQty} (usando executed_qty da execução ${fill.trade_execution_id})`);
                        
                        await this.prisma.positionFill.update({
                          where: { id: fill.id },
                          data: {
                            qty: fillQty,
                          },
                        });
                      } else {
                        fillQty = execExecutedQty;
                      }
                      
                      // Calcular taxa em USD para este fill
                      if (execFeeAmount > 0) {
                        if (execFeeCurrency === baseAsset) {
                          fillFeeUsd = execFeeAmount * execAvgPrice;
                        } else if (execFeeCurrency === quoteAsset || execFeeCurrency === 'USDT' || execFeeCurrency === 'USD') {
                          fillFeeUsd = execFeeAmount;
                        }
                      }
                    } else {
                      // Fill órfão: não tem execução correspondente - DELETAR
                      console.warn(`[ADMIN] Fill ${fill.id} é órfão (execution_id: ${fill.trade_execution_id} não existe) - DELETANDO`);
                      await this.prisma.positionFill.delete({
                        where: { id: fill.id },
                      });
                      continue; // Pular este fill, não somar na quantidade
                    }
                    
                    totalBuyQty += fillQty;
                    feesOnBuyUsd += fillFeeUsd;
                    totalFeesUsd += fillFeeUsd;
                  } else if (fill.side === 'SELL') {
                    // Para fills de SELL, subtrair a quantidade vendida
                    totalSellQty += fill.qty.toNumber();
                    
                    // Adicionar taxa de venda
                    const fillExecution = executionMap.get(fill.trade_execution_id);
                    if (fillExecution && fillExecution.fee_amount) {
                      const fillFeeAmount = fillExecution.fee_amount.toNumber();
                      const fillFeeCurrency = fillExecution.fee_currency || '';
                      let fillFeeUsd = 0;
                      
                      if (fillFeeCurrency === quoteAsset || fillFeeCurrency === 'USDT' || fillFeeCurrency === 'USD') {
                        fillFeeUsd = fillFeeAmount;
                      } else {
                        // Taxa em base asset na venda (raro), converter para USD
                        fillFeeUsd = fillFeeAmount * fill.price.toNumber();
                      }
                      
                      feesOnSellUsd += fillFeeUsd;
                      totalFeesUsd += fillFeeUsd;
                    }
                  }
                }
                
                // Se esta execução não tem fill ainda, adicionar
                if (!hasFillForThisExecution && side === 'buy') {
                  totalBuyQty += adjustedExecutedQty;
                  feesOnBuyUsd += feeUsd;
                  totalFeesUsd += feeUsd;
                }
                
                const newQtyTotal = Math.max(0, totalBuyQty);
                const newQtyRemaining = Math.max(0, totalBuyQty - totalSellQty);
                
                // Usar transação para evitar condições de corrida ao atualizar a mesma posição
                await this.prisma.$transaction(async (tx) => {
                  // Re-buscar posição com dados atualizados dentro da transação
                  const currentPosition = await tx.tradePosition.findUnique({
                    where: { id: position.id },
                    include: {
                      fills: {
                        include: {
                          execution: {
                            select: {
                              id: true,
                              executed_qty: true,
                              fee_amount: true,
                              fee_currency: true,
                              avg_price: true,
                            },
                          },
                        },
                      },
                    },
                  });
                  
                  if (!currentPosition) {
                    console.warn(`[ADMIN] Execução ${execution.id}: Posição ${position.id} não encontrada na transação`);
                    return;
                  }
                  
                  // Recalcular novamente com dados atualizados (pode ter sido atualizado por outra execução)
                  let recalcTotalBuyQty = 0;
                  let recalcTotalSellQty = 0;
                  let recalcFeesOnBuyUsd = 0;
                  let recalcFeesOnSellUsd = 0;
                  let recalcTotalFeesUsd = 0;
                  
                  for (const fill of currentPosition.fills) {
                    const fillExecution = executionMap.get(fill.trade_execution_id);
                    if (fill.side === 'BUY' && fillExecution) {
                      recalcTotalBuyQty += fillExecution.executed_qty.toNumber();
                      if (fillExecution.fee_amount) {
                        const fillFeeAmount = fillExecution.fee_amount.toNumber();
                        const fillFeeCurrency = fillExecution.fee_currency || '';
                        if (fillFeeCurrency === baseAsset) {
                          recalcFeesOnBuyUsd += fillFeeAmount * fillExecution.avg_price.toNumber();
                        } else if (fillFeeCurrency === quoteAsset || fillFeeCurrency === 'USDT' || fillFeeCurrency === 'USD') {
                          recalcFeesOnBuyUsd += fillFeeAmount;
                        }
                      }
                    } else if (fill.side === 'SELL' && fillExecution) {
                      recalcTotalSellQty += fill.qty.toNumber();
                      if (fillExecution.fee_amount) {
                        const fillFeeAmount = fillExecution.fee_amount.toNumber();
                        const fillFeeCurrency = fillExecution.fee_currency || '';
                        if (fillFeeCurrency === quoteAsset || fillFeeCurrency === 'USDT' || fillFeeCurrency === 'USD') {
                          recalcFeesOnSellUsd += fillFeeAmount;
                        } else {
                          recalcFeesOnSellUsd += fillFeeAmount * fill.price.toNumber();
                        }
                      }
                    }
                  }
                  
                  recalcTotalFeesUsd = recalcFeesOnBuyUsd + recalcFeesOnSellUsd;
                  const finalQtyTotal = Math.max(0, recalcTotalBuyQty);
                  const finalQtyRemaining = Math.max(0, recalcTotalBuyQty - recalcTotalSellQty);
                  
                  await tx.tradePosition.update({
                    where: { id: position.id },
                    data: {
                      qty_total: finalQtyTotal,
                      qty_remaining: finalQtyRemaining,
                      fees_on_buy_usd: recalcFeesOnBuyUsd,
                      fees_on_sell_usd: recalcFeesOnSellUsd,
                      total_fees_paid_usd: recalcTotalFeesUsd,
                    },
                  });
                  
                  console.log(
                    `[ADMIN] Execução ${execution.id}: Posição ${position.id} atualizada - Qty: ${currentPosition.qty_total.toNumber()} -> ${finalQtyTotal}, Remaining: ${currentPosition.qty_remaining.toNumber()} -> ${finalQtyRemaining}, Taxas: ${recalcTotalFeesUsd.toFixed(4)} USD`
                  );
                });
              }
            }

            fixed++;
            console.log(`[ADMIN] ✅ Execução ${execution.id} corrigida`);
          } else {
            // Mesmo se não precisar corrigir a taxa, recalcular posição pelos fills
            // Isso garante que a quantidade total esteja sempre correta
            if (side === 'buy') {
              try {
                const position = await this.prisma.tradePosition.findFirst({
                  where: {
                    trade_job_id_open: execution.trade_job.id,
                    status: 'OPEN',
                  },
                  include: {
                    fills: {
                      include: {
                        execution: {
                          select: {
                            id: true,
                            executed_qty: true,
                            fee_amount: true,
                            fee_currency: true,
                            avg_price: true,
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

                if (position) {
                  // Buscar todas as execuções relacionadas
                  const jobIds = [
                    ...(position.grouped_jobs?.map(gj => gj.trade_job_id) || []),
                    ...(position.trade_job_id_open ? [position.trade_job_id_open] : [])
                  ];
                  
                  const allExecutions = await this.prisma.tradeExecution.findMany({
                    where: {
                      trade_job: {
                        id: { in: jobIds },
                      },
                    },
                    select: {
                      id: true,
                      executed_qty: true,
                      fee_amount: true,
                      fee_currency: true,
                      avg_price: true,
                    },
                  });
                  
                  const executionMap = new Map(allExecutions.map(e => [e.id, e]));
                  
                  // Agrupar fills por execução para evitar duplicados
                  const fillsByExecution = new Map<number, any[]>();
                  for (const fill of position.fills) {
                    if (!fillsByExecution.has(fill.trade_execution_id)) {
                      fillsByExecution.set(fill.trade_execution_id, []);
                    }
                    fillsByExecution.get(fill.trade_execution_id)!.push(fill);
                  }
                  
                  // Para cada execução, usar apenas o fill mais recente (ou único)
                  // Também remover fills órfãos (sem execução correspondente)
                  const uniqueFills: any[] = [];
                  for (const [execId, fills] of fillsByExecution.entries()) {
                    // Verificar se a execução existe
                    const executionExists = executionMap.has(execId);
                    
                    if (!executionExists) {
                      // Todos os fills desta execução são órfãos - DELETAR TODOS
                      console.warn(`[ADMIN] Execução ${execId} não existe - deletando ${fills.length} fill(s) órfão(s)`);
                      for (const orphanFill of fills) {
                        await this.prisma.positionFill.delete({
                          where: { id: orphanFill.id },
                        });
                      }
                      continue; // Pular esta execução
                    }
                    
                    // Ordenar por created_at (mais recente primeiro) e pegar o primeiro
                    const sortedFills = fills.sort((a, b) => 
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    uniqueFills.push(sortedFills[0]);
                    
                    // Se há múltiplos fills para a mesma execução, deletar os duplicados
                    if (fills.length > 1) {
                      const fillToKeep = sortedFills[0];
                      const fillsToDelete = sortedFills.slice(1);
                      console.log(`[ADMIN] Execução ${execId}: Encontrados ${fills.length} fills duplicados, mantendo fill ${fillToKeep.id}, deletando ${fillsToDelete.length} duplicado(s)`);
                      
                      for (const duplicateFill of fillsToDelete) {
                        await this.prisma.positionFill.delete({
                          where: { id: duplicateFill.id },
                        });
                      }
                    }
                  }
                  
                  // Recalcular pelos fills únicos
                  let totalBuyQty = 0;
                  let totalSellQty = 0;
                  let feesOnBuyUsd = 0;
                  let feesOnSellUsd = 0;
                  
                  for (const fill of uniqueFills) {
                    const fillExecution = executionMap.get(fill.trade_execution_id);
                    if (fill.side === 'BUY' && fillExecution) {
                      const execExecutedQty = fillExecution.executed_qty.toNumber();
                      totalBuyQty += execExecutedQty;
                      
                      // Atualizar fill se necessário
                      if (Math.abs(fill.qty.toNumber() - execExecutedQty) > 0.00000001) {
                        await this.prisma.positionFill.update({
                          where: { id: fill.id },
                          data: { qty: execExecutedQty },
                        });
                      }
                      
                      // Calcular taxa
                      if (fillExecution.fee_amount) {
                        const fillFeeAmount = fillExecution.fee_amount.toNumber();
                        const fillFeeCurrency = fillExecution.fee_currency || '';
                        if (fillFeeCurrency === baseAsset) {
                          feesOnBuyUsd += fillFeeAmount * fillExecution.avg_price.toNumber();
                        } else if (fillFeeCurrency === quoteAsset || fillFeeCurrency === 'USDT' || fillFeeCurrency === 'USD') {
                          feesOnBuyUsd += fillFeeAmount;
                        }
                      }
                    } else if (fill.side === 'SELL' && fillExecution) {
                      totalSellQty += fill.qty.toNumber();
                      if (fillExecution.fee_amount) {
                        const fillFeeAmount = fillExecution.fee_amount.toNumber();
                        const fillFeeCurrency = fillExecution.fee_currency || '';
                        if (fillFeeCurrency === quoteAsset || fillFeeCurrency === 'USDT' || fillFeeCurrency === 'USD') {
                          feesOnSellUsd += fillFeeAmount;
                        } else {
                          feesOnSellUsd += fillFeeAmount * fill.price.toNumber();
                        }
                      }
                    }
                  }
                  
                  const finalQtyTotal = Math.max(0, totalBuyQty);
                  const finalQtyRemaining = Math.max(0, totalBuyQty - totalSellQty);
                  const finalTotalFees = feesOnBuyUsd + feesOnSellUsd;
                  
                  // Atualizar posição dentro de transação
                  await this.prisma.$transaction(async (tx) => {
                    const currentPosition = await tx.tradePosition.findUnique({
                      where: { id: position.id },
                      include: {
                        fills: {
                          include: {
                            execution: {
                              select: {
                                id: true,
                                executed_qty: true,
                                fee_amount: true,
                                fee_currency: true,
                                avg_price: true,
                              },
                            },
                          },
                        },
                      },
                    });
                    
                    if (currentPosition) {
                      // Recalcular novamente com dados atualizados, agrupando fills por execução
                      let recalcBuyQty = 0;
                      let recalcSellQty = 0;
                      let recalcFeesBuy = 0;
                      let recalcFeesSell = 0;
                      
                      // Agrupar fills por execução para evitar contar duplicados
                      const fillsByExecInTx2 = new Map<number, any>();
                      for (const fill of currentPosition.fills) {
                        const execId = fill.trade_execution_id;
                        // Manter apenas o fill mais recente para cada execução
                        if (!fillsByExecInTx2.has(execId) || 
                            new Date(fill.created_at) > new Date(fillsByExecInTx2.get(execId)!.created_at)) {
                          fillsByExecInTx2.set(execId, fill);
                        }
                      }
                      
                      // Recalcular usando apenas fills únicos
                      for (const fill of fillsByExecInTx2.values()) {
                        const fillExec = executionMap.get(fill.trade_execution_id);
                        if (fill.side === 'BUY' && fillExec) {
                          recalcBuyQty += fillExec.executed_qty.toNumber();
                          if (fillExec.fee_amount) {
                            const feeAmt = fillExec.fee_amount.toNumber();
                            const feeCur = fillExec.fee_currency || '';
                            if (feeCur === baseAsset) {
                              recalcFeesBuy += feeAmt * fillExec.avg_price.toNumber();
                            } else if (feeCur === quoteAsset || feeCur === 'USDT' || feeCur === 'USD') {
                              recalcFeesBuy += feeAmt;
                            }
                          }
                        } else if (fill.side === 'SELL' && fillExec) {
                          recalcSellQty += fill.qty.toNumber();
                          if (fillExec.fee_amount) {
                            const feeAmt = fillExec.fee_amount.toNumber();
                            const feeCur = fillExec.fee_currency || '';
                            if (feeCur === quoteAsset || feeCur === 'USDT' || feeCur === 'USD') {
                              recalcFeesSell += feeAmt;
                            } else {
                              recalcFeesSell += feeAmt * fill.price.toNumber();
                            }
                          }
                        }
                      }
                      
                      const finalQty = Math.max(0, recalcBuyQty);
                      const finalRemaining = Math.max(0, recalcBuyQty - recalcSellQty);
                      const finalFees = recalcFeesBuy + recalcFeesSell;
                      
                      const oldQty = currentPosition.qty_total.toNumber();
                      const oldRemaining = currentPosition.qty_remaining.toNumber();
                      
                      await tx.tradePosition.update({
                        where: { id: position.id },
                        data: {
                          qty_total: finalQty,
                          qty_remaining: finalRemaining,
                          fees_on_buy_usd: recalcFeesBuy,
                          fees_on_sell_usd: recalcFeesSell,
                          total_fees_paid_usd: finalFees,
                        },
                      });
                      
                      if (Math.abs(oldQty - finalQty) > 0.00000001 || Math.abs(oldRemaining - finalRemaining) > 0.00000001) {
                        console.log(`[ADMIN] Execução ${execution.id}: Posição ${position.id} recalculada pelos fills - Qty: ${oldQty} -> ${finalQty}, Remaining: ${oldRemaining} -> ${finalRemaining}`);
                        fixed++; // Incrementar se a quantidade foi corrigida
                      } else {
                        console.log(`[ADMIN] Execução ${execution.id}: Posição ${position.id} verificada - quantidades já estão corretas (Qty: ${finalQty}, Remaining: ${finalRemaining})`);
                      }
                    }
                  });
                }
              } catch (posError: any) {
                console.error(`[ADMIN] Erro ao recalcular posição para execução ${execution.id}: ${posError.message}`);
              }
            }
          }
        } catch (error: any) {
          errors.push({
            executionId: execution.id,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao corrigir execução ${execution.id}:`, error.message);
        }
          })
        );

        console.log(`[ADMIN] Lote ${batchIndex + 1}/${batches.length} concluído: ${fixed} corrigidas até agora, ${errors.length} erro(s)`);
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

  @Post('system/audit-all')
  @ApiOperation({
    summary: 'Auditar todas as posições abertas na exchange',
    description: 'Verifica uma a uma todas as posições abertas, execuções e taxas na exchange via API, comparando com dados do banco e reportando discrepâncias. Aceita filtros de data, conta e opção para verificar apenas trade jobs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Auditoria concluída',
  })
  async auditAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('checkJobsOnly') checkJobsOnly?: string,
    @Res({ passthrough: true }) res?: Response
  ) {
    const dateFrom = from ? new Date(from) : undefined;
    const dateTo = to ? new Date(to) : undefined;
    const accountIdNum = accountId ? parseInt(accountId) : undefined;
    const checkJobsOnlyFlag = checkJobsOnly === 'true';
    
    console.log('[ADMIN] Iniciando auditoria completa de posições...');
    if (dateFrom) console.log(`[ADMIN] Filtro: Data inicial = ${dateFrom.toISOString()}`);
    if (dateTo) console.log(`[ADMIN] Filtro: Data final = ${dateTo.toISOString()}`);
    if (accountIdNum) console.log(`[ADMIN] Filtro: Conta ID = ${accountIdNum}`);
    if (checkJobsOnlyFlag) console.log(`[ADMIN] Modo: Verificar apenas Trade Jobs`);
    
    const startTime = Date.now();
    let totalPositionsChecked = 0;
    let totalExecutionsChecked = 0;
    let totalJobsChecked = 0;
    const discrepancies: Array<{
      type: string;
      entityType: 'EXECUTION' | 'POSITION' | 'JOB';
      entityId: number;
      field: string;
      currentValue: number | string;
      expectedValue: number | string;
      canAutoFix: boolean;
      fixDescription: string;
    }> = [];
    const errors: Array<{ positionId?: number; executionId?: number; jobId?: number; error: string }> = [];

    try {
      // Construir filtros para posições
      const positionWhere: any = {
        status: 'OPEN',
        trade_mode: 'REAL',
      };
      
      if (accountIdNum) {
        positionWhere.exchange_account_id = accountIdNum;
      }
      
      if (dateFrom || dateTo) {
        positionWhere.created_at = {};
        if (dateFrom) {
          positionWhere.created_at.gte = dateFrom;
        }
        if (dateTo) {
          positionWhere.created_at.lte = dateTo;
        }
      }

      // Se checkJobsOnly, não buscar posições, apenas jobs
      let openPositions: any[] = [];
      if (!checkJobsOnlyFlag) {
        // Buscar todas posições abertas (REAL)
        openPositions = await this.prisma.tradePosition.findMany({
          where: positionWhere,
        include: {
          exchange_account: {
            select: {
              id: true,
              exchange: true,
              api_key_enc: true,
              api_secret_enc: true,
              testnet: true,
              is_simulation: true,
            },
          },
          grouped_jobs: {
            select: {
              trade_job_id: true,
            },
          },
          fills: {
            include: {
              execution: {
                select: {
                  id: true,
                  executed_qty: true,
                  avg_price: true,
                  cumm_quote_qty: true,
                  fee_amount: true,
                  fee_currency: true,
                  exchange_order_id: true,
                },
              },
            },
          },
        },
        });
      }

      totalPositionsChecked = openPositions.length;
      console.log(`[ADMIN] Encontradas ${totalPositionsChecked} posições abertas para auditar`);

      // Se checkJobsOnly, verificar trade jobs BUY FILLED
      if (checkJobsOnlyFlag) {
        const jobsWhere: any = {
          side: 'BUY',
          status: 'FILLED',
          trade_mode: 'REAL',
        };
        
        if (accountIdNum) {
          jobsWhere.exchange_account_id = accountIdNum;
        }
        
        if (dateFrom || dateTo) {
          jobsWhere.created_at = {};
          if (dateFrom) {
            jobsWhere.created_at.gte = dateFrom;
          }
          if (dateTo) {
            jobsWhere.created_at.lte = dateTo;
          }
        }

        const jobsToCheck = await this.prisma.tradeJob.findMany({
          where: jobsWhere,
          include: {
            exchange_account: {
              select: {
                id: true,
                exchange: true,
                api_key_enc: true,
                api_secret_enc: true,
                testnet: true,
                is_simulation: true,
              },
            },
            position_open: {
              select: {
                id: true,
                status: true,
              },
            },
            executions: {
              select: {
                id: true,
                exchange_order_id: true,
                executed_qty: true,
                avg_price: true,
                created_at: true,
              },
              take: 1,
              orderBy: {
                created_at: 'desc',
              },
            },
          },
        });

        totalJobsChecked = jobsToCheck.length;
        console.log(`[ADMIN] Encontrados ${totalJobsChecked} trade jobs BUY FILLED para auditar`);

        // Verificar cada job
        for (const job of jobsToCheck) {
          try {
            // Verificar se tem posição associada
            if (!job.position_open) {
              discrepancies.push({
                type: 'MISSING_POSITION',
                entityType: 'JOB',
                entityId: job.id,
                field: 'position_open',
                currentValue: 'null',
                expectedValue: 'deve ter posição',
                canAutoFix: false,
                fixDescription: `Job ${job.id} (${job.symbol}) está FILLED mas não tem posição associada`,
              });
            } else if (job.position_open.status === 'CLOSED') {
              discrepancies.push({
                type: 'CLOSED_POSITION',
                entityType: 'JOB',
                entityId: job.id,
                field: 'position_open.status',
                currentValue: 'CLOSED',
                expectedValue: 'OPEN',
                canAutoFix: false,
                fixDescription: `Job ${job.id} (${job.symbol}) está associado a posição fechada #${job.position_open.id}`,
              });
            }

            // Verificar se está em PositionGroupedJob mas não tem position_open correto
            const groupedJob = await this.prisma.positionGroupedJob.findFirst({
              where: {
                trade_job_id: job.id,
              },
              include: {
                position: {
                  select: {
                    id: true,
                    status: true,
                  },
                },
              },
            });

            if (groupedJob) {
              if (!job.position_open || job.position_open.id !== groupedJob.position.id) {
                discrepancies.push({
                  type: 'GROUPED_JOB_MISMATCH',
                  entityType: 'JOB',
                  entityId: job.id,
                  field: 'position_open',
                  currentValue: job.position_open ? `posição #${job.position_open.id}` : 'null',
                  expectedValue: `posição #${groupedJob.position.id}`,
                  canAutoFix: false,
                  fixDescription: `Job ${job.id} está em PositionGroupedJob da posição #${groupedJob.position.id}, mas position_open está incorreto`,
                });
              }
            }

            // Verificar duplicação de exchange_order_id
            if (job.executions && job.executions.length > 0) {
              const execution = job.executions[0];
              if (execution.exchange_order_id) {
                const duplicateJobs = await this.prisma.tradeJob.findMany({
                  where: {
                    executions: {
                      some: {
                        exchange_order_id: execution.exchange_order_id,
                      },
                    },
                    id: { not: job.id },
                  },
                  select: {
                    id: true,
                    symbol: true,
                  },
                });

                if (duplicateJobs.length > 0) {
                  discrepancies.push({
                    type: 'DUPLICATE_ORDER_ID',
                    entityType: 'JOB',
                    entityId: job.id,
                    field: 'exchange_order_id',
                    currentValue: execution.exchange_order_id,
                    expectedValue: 'único',
                    canAutoFix: false,
                    fixDescription: `Job ${job.id} tem exchange_order_id duplicado. Outros jobs: ${duplicateJobs.map(j => j.id).join(', ')}`,
                  });
                }
              } else {
                // Job FILLED sem exchange_order_id
                discrepancies.push({
                  type: 'MISSING_ORDER_ID',
                  entityType: 'JOB',
                  entityId: job.id,
                  field: 'exchange_order_id',
                  currentValue: 'null',
                  expectedValue: 'deve ter exchange_order_id',
                  canAutoFix: false,
                  fixDescription: `Job ${job.id} (${job.symbol}) está FILLED mas não tem exchange_order_id na execução`,
                });
              }
            } else {
              // Job FILLED sem execuções
              discrepancies.push({
                type: 'MISSING_EXECUTION',
                entityType: 'JOB',
                entityId: job.id,
                field: 'executions',
                currentValue: '0 execuções',
                expectedValue: 'deve ter execução',
                canAutoFix: false,
                fixDescription: `Job ${job.id} (${job.symbol}) está FILLED mas não tem execuções associadas`,
              });
            }
          } catch (jobError: any) {
            errors.push({
              jobId: job.id,
              error: `Erro ao auditar job: ${jobError.message}`,
            });
          }
        }
      }

      // Processar em lotes de 5 posições simultaneamente
      const BATCH_SIZE = 5;
      const batches: typeof openPositions[] = [];
      
      for (let i = 0; i < openPositions.length; i += BATCH_SIZE) {
        batches.push(openPositions.slice(i, i + BATCH_SIZE));
      }

      console.log(`[ADMIN] Processando ${batches.length} lote(s) de até ${BATCH_SIZE} posições cada`);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        await Promise.all(
          batch.map(async (position) => {
            try {
              // Pular contas de simulação
              if (position.exchange_account.is_simulation) {
                return;
              }

              const account = position.exchange_account;
              if (!account.api_key_enc || !account.api_secret_enc) {
                errors.push({
                  positionId: position.id,
                  error: 'Conta sem API keys',
                });
                return;
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

              // Buscar todas execuções relacionadas à posição
              const jobIds = [
                ...(position.grouped_jobs?.map(gj => gj.trade_job_id) || []),
                ...(position.trade_job_id_open ? [position.trade_job_id_open] : []),
              ];

              const executions = await this.prisma.tradeExecution.findMany({
                where: {
                  trade_job: {
                    id: { in: jobIds },
                  },
                },
                select: {
                  id: true,
                  executed_qty: true,
                  avg_price: true,
                  cumm_quote_qty: true,
                  fee_amount: true,
                  fee_currency: true,
                  exchange_order_id: true,
                  created_at: true,
                  trade_job: {
                    select: {
                      id: true,
                      side: true,
                      symbol: true,
                      order_type: true,
                    },
                  },
                },
              });

              totalExecutionsChecked += executions.length;

              // Verificar cada execução
              for (const execution of executions) {
                if (!execution.exchange_order_id) {
                  continue;
                }

                try {
                  // Buscar ordem na exchange
                  let order: any;
                  let orderFromTrades = false;
                  try {
                    if (account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
                      order = await adapter.fetchClosedOrder(execution.exchange_order_id, execution.trade_job.symbol);
                    } else {
                      // Para Binance, não passar parâmetros extras (não aceita acknowledged)
                      const params = account.exchange === 'BINANCE_SPOT' ? undefined : { acknowledged: true };
                      order = await adapter.fetchOrder(execution.exchange_order_id, execution.trade_job.symbol, params);
                    }
                  } catch (orderError: any) {
                    // Se for erro de ordem arquivada na Binance (código -2026), tentar buscar via fetchMyTrades
                    if (
                      account.exchange === 'BINANCE_SPOT' && 
                      (orderError.message?.includes('-2026') || 
                       orderError.message?.includes('archived') ||
                       orderError.message?.includes('over 90 days'))
                    ) {
                      try {
                        // Calcular período: usar filtro de data se disponível, senão usar 1 hora antes da execução até agora
                        const since = dateFrom 
                          ? dateFrom.getTime() 
                          : (execution.created_at.getTime() - 3600000); // 1 hora antes
                        const until = dateTo 
                          ? dateTo.getTime() 
                          : Date.now();
                        
                        console.log(`[ADMIN] Ordem ${execution.exchange_order_id} arquivada, buscando via fetchMyTrades (período: ${new Date(since).toISOString()} até ${new Date(until).toISOString()})`);
                        
                        // Buscar trades do período
                        const trades = await adapter.fetchMyTrades(execution.trade_job.symbol, since, 1000);
                        
                        // Procurar trades que correspondem ao ID da ordem
                        const orderTrades = trades.filter((t: any) => {
                          const tradeOrderId = String(t.order || t.orderId || (t.info && (t.info.orderId || t.info.orderListId)) || '');
                          return tradeOrderId === String(execution.exchange_order_id);
                        });

                        if (orderTrades.length === 0) {
                          errors.push({
                            executionId: execution.id,
                            error: `Ordem ${execution.exchange_order_id} não encontrada via fetchMyTrades no período especificado`,
                          });
                          continue;
                        }

                        // Construir objeto order a partir dos trades
                        const totalFilled = orderTrades.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
                        const totalCost = orderTrades.reduce((sum: number, t: any) => sum + (t.cost || (t.amount || 0) * (t.price || 0)), 0);
                        const avgPrice = totalFilled > 0 ? totalCost / totalFilled : 0;
                        
                        order = {
                          filled: totalFilled,
                          average: avgPrice,
                          price: avgPrice,
                          cost: totalCost,
                          status: 'closed',
                          fills: orderTrades,
                        };
                        orderFromTrades = true;
                        console.log(`[ADMIN] Ordem ${execution.exchange_order_id} reconstruída via fetchMyTrades: qty=${totalFilled}, price=${avgPrice}`);
                      } catch (tradesError: any) {
                        errors.push({
                          executionId: execution.id,
                          error: `Erro ao buscar ordem arquivada via fetchMyTrades: ${tradesError.message}`,
                        });
                        continue;
                      }
                    } else {
                      errors.push({
                        executionId: execution.id,
                        error: `Erro ao buscar ordem na exchange: ${orderError.message}`,
                      });
                      continue;
                    }
                  }

                  // Comparar quantidade executada
                  const dbQty = execution.executed_qty.toNumber();
                  const exchangeQty = order.filled || 0;
                  if (Math.abs(dbQty - exchangeQty) > 0.00000001) {
                    discrepancies.push({
                      type: 'QUANTITY',
                      entityType: 'EXECUTION',
                      entityId: execution.id,
                      field: 'executed_qty',
                      currentValue: dbQty,
                      expectedValue: exchangeQty,
                      canAutoFix: true,
                      fixDescription: `Quantidade executada: ${dbQty} -> ${exchangeQty}`,
                    });
                  }

                  // Comparar preço médio
                  const dbPrice = execution.avg_price.toNumber();
                  const exchangePrice = order.average || order.price || 0;
                  if (exchangePrice > 0 && Math.abs(dbPrice - exchangePrice) > dbPrice * 0.001) {
                    discrepancies.push({
                      type: 'PRICE',
                      entityType: 'EXECUTION',
                      entityId: execution.id,
                      field: 'avg_price',
                      currentValue: dbPrice,
                      expectedValue: exchangePrice,
                      canAutoFix: true,
                      fixDescription: `Preço médio: ${dbPrice} -> ${exchangePrice}`,
                    });
                  }

                  // Buscar taxas via fetchMyTrades (se ainda não foi usado para reconstruir a ordem)
                  let realFeeAmount = 0;
                  let realFeeCurrency = '';
                  if (orderFromTrades && order.fills) {
                    // Já temos os trades da ordem, usar diretamente
                    const fees = adapter.extractFeesFromTrades(order.fills);
                    realFeeAmount = fees.feeAmount;
                    realFeeCurrency = fees.feeCurrency;
                  } else {
                    try {
                      // Calcular período: usar filtro de data se disponível, senão usar 1 hora antes da execução até agora
                      const since = dateFrom 
                        ? dateFrom.getTime() 
                        : (execution.created_at.getTime() - 3600000); // 1 hora antes
                      const trades = await adapter.fetchMyTrades(execution.trade_job.symbol, since, 100);
                      const orderTrades = trades.filter((t: any) => {
                        return t.order === execution.exchange_order_id || 
                               t.orderId === execution.exchange_order_id || 
                               (t.info && (t.info.orderId === execution.exchange_order_id || t.info.orderListId === execution.exchange_order_id));
                      });
                      
                      if (orderTrades.length > 0) {
                        const fees = adapter.extractFeesFromTrades(orderTrades);
                        realFeeAmount = fees.feeAmount;
                        realFeeCurrency = fees.feeCurrency;
                      }
                    } catch (tradesError: any) {
                      // Se não conseguir buscar trades, tentar extrair da ordem
                      const fees = adapter.extractFeesFromOrder(order, execution.trade_job.side.toLowerCase() as 'buy' | 'sell');
                      realFeeAmount = fees.feeAmount;
                      realFeeCurrency = fees.feeCurrency;
                    }
                  }

                  // Comparar taxa
                  const dbFeeAmount = execution.fee_amount?.toNumber() || 0;
                  const dbFeeCurrency = execution.fee_currency || '';
                  
                  if (realFeeAmount > 0) {
                    if (Math.abs(dbFeeAmount - realFeeAmount) > 0.00000001 || dbFeeCurrency !== realFeeCurrency) {
                      discrepancies.push({
                        type: 'FEE_AMOUNT',
                        entityType: 'EXECUTION',
                        entityId: execution.id,
                        field: 'fee_amount',
                        currentValue: `${dbFeeAmount} ${dbFeeCurrency}`,
                        expectedValue: `${realFeeAmount} ${realFeeCurrency}`,
                        canAutoFix: true,
                        fixDescription: `Taxa: ${dbFeeAmount} ${dbFeeCurrency} -> ${realFeeAmount} ${realFeeCurrency}`,
                      });
                    }
                  }
                } catch (execError: any) {
                  errors.push({
                    executionId: execution.id,
                    error: `Erro ao auditar execução: ${execError.message}`,
                  });
                }
              }

              // Verificar consistência da posição
              // Soma dos fills de BUY
              let totalBuyQty = 0;
              let totalFeesBuyUsd = 0;
              let totalSellQty = 0;
              let totalFeesSellUsd = 0;

              const baseAsset = position.symbol.split('/')[0];
              const quoteAsset = position.symbol.split('/')[1] || 'USDT';

              for (const fill of position.fills) {
                const fillExec = fill.execution;
                if (fill.side === 'BUY' && fillExec) {
                  totalBuyQty += fillExec.executed_qty.toNumber();
                  
                  if (fillExec.fee_amount) {
                    const feeAmt = fillExec.fee_amount.toNumber();
                    const feeCur = fillExec.fee_currency || '';
                    if (feeCur === baseAsset) {
                      totalFeesBuyUsd += feeAmt * fillExec.avg_price.toNumber();
                    } else if (feeCur === quoteAsset || feeCur === 'USDT' || feeCur === 'USD') {
                      totalFeesBuyUsd += feeAmt;
                    }
                  }
                } else if (fill.side === 'SELL' && fillExec) {
                  totalSellQty += fill.qty.toNumber();
                  
                  if (fillExec.fee_amount) {
                    const feeAmt = fillExec.fee_amount.toNumber();
                    const feeCur = fillExec.fee_currency || '';
                    if (feeCur === quoteAsset || feeCur === 'USDT' || feeCur === 'USD') {
                      totalFeesSellUsd += feeAmt;
                    } else {
                      totalFeesSellUsd += feeAmt * fill.price.toNumber();
                    }
                  }
                }
              }

              const dbQtyTotal = position.qty_total.toNumber();
              const dbQtyRemaining = position.qty_remaining.toNumber();
              const dbFeesBuyUsd = position.fees_on_buy_usd?.toNumber() || 0;
              const dbFeesSellUsd = position.fees_on_sell_usd?.toNumber() || 0;

              // Verificar quantidade total
              if (Math.abs(dbQtyTotal - totalBuyQty) > 0.00000001) {
                discrepancies.push({
                  type: 'POSITION_QTY',
                  entityType: 'POSITION',
                  entityId: position.id,
                  field: 'qty_total',
                  currentValue: dbQtyTotal,
                  expectedValue: totalBuyQty,
                  canAutoFix: true,
                  fixDescription: `Quantidade total: ${dbQtyTotal} -> ${totalBuyQty} (soma dos fills)`,
                });
              }

              // Verificar quantidade restante
              const expectedRemaining = Math.max(0, totalBuyQty - totalSellQty);
              if (Math.abs(dbQtyRemaining - expectedRemaining) > 0.00000001) {
                discrepancies.push({
                  type: 'POSITION_QTY',
                  entityType: 'POSITION',
                  entityId: position.id,
                  field: 'qty_remaining',
                  currentValue: dbQtyRemaining,
                  expectedValue: expectedRemaining,
                  canAutoFix: true,
                  fixDescription: `Quantidade restante: ${dbQtyRemaining} -> ${expectedRemaining}`,
                });
              }

              // Verificar taxas
              if (Math.abs(dbFeesBuyUsd - totalFeesBuyUsd) > 0.01) {
                discrepancies.push({
                  type: 'POSITION_FEES',
                  entityType: 'POSITION',
                  entityId: position.id,
                  field: 'fees_on_buy_usd',
                  currentValue: dbFeesBuyUsd,
                  expectedValue: totalFeesBuyUsd,
                  canAutoFix: true,
                  fixDescription: `Taxas de compra: ${dbFeesBuyUsd.toFixed(4)} -> ${totalFeesBuyUsd.toFixed(4)} USD`,
                });
              }

              if (Math.abs(dbFeesSellUsd - totalFeesSellUsd) > 0.01) {
                discrepancies.push({
                  type: 'POSITION_FEES',
                  entityType: 'POSITION',
                  entityId: position.id,
                  field: 'fees_on_sell_usd',
                  expectedValue: totalFeesSellUsd,
                  currentValue: dbFeesSellUsd,
                  canAutoFix: true,
                  fixDescription: `Taxas de venda: ${dbFeesSellUsd.toFixed(4)} -> ${totalFeesSellUsd.toFixed(4)} USD`,
                });
              }
            } catch (error: any) {
              errors.push({
                positionId: position.id,
                error: `Erro ao auditar posição: ${error.message}`,
              });
            }
          })
        );

        console.log(`[ADMIN] Lote ${batchIndex + 1}/${batches.length} concluído: ${discrepancies.length} discrepância(s) encontrada(s) até agora, ${errors.length} erro(s)`);
      }

      // Detectar posições duplicadas
      if (!checkJobsOnlyFlag) {
        console.log('[ADMIN] Verificando posições duplicadas...');
        
        // Buscar todas as posições para verificar duplicatas
        const allPositionsForDupCheck = await this.prisma.tradePosition.findMany({
          where: {
            ...(accountIdNum && { exchange_account_id: accountIdNum }),
            ...(dateFrom || dateTo ? {
              created_at: {
                ...(dateFrom && { gte: dateFrom }),
                ...(dateTo && { lte: dateTo }),
              },
            } : {}),
          },
          select: {
            id: true,
            trade_job_id_open: true,
            status: true,
            created_at: true,
          },
          orderBy: {
            created_at: 'asc',
          },
        });

        // Filtrar apenas posições com trade_job_id_open não nulo
        const positionsWithJobId = allPositionsForDupCheck.filter(pos => pos.trade_job_id_open !== null);

        // Agrupar por trade_job_id_open para encontrar duplicatas
        const positionsByJob = new Map<number, typeof positionsWithJobId>();
        for (const pos of positionsWithJobId) {
          if (pos.trade_job_id_open !== null) {
            if (!positionsByJob.has(pos.trade_job_id_open)) {
              positionsByJob.set(pos.trade_job_id_open, []);
            }
            positionsByJob.get(pos.trade_job_id_open)!.push(pos);
          }
        }

        // Verificar duplicatas
        for (const [jobId, positions] of positionsByJob.entries()) {
          if (positions.length > 1) {
            const firstPosition = positions[0];
            const duplicatePositions = positions.slice(1);
            
            for (const dupPos of duplicatePositions) {
              discrepancies.push({
                type: 'DUPLICATE_POSITION',
                entityType: 'POSITION',
                entityId: dupPos.id,
                field: 'trade_job_id_open',
                currentValue: `posição #${dupPos.id} (duplicada)`,
                expectedValue: `posição #${firstPosition.id} (original)`,
                canAutoFix: false,
                fixDescription: `Posição #${dupPos.id} é duplicada. Posição original: #${firstPosition.id} (job ${jobId})`,
              });
            }
          }
        }

        // Verificar posições com mesmo exchange_order_id via fills
        const allPositions = await this.prisma.tradePosition.findMany({
          where: {
            ...(accountIdNum && { exchange_account_id: accountIdNum }),
            ...(dateFrom || dateTo ? {
              created_at: {
                ...(dateFrom && { gte: dateFrom }),
                ...(dateTo && { lte: dateTo }),
              },
            } : {}),
          },
          include: {
            fills: {
              include: {
                execution: {
                  select: {
                    exchange_order_id: true,
                  },
                },
              },
            },
          },
        });

        const orderIdToPositions = new Map<string, number[]>();
        for (const pos of allPositions) {
          for (const fill of pos.fills) {
            if (fill.execution?.exchange_order_id) {
              const orderId = fill.execution.exchange_order_id;
              if (!orderIdToPositions.has(orderId)) {
                orderIdToPositions.set(orderId, []);
              }
              if (!orderIdToPositions.get(orderId)!.includes(pos.id)) {
                orderIdToPositions.get(orderId)!.push(pos.id);
              }
            }
          }
        }

        for (const [orderId, positionIds] of orderIdToPositions.entries()) {
          if (positionIds.length > 1) {
            const firstPositionId = positionIds[0];
            for (let i = 1; i < positionIds.length; i++) {
              discrepancies.push({
                type: 'DUPLICATE_ORDER_ID_POSITION',
                entityType: 'POSITION',
                entityId: positionIds[i],
                field: 'exchange_order_id',
                currentValue: `posição #${positionIds[i]} (duplicada)`,
                expectedValue: `posição #${firstPositionId} (original)`,
                canAutoFix: false,
                fixDescription: `Posição #${positionIds[i]} tem exchange_order_id ${orderId} duplicado. Posição original: #${firstPositionId}`,
              });
            }
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Auditoria concluída em ${duration}ms: ${totalPositionsChecked} posições, ${totalExecutionsChecked} execuções, ${totalJobsChecked} jobs, ${discrepancies.length} discrepância(s), ${errors.length} erro(s)`);
      
      const response = {
        total_positions_checked: totalPositionsChecked,
        total_executions_checked: totalExecutionsChecked,
        total_jobs_checked: totalJobsChecked,
        discrepancies_found: discrepancies.length,
        discrepancies,
        errors: errors.length,
        error_details: errors,
        duration_ms: duration,
      };
      
      console.log(`[ADMIN] Preparando resposta: ${response.discrepancies_found} discrepâncias, ${response.errors} erros`);
      const responseSize = JSON.stringify(response).length;
      console.log(`[ADMIN] Tamanho da resposta: ${responseSize} bytes`);
      
      // Adicionar headers para ajudar o gateway a manter a conexão
      if (res) {
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=1800');
        res.setHeader('X-Response-Size', responseSize.toString());
      }
      
      return response;
    } catch (error: any) {
      console.error('[ADMIN] Erro na auditoria:', error);
      throw error;
    }
  }

  @Post('system/audit-exchange-trades')
  @ApiOperation({
    summary: 'Auditar trades da exchange vs sistema',
    description: 'Compara trades da exchange (BUY/SELL) com executions do sistema no período especificado, identificando faltantes, duplicados e jobs sem exchange_order_id.',
  })
  @ApiResponse({
    status: 200,
    description: 'Auditoria de trades concluída',
  })
  async auditExchangeTrades(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('autoDelete') autoDelete?: string
  ) {
    if (!accountId) {
      throw new BadRequestException('accountId é obrigatório para auditoria de trades da exchange');
    }

    const accountIdNum = parseInt(accountId);
    const dateFrom = from ? new Date(from) : undefined;
    const dateTo = to ? new Date(to) : undefined;
    const autoDeleteFlag = autoDelete === 'true' || autoDelete === '1';

    if (!dateFrom || !dateTo) {
      throw new BadRequestException('from e to são obrigatórios para auditoria de trades da exchange');
    }

    console.log(`[ADMIN] Iniciando auditoria de trades da exchange para conta ${accountIdNum}...`);
    console.log(`[ADMIN] Período: ${dateFrom.toISOString()} até ${dateTo.toISOString()}`);

    const startTime = Date.now();
    const errors: Array<{ symbol?: string; error: string }> = [];

    try {
      // Buscar conta
      const account = await this.prisma.exchangeAccount.findUnique({
        where: { id: accountIdNum },
        select: {
          id: true,
          exchange: true,
          api_key_enc: true,
          api_secret_enc: true,
          testnet: true,
          is_simulation: true,
        },
      });

      if (!account) {
        throw new NotFoundException(`ExchangeAccount ${accountIdNum} not found`);
      }

      if (account.is_simulation) {
        throw new BadRequestException('Não é possível auditar trades de conta de simulação');
      }

      if (!account.api_key_enc || !account.api_secret_enc) {
        throw new BadRequestException('Conta sem API keys configuradas');
      }

      // Descriptografar API keys
      const apiKey = await this.encryptionService.decrypt(account.api_key_enc);
      const apiSecret = await this.encryptionService.decrypt(account.api_secret_enc);

      // Criar adapter
      const adapter = AdapterFactory.createAdapter(
        account.exchange as ExchangeType,
        apiKey,
        apiSecret,
        { testnet: account.testnet }
      );

      // Buscar símbolos únicos da conta no período (via jobs ou executions)
      const executions = await this.prisma.tradeExecution.findMany({
        where: {
          exchange_account_id: accountIdNum,
          created_at: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        include: {
          trade_job: {
            select: {
              symbol: true,
              side: true,
            },
          },
        },
        distinct: ['trade_job_id'],
      });

      const symbols = new Set<string>();
      executions.forEach(exec => {
        if (exec.trade_job?.symbol) {
          symbols.add(exec.trade_job.symbol);
        }
      });

      // Se não encontrou símbolos via executions, buscar via jobs
      if (symbols.size === 0) {
        const jobs = await this.prisma.tradeJob.findMany({
          where: {
            exchange_account_id: accountIdNum,
            created_at: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          select: {
            symbol: true,
          },
          distinct: ['symbol'],
        });

        jobs.forEach(job => {
          if (job.symbol) {
            symbols.add(job.symbol);
          }
        });
      }

      console.log(`[ADMIN] Encontrados ${symbols.size} símbolo(s) único(s) para auditar: ${Array.from(symbols).join(', ')}`);

      // Buscar executions do sistema no período
      const systemExecutions = await this.prisma.tradeExecution.findMany({
        where: {
          exchange_account_id: accountIdNum,
          created_at: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        include: {
          trade_job: {
            select: {
              id: true,
              side: true,
              symbol: true,
              status: true,
            },
          },
        },
      });

      console.log(`[ADMIN] Encontradas ${systemExecutions.length} execuções no sistema no período`);

      // Agrupar executions por exchange_order_id
      const executionsByOrderId = new Map<string, typeof systemExecutions>();
      const executionsWithoutOrderId: typeof systemExecutions = [];

      for (const exec of systemExecutions) {
        if (exec.exchange_order_id) {
          if (!executionsByOrderId.has(exec.exchange_order_id)) {
            executionsByOrderId.set(exec.exchange_order_id, []);
          }
          executionsByOrderId.get(exec.exchange_order_id)!.push(exec);
        } else {
          executionsWithoutOrderId.push(exec);
        }
      }

      // Buscar trades da exchange para cada símbolo
      const exchangeTradesByOrderId = new Map<string, any[]>();
      let totalExchangeTrades = 0;
      let exchangeBuyCount = 0;
      let exchangeSellCount = 0;

      const since = dateFrom.getTime();
      const until = dateTo.getTime();

      for (const symbol of symbols) {
        try {
          console.log(`[ADMIN] Buscando trades da exchange para ${symbol}...`);
          
          // Buscar trades do período (pode precisar fazer múltiplas chamadas se houver limite)
          const trades = await adapter.fetchMyTrades(symbol, since, 1000);
          
          // Filtrar trades do período
          const periodTrades = trades.filter((t: any) => {
            const tradeTime = t.timestamp || t.datetime || 0;
            return tradeTime >= since && tradeTime <= until;
          });

          console.log(`[ADMIN] Encontrados ${periodTrades.length} trade(s) da exchange para ${symbol} no período`);

          for (const trade of periodTrades) {
            const orderId = String(trade.order || trade.orderId || (trade.info && (trade.info.orderId || trade.info.orderListId)) || '');
            
            if (orderId && orderId !== 'undefined' && orderId !== 'null') {
              if (!exchangeTradesByOrderId.has(orderId)) {
                exchangeTradesByOrderId.set(orderId, []);
              }
              exchangeTradesByOrderId.get(orderId)!.push(trade);
              
              totalExchangeTrades++;
              const side = trade.side?.toUpperCase() || (trade.amount > 0 ? 'BUY' : 'SELL');
              if (side === 'BUY') {
                exchangeBuyCount++;
              } else {
                exchangeSellCount++;
              }
            }
          }
        } catch (symbolError: any) {
          console.error(`[ADMIN] Erro ao buscar trades para ${symbol}:`, symbolError.message);
          errors.push({
            symbol,
            error: `Erro ao buscar trades: ${symbolError.message}`,
          });
        }
      }

      console.log(`[ADMIN] Total de trades da exchange encontrados: ${totalExchangeTrades} (${exchangeBuyCount} BUY, ${exchangeSellCount} SELL)`);
      console.log(`[ADMIN] Total de order IDs únicos na exchange: ${exchangeTradesByOrderId.size}`);

      // Identificar trades faltando no sistema (na exchange mas não no sistema)
      const missingInSystem: Array<{
        order_id: string;
        side: 'BUY' | 'SELL';
        symbol: string;
        qty: number;
        price: number;
        timestamp: string;
        trades_count: number;
      }> = [];

      for (const [orderId, trades] of exchangeTradesByOrderId.entries()) {
        if (!executionsByOrderId.has(orderId)) {
          // Trade na exchange mas não no sistema
          const firstTrade = trades[0];
          const side = (firstTrade.side?.toUpperCase() || 'BUY') as 'BUY' | 'SELL';
          const symbol = firstTrade.symbol || firstTrade.info?.symbol || 'UNKNOWN';
          const totalQty = trades.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
          const totalCost = trades.reduce((sum: number, t: any) => sum + (t.cost || (t.amount || 0) * (t.price || 0)), 0);
          const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
          const timestamp = firstTrade.timestamp || firstTrade.datetime || Date.now();

          missingInSystem.push({
            order_id: orderId,
            side,
            symbol,
            qty: totalQty,
            price: avgPrice,
            timestamp: new Date(timestamp).toISOString(),
            trades_count: trades.length,
          });
        }
      }

      // Identificar executions a mais no sistema (no sistema mas não na exchange)
      // E validar se orderIds realmente existem na exchange
      const extraInSystem: Array<{
        execution_id: number;
        job_id: number;
        exchange_order_id: string;
        side: 'BUY' | 'SELL';
        symbol: string;
        validation_error?: string;
        values_mismatch?: boolean;
      }> = [];

      for (const [orderId, execs] of executionsByOrderId.entries()) {
        // Ignorar DUST orders (não existem na exchange)
        if (String(orderId).startsWith('DUST-')) {
          continue;
        }

        if (!exchangeTradesByOrderId.has(orderId)) {
          // Execution no sistema mas não na exchange - validar se realmente não existe
          for (const exec of execs) {
            let validationError: string | undefined;
            let orderExists = false;

            try {
              // Tentar buscar ordem na exchange
              const order = await adapter.fetchOrder(orderId, exec.trade_job.symbol);
              if (order && order.id) {
                orderExists = true;
                // Se encontrou, verificar valores
                const exchangeQty = order.filled || order.amount || 0;
                const exchangePrice = order.average || order.price || 0;
                const systemQty = exec.executed_qty.toNumber();
                const systemPrice = exec.avg_price.toNumber();

                const qtyDiff = Math.abs(exchangeQty - systemQty);
                const priceDiff = Math.abs(exchangePrice - systemPrice);
                const qtyTolerance = systemQty * 0.001; // 0.1% de tolerância
                const priceTolerance = systemPrice * 0.001; // 0.1% de tolerância

                if (qtyDiff > qtyTolerance || priceDiff > priceTolerance) {
                  validationError = `Valores diferentes: Qty (sistema: ${systemQty}, exchange: ${exchangeQty}), Price (sistema: ${systemPrice}, exchange: ${exchangePrice})`;
                }
              }
            } catch (orderError: any) {
              // Se for erro de ordem arquivada, tentar buscar via fetchMyTrades
              if (
                orderError.message?.includes('-2026') ||
                orderError.message?.includes('archived') ||
                orderError.message?.includes('over 90 days')
              ) {
                try {
                  const since = dateFrom.getTime();
                  const until = dateTo.getTime();
                  const trades = await adapter.fetchMyTrades(exec.trade_job.symbol, since, 1000);
                  const orderTrades = trades.filter((t: any) => {
                    const tradeOrderId = String(t.order || t.orderId || (t.info && (t.info.orderId || t.info.orderListId)) || '');
                    return tradeOrderId === String(orderId);
                  });

                  if (orderTrades.length > 0) {
                    orderExists = true;
                    // Comparar valores dos trades
                    const totalQty = orderTrades.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
                    const totalCost = orderTrades.reduce((sum: number, t: any) => sum + (t.cost || (t.amount || 0) * (t.price || 0)), 0);
                    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
                    const systemQty = exec.executed_qty.toNumber();
                    const systemPrice = exec.avg_price.toNumber();

                    const qtyDiff = Math.abs(totalQty - systemQty);
                    const priceDiff = Math.abs(avgPrice - systemPrice);
                    const qtyTolerance = systemQty * 0.001;
                    const priceTolerance = systemPrice * 0.001;

                    if (qtyDiff > qtyTolerance || priceDiff > priceTolerance) {
                      validationError = `Valores diferentes (arquivado): Qty (sistema: ${systemQty}, exchange: ${totalQty}), Price (sistema: ${systemPrice}, exchange: ${avgPrice})`;
                    }
                  } else {
                    validationError = `Order ID não encontrado na exchange (arquivada ou inválida)`;
                  }
                } catch (tradesError: any) {
                  validationError = `Erro ao validar: ${tradesError.message}`;
                }
              } else {
                validationError = `Erro ao buscar ordem: ${orderError.message}`;
              }
            }

            extraInSystem.push({
              execution_id: exec.id,
              job_id: exec.trade_job.id,
              exchange_order_id: orderId,
              side: exec.trade_job.side as 'BUY' | 'SELL',
              symbol: exec.trade_job.symbol,
              validation_error: validationError,
              values_mismatch: !!validationError && validationError.includes('Valores diferentes'),
            });
          }
        } else {
          // Order existe na exchange - comparar valores
          const exchangeTrades = exchangeTradesByOrderId.get(orderId) || [];
          if (exchangeTrades.length > 0) {
            const totalQty = exchangeTrades.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
            const totalCost = exchangeTrades.reduce((sum: number, t: any) => sum + (t.cost || (t.amount || 0) * (t.price || 0)), 0);
            const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

            for (const exec of execs) {
              const systemQty = exec.executed_qty.toNumber();
              const systemPrice = exec.avg_price.toNumber();

              const qtyDiff = Math.abs(totalQty - systemQty);
              const priceDiff = Math.abs(avgPrice - systemPrice);
              const qtyTolerance = systemQty * 0.001; // 0.1% de tolerância
              const priceTolerance = systemPrice * 0.001; // 0.1% de tolerância

              if (qtyDiff > qtyTolerance || priceDiff > priceTolerance) {
                // Adicionar à lista de extra se valores não batem (pode ser ordem diferente)
                extraInSystem.push({
                  execution_id: exec.id,
                  job_id: exec.trade_job.id,
                  exchange_order_id: orderId,
                  side: exec.trade_job.side as 'BUY' | 'SELL',
                  symbol: exec.trade_job.symbol,
                  validation_error: `Valores diferentes: Qty (sistema: ${systemQty}, exchange: ${totalQty}), Price (sistema: ${systemPrice}, exchange: ${avgPrice})`,
                  values_mismatch: true,
                });
              }
            }
          }
        }
      }

      // Identificar executions duplicados (mesmo exchange_order_id)
      // E verificar se valores são diferentes entre duplicados
      const duplicates: Array<{
        exchange_order_id: string;
        execution_ids: number[];
        job_ids: number[];
        count: number;
        values_differ?: boolean;
        execution_values?: Array<{ execution_id: number; qty: number; price: number }>;
      }> = [];

      for (const [orderId, execs] of executionsByOrderId.entries()) {
        if (execs.length > 1) {
          // Verificar se valores são diferentes entre duplicados
          const values = execs.map(e => ({
            execution_id: e.id,
            qty: e.executed_qty.toNumber(),
            price: e.avg_price.toNumber(),
          }));

          let valuesDiffer = false;
          const firstQty = values[0].qty;
          const firstPrice = values[0].price;

          for (let i = 1; i < values.length; i++) {
            const qtyDiff = Math.abs(values[i].qty - firstQty);
            const priceDiff = Math.abs(values[i].price - firstPrice);
            const qtyTolerance = firstQty * 0.001; // 0.1% de tolerância
            const priceTolerance = firstPrice * 0.001; // 0.1% de tolerância

            if (qtyDiff > qtyTolerance || priceDiff > priceTolerance) {
              valuesDiffer = true;
              break;
            }
          }

          duplicates.push({
            exchange_order_id: orderId,
            execution_ids: execs.map(e => e.id),
            job_ids: execs.map(e => e.trade_job.id),
            count: execs.length,
            values_differ: valuesDiffer,
            execution_values: valuesDiffer ? values : undefined,
          });
        }
      }

      // Identificar jobs sem exchange_order_id e validar jobs órfãos
      const jobsWithoutOrderId: Array<{
        job_id: number;
        symbol: string;
        side: 'BUY' | 'SELL';
        status: string;
        execution_id?: number;
      }> = [];

      const orphanJobs: Array<{
        job_id: number;
        symbol: string;
        side: 'BUY' | 'SELL';
        reason: string;
        execution_id?: number;
        order_id?: string;
      }> = [];

      const jobsWithoutExchange: Array<{
        job_id: number;
        order_id: string;
        symbol: string;
        side: 'BUY' | 'SELL';
      }> = [];

      const jobsFilled = await this.prisma.tradeJob.findMany({
        where: {
          exchange_account_id: accountIdNum,
          status: 'FILLED',
          created_at: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        include: {
          executions: {
            select: {
              id: true,
              exchange_order_id: true,
              executed_qty: true,
              avg_price: true,
            },
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      console.log(`[ADMIN] Validando ${jobsFilled.length} trade jobs FILLED...`);

      for (const job of jobsFilled) {
        const execution = job.executions[0];

        // Caso 1: Job sem executions
        if (!execution) {
          orphanJobs.push({
            job_id: job.id,
            symbol: job.symbol,
            side: job.side as 'BUY' | 'SELL',
            reason: 'Job FILLED sem executions',
          });
          continue;
        }

        // Caso 2: Job sem exchange_order_id
        if (!execution.exchange_order_id) {
          jobsWithoutOrderId.push({
            job_id: job.id,
            symbol: job.symbol,
            side: job.side as 'BUY' | 'SELL',
            status: job.status,
            execution_id: execution.id,
          });
          continue;
        }

        // Caso 3: Job com exchange_order_id DUST (não existe na exchange)
        if (String(execution.exchange_order_id).startsWith('DUST-')) {
          orphanJobs.push({
            job_id: job.id,
            symbol: job.symbol,
            side: job.side as 'BUY' | 'SELL',
            reason: 'Job com execution DUST (não existe na exchange)',
            execution_id: execution.id,
            order_id: execution.exchange_order_id,
          });
          continue;
        }

        // Caso 4: Validar se exchange_order_id existe na exchange
        try {
          const order = await adapter.fetchOrder(execution.exchange_order_id, job.symbol);
          
          if (!order || !order.id) {
            jobsWithoutExchange.push({
              job_id: job.id,
              order_id: execution.exchange_order_id,
              symbol: job.symbol,
              side: job.side as 'BUY' | 'SELL',
            });
          } else {
            // Validar valores (qty e price) - tolerância 0.1%
            const exchangeQty = order.filled || order.amount || 0;
            const exchangePrice = order.average || order.price || 0;
            const systemQty = execution.executed_qty.toNumber();
            const systemPrice = execution.avg_price.toNumber();

            const qtyDiff = Math.abs(exchangeQty - systemQty);
            const priceDiff = Math.abs(exchangePrice - systemPrice);
            const qtyTolerance = systemQty * 0.001;
            const priceTolerance = systemPrice * 0.001;

            if (qtyDiff > qtyTolerance || priceDiff > priceTolerance) {
              console.log(`[ADMIN] ⚠️ Job ${job.id}: valores diferentes (sistema: qty=${systemQty}, price=${systemPrice}, exchange: qty=${exchangeQty}, price=${exchangePrice})`);
            }
          }
        } catch (orderError: any) {
          // Se for erro de ordem arquivada, tentar buscar via fetchMyTrades
          if (
            orderError.message?.includes('-2026') ||
            orderError.message?.includes('archived') ||
            orderError.message?.includes('over 90 days')
          ) {
            try {
              const since = dateFrom.getTime();
              const until = dateTo.getTime();
              const trades = await adapter.fetchMyTrades(job.symbol, since, 1000);
              const orderTrades = trades.filter((t: any) => {
                const tradeOrderId = String(t.order || t.orderId || (t.info && (t.info.orderId || t.info.orderListId)) || '');
                return tradeOrderId === String(execution.exchange_order_id);
              });

              if (orderTrades.length === 0) {
                jobsWithoutExchange.push({
                  job_id: job.id,
                  order_id: execution.exchange_order_id,
                  symbol: job.symbol,
                  side: job.side as 'BUY' | 'SELL',
                });
              }
            } catch (tradesError: any) {
              jobsWithoutExchange.push({
                job_id: job.id,
                order_id: execution.exchange_order_id,
                symbol: job.symbol,
                side: job.side as 'BUY' | 'SELL',
              });
            }
          } else {
            // Ordem não encontrada
            jobsWithoutExchange.push({
              job_id: job.id,
              order_id: execution.exchange_order_id,
              symbol: job.symbol,
              side: job.side as 'BUY' | 'SELL',
            });
          }
        }
      }

      console.log(`[ADMIN] Jobs órfãos encontrados: ${orphanJobs.length}`);
      console.log(`[ADMIN] Jobs sem exchange_order_id: ${jobsWithoutOrderId.length}`);
      console.log(`[ADMIN] Jobs com order_id que não existe na exchange: ${jobsWithoutExchange.length}`);

      // Contar executions do sistema por lado
      const systemBuyCount = systemExecutions.filter(e => e.trade_job.side === 'BUY').length;
      const systemSellCount = systemExecutions.filter(e => e.trade_job.side === 'SELL').length;

      // Estatísticas de deleção e correção
      const deletions = {
        duplicates: 0,
        not_found: 0,
        canceled: 0,
        total: 0,
        errors: [] as Array<{ executionId: number; error: string }>,
      };

      const corrections = {
        jobs_without_order_id_fixed: 0,
        jobs_corrected: [] as Array<{ job_id: number; execution_id: number; order_id: string }>,
      };

      // Se autoDelete estiver habilitado, executar deleções e correções
      if (autoDeleteFlag) {
        console.log('[ADMIN] Modo autoDelete habilitado - iniciando deleções e correções...');

        // 1. Deletar executions duplicados
        for (const dup of duplicates) {
          if (dup.values_differ) {
            // Não deletar se valores são diferentes (precisa revisão manual)
            continue;
          }

          try {
            const executions = await this.prisma.tradeExecution.findMany({
              where: {
                exchange_order_id: dup.exchange_order_id,
                exchange_account_id: accountIdNum,
              },
              include: {
                position_fills: true,
              },
              orderBy: {
                created_at: 'desc',
              },
            });

            if (executions.length <= 1) {
              continue;
            }

            // Manter o mais recente, deletar os outros (apenas se não tiverem fills)
            const toKeep = executions[0];
            const toDelete = executions.slice(1).filter(e => e.position_fills.length === 0);

            for (const exec of toDelete) {
              try {
                await this.prisma.tradeExecution.delete({
                  where: { id: exec.id },
                });
                deletions.duplicates++;
                deletions.total++;
                console.log(`[ADMIN] ✅ Execution duplicada ${exec.id} deletada (orderId: ${dup.exchange_order_id})`);
              } catch (deleteError: any) {
                deletions.errors.push({
                  executionId: exec.id,
                  error: `Erro ao deletar: ${deleteError.message}`,
                });
                console.error(`[ADMIN] ❌ Erro ao deletar execution ${exec.id}:`, deleteError.message);
              }
            }
          } catch (error: any) {
            console.error(`[ADMIN] ❌ Erro ao processar duplicado ${dup.exchange_order_id}:`, error.message);
          }
        }

        // 2. Deletar executions que não existem na exchange ou estão canceladas
        for (const extra of extraInSystem) {
          try {
            const execution = await this.prisma.tradeExecution.findUnique({
              where: { id: extra.execution_id },
              include: {
                position_fills: true,
              },
            });

            if (!execution) {
              continue;
            }

            // NUNCA deletar se tiver fills vinculados
            if (execution.position_fills.length > 0) {
              deletions.errors.push({
                executionId: extra.execution_id,
                error: `Execution tem ${execution.position_fills.length} fill(s) vinculado(s), não pode ser deletada`,
              });
              continue;
            }

            // Verificar status da ordem na exchange
            let shouldDelete = false;
            let deleteReason = '';

            try {
              const order = await adapter.fetchOrder(extra.exchange_order_id, extra.symbol);
              
              if (order && order.id) {
                const status = String(order.status || '').toUpperCase();
                
                // Deletar apenas se status for CANCELED ou REJECTED
                if (status === 'CANCELED' || status === 'REJECTED') {
                  shouldDelete = true;
                  deleteReason = `Ordem ${status} na exchange`;
                  deletions.canceled++;
                } else if (status === 'NEW' || status === 'PENDING') {
                  // NÃO deletar ordens pendentes (podem estar sendo processadas)
                  deleteReason = `Ordem ${status} - não pode ser deletada`;
                } else if (status === 'FILLED' || status === 'PARTIALLY_FILLED') {
                  // Se valores são diferentes mas ordem está FILLED, não deletar (corrigir valores)
                  if (extra.values_mismatch) {
                    deleteReason = 'Ordem FILLED com valores diferentes - requer correção manual';
                  }
                }
              }
            } catch (orderError: any) {
              // Se ordem não existe, deletar
              if (
                orderError.message?.includes('not found') ||
                orderError.message?.includes('does not exist') ||
                orderError.message?.includes('-2013') ||
                (orderError.message?.includes('-2026') && !orderError.message?.includes('archived'))
              ) {
                // Tentar buscar em trades arquivados
                try {
                  const since = dateFrom.getTime();
                  const until = dateTo.getTime();
                  const trades = await adapter.fetchMyTrades(extra.symbol, since, 1000);
                  const orderTrades = trades.filter((t: any) => {
                    const tradeOrderId = String(t.order || t.orderId || (t.info && (t.info.orderId || t.info.orderListId)) || '');
                    return tradeOrderId === String(extra.exchange_order_id);
                  });

                  if (orderTrades.length === 0) {
                    shouldDelete = true;
                    deleteReason = 'Order ID não encontrado na exchange';
                    deletions.not_found++;
                  }
                } catch (tradesError: any) {
                  shouldDelete = true;
                  deleteReason = `Order ID não encontrado: ${tradesError.message}`;
                  deletions.not_found++;
                }
              } else if (
                orderError.message?.includes('-2026') ||
                orderError.message?.includes('archived') ||
                orderError.message?.includes('over 90 days')
              ) {
                // Ordem arquivada - tentar buscar em trades
                try {
                  const since = dateFrom.getTime();
                  const until = dateTo.getTime();
                  const trades = await adapter.fetchMyTrades(extra.symbol, since, 1000);
                  const orderTrades = trades.filter((t: any) => {
                    const tradeOrderId = String(t.order || t.orderId || (t.info && (t.info.orderId || t.info.orderListId)) || '');
                    return tradeOrderId === String(extra.exchange_order_id);
                  });

                  if (orderTrades.length === 0) {
                    shouldDelete = true;
                    deleteReason = 'Order ID não encontrado em trades arquivados';
                    deletions.not_found++;
                  }
                } catch (tradesError: any) {
                  // Se não encontrou em trades, não deletar (pode estar muito antiga)
                  deleteReason = 'Ordem arquivada - não encontrada em trades recentes';
                }
              } else {
                deleteReason = `Erro ao verificar ordem: ${orderError.message}`;
              }
            }

            if (shouldDelete) {
              try {
                await this.prisma.tradeExecution.delete({
                  where: { id: extra.execution_id },
                });
                deletions.total++;
                console.log(`[ADMIN] ✅ Execution ${extra.execution_id} deletada: ${deleteReason}`);
              } catch (deleteError: any) {
                deletions.errors.push({
                  executionId: extra.execution_id,
                  error: `Erro ao deletar: ${deleteError.message}`,
                });
                console.error(`[ADMIN] ❌ Erro ao deletar execution ${extra.execution_id}:`, deleteError.message);
              }
            } else if (deleteReason) {
              console.log(`[ADMIN] ⚠️ Execution ${extra.execution_id} não deletada: ${deleteReason}`);
            }
          } catch (error: any) {
            deletions.errors.push({
              executionId: extra.execution_id,
              error: `Erro ao processar: ${error.message}`,
            });
            console.error(`[ADMIN] ❌ Erro ao processar execution ${extra.execution_id}:`, error.message);
          }
        }

        // 3. Corrigir trades sem exchange_order_id comparando por horário e valor
        console.log('[ADMIN] Corrigindo trades sem exchange_order_id...');
        for (const jobInfo of jobsWithoutOrderId) {
          try {
            const job = await this.prisma.tradeJob.findUnique({
              where: { id: jobInfo.job_id },
              include: {
                executions: {
                  where: {
                    exchange_order_id: null,
                  },
                  orderBy: {
                    created_at: 'desc',
                  },
                  take: 1,
                },
              },
            });

            if (!job || !job.executions[0]) {
              continue;
            }

            const execution = job.executions[0];
            const jobCreatedAt = job.created_at.getTime();
            const timeWindow = 5 * 60 * 1000; // 5 minutos
            const since = jobCreatedAt - timeWindow;
            const until = jobCreatedAt + timeWindow;

            // Buscar trades da exchange no período
            const trades = await adapter.fetchMyTrades(job.symbol, since, 1000);
            
            // Filtrar trades do período e que correspondem ao side
            const candidateTrades = trades.filter((t: any) => {
              const tradeTime = t.timestamp || t.datetime || 0;
              const timeDiff = Math.abs(tradeTime - jobCreatedAt);
              if (timeDiff > timeWindow) {
                return false;
              }

              const tradeSide = (t.side?.toUpperCase() || (t.amount > 0 ? 'BUY' : 'SELL')) as 'BUY' | 'SELL';
              if (tradeSide !== job.side) {
                return false;
              }

              return true;
            });

            // Tentar encontrar match único por quantidade e preço
            const systemQty = execution.executed_qty.toNumber();
            const systemPrice = execution.avg_price.toNumber();
            const qtyTolerance = systemQty * 0.001; // 0.1%
            const priceTolerance = systemPrice * 0.001; // 0.1%

            const matchingTrades = candidateTrades.filter((t: any) => {
              const tradeQty = t.amount || 0;
              const tradePrice = t.price || 0;
              
              const qtyDiff = Math.abs(tradeQty - systemQty);
              const priceDiff = Math.abs(tradePrice - systemPrice);
              
              return qtyDiff <= qtyTolerance && priceDiff <= priceTolerance;
            });

            if (matchingTrades.length === 1) {
              // Match único encontrado - atualizar execution
              const matchedTrade = matchingTrades[0];
              const orderId = String(matchedTrade.order || matchedTrade.orderId || (matchedTrade.info && (matchedTrade.info.orderId || matchedTrade.info.orderListId)) || '');

              if (orderId && orderId !== 'undefined' && orderId !== 'null') {
                await this.prisma.tradeExecution.update({
                  where: { id: execution.id },
                  data: {
                    exchange_order_id: orderId,
                  },
                });

                corrections.jobs_without_order_id_fixed++;
                corrections.jobs_corrected.push({
                  job_id: job.id,
                  execution_id: execution.id,
                  order_id: orderId,
                });

                console.log(`[ADMIN] ✅ Job ${job.id} corrigido: execution ${execution.id} agora tem order_id ${orderId}`);
              }
            } else if (matchingTrades.length > 1) {
              console.log(`[ADMIN] ⚠️ Job ${job.id}: múltiplos matches encontrados (${matchingTrades.length}), requer revisão manual`);
            } else {
              console.log(`[ADMIN] ⚠️ Job ${job.id}: nenhum match encontrado para correção automática`);
            }
          } catch (error: any) {
            console.error(`[ADMIN] ❌ Erro ao corrigir job ${jobInfo.job_id}:`, error.message);
          }
        }

        console.log(`[ADMIN] Deleções concluídas: ${deletions.total} total (${deletions.duplicates} duplicados, ${deletions.not_found} não encontrados, ${deletions.canceled} cancelados)`);
        console.log(`[ADMIN] Correções concluídas: ${corrections.jobs_without_order_id_fixed} jobs corrigidos`);
      }

      const duration = Date.now() - startTime;
      // Validar posições duplicadas (mesmo trade_job_id_open)
      const duplicatePositions: Array<{
        job_id_open: number;
        position_ids: number[];
        created_at: string[];
      }> = [];

      const allPositions = await this.prisma.tradePosition.findMany({
        where: {
          exchange_account_id: accountIdNum,
          ...(dateFrom || dateTo ? {
            created_at: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          } : {}),
        },
        select: {
          id: true,
          trade_job_id_open: true,
          created_at: true,
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      // Filtrar apenas posições com trade_job_id_open não nulo
      const positionsWithJobId = allPositions.filter(pos => pos.trade_job_id_open !== null);

      // Agrupar por trade_job_id_open
      const positionsByJob = new Map<number, typeof positionsWithJobId>();
      for (const pos of positionsWithJobId) {
        if (pos.trade_job_id_open) {
          if (!positionsByJob.has(pos.trade_job_id_open)) {
            positionsByJob.set(pos.trade_job_id_open, []);
          }
          positionsByJob.get(pos.trade_job_id_open)!.push(pos);
        }
      }

      // Verificar duplicatas
      for (const [jobId, positions] of positionsByJob.entries()) {
        if (positions.length > 1) {
          const firstPosition = positions[0];
          const duplicatePositionsList = positions.slice(1);

          duplicatePositions.push({
            job_id_open: jobId,
            position_ids: [firstPosition.id, ...duplicatePositionsList.map(p => p.id)],
            created_at: [firstPosition.created_at.toISOString(), ...duplicatePositionsList.map(p => p.created_at.toISOString())],
          });
        }
      }

      // Validar trade jobs duplicados (mesmo exchange_order_id via executions)
      const duplicateJobs: Array<{
        order_id: string;
        job_ids: number[];
        created_at: string[];
        symbol: string;
        side: string;
      }> = [];

      // Agrupar jobs por exchange_order_id
      const jobsByOrderId = new Map<string, Array<{
        job_id: number;
        created_at: Date;
        symbol: string;
        side: string;
      }>>();

      for (const exec of systemExecutions) {
        if (exec.exchange_order_id && !String(exec.exchange_order_id).startsWith('DUST-')) {
          if (!jobsByOrderId.has(exec.exchange_order_id)) {
            jobsByOrderId.set(exec.exchange_order_id, []);
          }
          const jobInfo = {
            job_id: exec.trade_job.id,
            created_at: exec.created_at,
            symbol: exec.trade_job.symbol,
            side: exec.trade_job.side,
          };
          // Evitar duplicatas no array
          if (!jobsByOrderId.get(exec.exchange_order_id)!.some(j => j.job_id === jobInfo.job_id)) {
            jobsByOrderId.get(exec.exchange_order_id)!.push(jobInfo);
          }
        }
      }

      // Verificar duplicatas
      for (const [orderId, jobs] of jobsByOrderId.entries()) {
        if (jobs.length > 1) {
          // Ordenar por created_at (mais recente primeiro)
          const sortedJobs = jobs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
          
          duplicateJobs.push({
            order_id: orderId,
            job_ids: sortedJobs.map(j => j.job_id),
            created_at: sortedJobs.map(j => j.created_at.toISOString()),
            symbol: sortedJobs[0].symbol,
            side: sortedJobs[0].side,
          });
        }
      }

      console.log(`[ADMIN] Auditoria de trades concluída em ${duration}ms`);
      console.log(`[ADMIN] Trades faltando no sistema: ${missingInSystem.length}`);
      console.log(`[ADMIN] Executions a mais no sistema: ${extraInSystem.length}`);
      console.log(`[ADMIN] Executions duplicados: ${duplicates.length}`);
      console.log(`[ADMIN] Jobs sem exchange_order_id: ${jobsWithoutOrderId.length}`);
      console.log(`[ADMIN] Jobs órfãos: ${orphanJobs.length}`);
      console.log(`[ADMIN] Jobs com order_id inexistente na exchange: ${jobsWithoutExchange.length}`);
      console.log(`[ADMIN] Posições duplicadas: ${duplicatePositions.length}`);
      console.log(`[ADMIN] Trade jobs duplicados: ${duplicateJobs.length}`);

      return {
        account_id: accountIdNum,
        period: {
          from: dateFrom.toISOString(),
          to: dateTo.toISOString(),
        },
        exchange_trades: {
          buy_count: exchangeBuyCount,
          sell_count: exchangeSellCount,
          total_count: totalExchangeTrades,
        },
        system_executions: {
          buy_count: systemBuyCount,
          sell_count: systemSellCount,
          total_count: systemExecutions.length,
        },
        missing_in_system: missingInSystem,
        extra_in_system: extraInSystem,
        duplicates,
        jobs_without_order_id: jobsWithoutOrderId,
        orphan_jobs: orphanJobs,
        jobs_without_exchange: jobsWithoutExchange,
        duplicate_positions: duplicatePositions,
        duplicate_jobs: duplicateJobs,
        errors: errors.length > 0 ? errors : undefined,
        duration_ms: duration,
        ...(autoDeleteFlag ? {
          deletions: deletions.total > 0 ? deletions : undefined,
          corrections: corrections.jobs_without_order_id_fixed > 0 ? corrections : undefined,
        } : {}),
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na auditoria de trades:', error);
      throw error;
    }
  }

  @Post('system/audit-fix')
  @ApiOperation({
    summary: 'Aplicar correções de auditoria',
    description: 'Aplica correções selecionadas das discrepâncias encontradas na auditoria.',
  })
  @ApiResponse({
    status: 200,
    description: 'Correções aplicadas',
  })
  async auditFix(@Body() body: { corrections: Array<{
    type: string;
    entityType: 'EXECUTION' | 'POSITION' | 'JOB';
    entityId: number;
    field: string;
    expectedValue: number | string;
  }> }) {
    console.log('[ADMIN] Iniciando aplicação de correções de auditoria...');
    
    const startTime = Date.now();
    let fixed = 0;
    const errors: Array<{ correction: any; error: string }> = [];
    const positionService = new PositionService(this.prisma);

    try {
      const { corrections } = body;
      console.log(`[ADMIN] Aplicando ${corrections.length} correção(ões)`);

      // Agrupar correções por entidade
      const executionCorrections = new Map<number, any>();
      const positionCorrections = new Map<number, any>();
      const jobCorrections = new Map<number, any>();

      for (const correction of corrections) {
        if (correction.entityType === 'EXECUTION') {
          if (!executionCorrections.has(correction.entityId)) {
            executionCorrections.set(correction.entityId, {});
          }
          const execCorr = executionCorrections.get(correction.entityId)!;
          execCorr[correction.field] = correction.expectedValue;
        } else if (correction.entityType === 'POSITION') {
          if (!positionCorrections.has(correction.entityId)) {
            positionCorrections.set(correction.entityId, {});
          }
          const posCorr = positionCorrections.get(correction.entityId)!;
          posCorr[correction.field] = correction.expectedValue;
        } else if (correction.entityType === 'JOB') {
          if (!jobCorrections.has(correction.entityId)) {
            jobCorrections.set(correction.entityId, []);
          }
          jobCorrections.get(correction.entityId)!.push(correction);
        }
      }

      // Aplicar correções de execuções
      for (const [executionId, corrections] of executionCorrections.entries()) {
        try {
          const updateData: any = {};
          
          if (corrections.executed_qty !== undefined) {
            updateData.executed_qty = corrections.executed_qty;
          }
          if (corrections.avg_price !== undefined) {
            updateData.avg_price = corrections.avg_price;
          }
          if (corrections.fee_amount !== undefined) {
            // fee_amount pode vir como string "0.001 BTC" ou número
            if (typeof corrections.fee_amount === 'string') {
              const parts = corrections.fee_amount.split(' ');
              // ✅ BUG-ALTO-007 FIX: Validar parseFloat com limites
              updateData.fee_amount = this.safeParseFloat(parts[0], 0, 0, Number.MAX_SAFE_INTEGER);
              if (parts[1]) {
                updateData.fee_currency = parts[1];
              }
            } else {
              updateData.fee_amount = corrections.fee_amount;
            }
          }

          await this.prisma.tradeExecution.update({
            where: { id: executionId },
            data: updateData,
          });

          fixed++;
          console.log(`[ADMIN] ✅ Execução ${executionId} corrigida`);
        } catch (error: any) {
          errors.push({
            correction: { entityType: 'EXECUTION', entityId: executionId },
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao corrigir execução ${executionId}:`, error.message);
        }
      }

      // Aplicar correções de posições
      for (const [positionId, corrections] of positionCorrections.entries()) {
        try {
          // Recalcular posição pelos fills
          const position = await this.prisma.tradePosition.findUnique({
            where: { id: positionId },
            include: {
              fills: {
                include: {
                  execution: {
                    select: {
                      id: true,
                      executed_qty: true,
                      fee_amount: true,
                      fee_currency: true,
                      avg_price: true,
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

          if (!position) {
            errors.push({
              correction: { entityType: 'POSITION', entityId: positionId },
              error: 'Posição não encontrada',
            });
            continue;
          }

          const baseAsset = position.symbol.split('/')[0];
          const quoteAsset = position.symbol.split('/')[1] || 'USDT';

          // Recalcular pelos fills
          let totalBuyQty = 0;
          let totalSellQty = 0;
          let feesOnBuyUsd = 0;
          let feesOnSellUsd = 0;

          for (const fill of position.fills) {
            const fillExec = fill.execution;
            if (fill.side === 'BUY' && fillExec) {
              totalBuyQty += fillExec.executed_qty.toNumber();
              
              if (fillExec.fee_amount) {
                const feeAmt = fillExec.fee_amount.toNumber();
                const feeCur = fillExec.fee_currency || '';
                if (feeCur === baseAsset) {
                  feesOnBuyUsd += feeAmt * fillExec.avg_price.toNumber();
                } else if (feeCur === quoteAsset || feeCur === 'USDT' || feeCur === 'USD') {
                  feesOnBuyUsd += feeAmt;
                }
              }
            } else if (fill.side === 'SELL' && fillExec) {
              totalSellQty += fill.qty.toNumber();
              
              if (fillExec.fee_amount) {
                const feeAmt = fillExec.fee_amount.toNumber();
                const feeCur = fillExec.fee_currency || '';
                if (feeCur === quoteAsset || feeCur === 'USDT' || feeCur === 'USD') {
                  feesOnSellUsd += feeAmt;
                } else {
                  feesOnSellUsd += feeAmt * fill.price.toNumber();
                }
              }
            }
          }

          const updateData: any = {};
          
          if (corrections.qty_total !== undefined || corrections.qty_remaining !== undefined) {
            updateData.qty_total = corrections.qty_total !== undefined ? corrections.qty_total : totalBuyQty;
            updateData.qty_remaining = corrections.qty_remaining !== undefined 
              ? corrections.qty_remaining 
              : Math.max(0, totalBuyQty - totalSellQty);
          } else {
            // Se não especificado, recalcular
            updateData.qty_total = totalBuyQty;
            updateData.qty_remaining = Math.max(0, totalBuyQty - totalSellQty);
          }

          if (corrections.fees_on_buy_usd !== undefined || corrections.fees_on_sell_usd !== undefined) {
            updateData.fees_on_buy_usd = corrections.fees_on_buy_usd !== undefined ? corrections.fees_on_buy_usd : feesOnBuyUsd;
            updateData.fees_on_sell_usd = corrections.fees_on_sell_usd !== undefined ? corrections.fees_on_sell_usd : feesOnSellUsd;
            updateData.total_fees_paid_usd = updateData.fees_on_buy_usd + updateData.fees_on_sell_usd;
          } else {
            // Se não especificado, recalcular
            updateData.fees_on_buy_usd = feesOnBuyUsd;
            updateData.fees_on_sell_usd = feesOnSellUsd;
            updateData.total_fees_paid_usd = feesOnBuyUsd + feesOnSellUsd;
          }

          await this.prisma.tradePosition.update({
            where: { id: positionId },
            data: updateData,
          });

          fixed++;
          console.log(`[ADMIN] ✅ Posição ${positionId} corrigida`);
        } catch (error: any) {
          errors.push({
            correction: { entityType: 'POSITION', entityId: positionId },
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao corrigir posição ${positionId}:`, error.message);
        }
      }

      // Aplicar correções de jobs
      for (const [jobId, corrections] of jobCorrections.entries()) {
        try {
          const job = await this.prisma.tradeJob.findUnique({
            where: { id: jobId },
            include: {
              position_open: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          });

          if (!job) {
            errors.push({
              correction: { entityType: 'JOB', entityId: jobId },
              error: 'Job não encontrado',
            });
            continue;
          }

          for (const correction of corrections) {
            if (correction.type === 'GROUPED_JOB_MISMATCH') {
              // Buscar PositionGroupedJob para encontrar a posição correta
              const groupedJob = await this.prisma.positionGroupedJob.findFirst({
                where: {
                  trade_job_id: jobId,
                },
                include: {
                  position: {
                    select: {
                      id: true,
                      status: true,
                    },
                  },
                },
              });

              if (groupedJob && groupedJob.position.status === 'OPEN') {
                // Atualizar position_open para apontar para a posição correta
                await this.prisma.tradeJob.update({
                  where: { id: jobId },
                  data: {
                    position_open: {
                      connect: { id: groupedJob.position.id },
                    },
                  },
                });
                console.log(`[ADMIN] ✅ Job ${jobId}: position_open atualizado para posição ${groupedJob.position.id}`);
                fixed++;
              } else if (groupedJob) {
                errors.push({
                  correction: { entityType: 'JOB', entityId: jobId, type: correction.type },
                  error: `Posição ${groupedJob.position.id} está ${groupedJob.position.status}, não pode ser vinculada`,
                });
              } else {
                errors.push({
                  correction: { entityType: 'JOB', entityId: jobId, type: correction.type },
                  error: 'PositionGroupedJob não encontrado',
                });
              }
            } else if (correction.type === 'CLOSED_POSITION') {
              // Desconectar position_open se a posição está fechada
              if (job.position_open && job.position_open.status === 'CLOSED') {
                await this.prisma.tradeJob.update({
                  where: { id: jobId },
                  data: {
                    position_open: {
                      disconnect: true,
                    },
                  },
                });
                console.log(`[ADMIN] ✅ Job ${jobId}: position_open desconectado (posição estava fechada)`);
                fixed++;
              } else {
                console.log(`[ADMIN] ⚠️ Job ${jobId}: position_open não está conectado a posição fechada, pulando`);
              }
            } else if (correction.type === 'MISSING_POSITION') {
              // Para MISSING_POSITION, tentar encontrar posição existente ou criar nova
              // Por enquanto, apenas logar - criação automática de posição pode ser perigosa
              console.log(`[ADMIN] ⚠️ Job ${jobId}: MISSING_POSITION - correção automática não implementada (requer análise manual)`);
              errors.push({
                correction: { entityType: 'JOB', entityId: jobId, type: correction.type },
                error: 'Correção automática de MISSING_POSITION não implementada - requer análise manual',
              });
            }
          }
        } catch (error: any) {
          errors.push({
            correction: { entityType: 'JOB', entityId: jobId },
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao corrigir job ${jobId}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Correções aplicadas em ${duration}ms: ${fixed} corrigida(s), ${errors.length} erro(s)`);

      return {
        total_corrections: corrections.length,
        fixed,
        errors: errors.length,
        error_details: errors,
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao aplicar correções:', error);
      throw error;
    }
  }

  @Post('system/fix-exchange-trades')
  @ApiOperation({
    summary: 'Corrigir discrepâncias de trades da exchange',
    description: 'Importa trades faltantes, remove executions extras e corrige duplicados identificados na auditoria de trades da exchange.',
  })
  @ApiResponse({
    status: 200,
    description: 'Correções aplicadas',
  })
  async fixExchangeTrades(@Body() body: {
    accountId: number;
    missingTrades?: Array<{
      orderId: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      price: number;
      qty: number;
      timestamp: string;
    }>;
    extraExecutionIds?: number[];
    duplicateOrderIds?: string[];
  }) {
    console.log('[ADMIN] Iniciando correção de trades da exchange...');
    
    const startTime = Date.now();
    const results = {
      missingImported: 0,
      extraDeleted: 0,
      duplicatesFixed: 0,
      errors: [] as Array<{ type: string; data: any; error: string }>,
    };

    try {
      const { accountId, missingTrades = [], extraExecutionIds = [], duplicateOrderIds = [] } = body;

      // Buscar conta
      const account = await this.prisma.exchangeAccount.findUnique({
        where: { id: accountId },
        select: {
          id: true,
          exchange: true,
          api_key_enc: true,
          api_secret_enc: true,
          testnet: true,
          is_simulation: true,
        },
      });

      if (!account) {
        throw new NotFoundException(`ExchangeAccount ${accountId} not found`);
      }

      if (account.is_simulation) {
        throw new BadRequestException('Não é possível corrigir trades de conta de simulação');
      }

      if (!account.api_key_enc || !account.api_secret_enc) {
        throw new BadRequestException('Conta sem API keys configuradas');
      }

      // Descriptografar API keys
      const apiKey = await this.encryptionService.decrypt(account.api_key_enc);
      const apiSecret = await this.encryptionService.decrypt(account.api_secret_enc);

      // Criar adapter
      const adapter = AdapterFactory.createAdapter(
        account.exchange as ExchangeType,
        apiKey,
        apiSecret,
        { testnet: account.testnet }
      );

      // 1. Importar trades faltantes
      for (const trade of missingTrades) {
        try {
          // Verificar se ordem existe na exchange
          let order;
          try {
            order = await adapter.fetchOrder(trade.orderId, trade.symbol);
          } catch (orderError: any) {
            // Se for erro de ordem arquivada, tentar buscar via fetchMyTrades
            if (
              orderError.message?.includes('-2026') ||
              orderError.message?.includes('archived') ||
              orderError.message?.includes('over 90 days')
            ) {
              const since = new Date(trade.timestamp).getTime() - 3600000; // 1 hora antes
              const trades = await adapter.fetchMyTrades(trade.symbol, since, 1000);
              const orderTrades = trades.filter((t: any) => {
                const tradeOrderId = String(t.order || t.orderId || (t.info && (t.info.orderId || t.info.orderListId)) || '');
                return tradeOrderId === String(trade.orderId);
              });

              if (orderTrades.length === 0) {
                throw new Error(`Order ${trade.orderId} não encontrada na exchange`);
              }

              // Construir objeto order a partir dos trades
              const totalFilled = orderTrades.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
              const totalCost = orderTrades.reduce((sum: number, t: any) => sum + (t.cost || (t.amount || 0) * (t.price || 0)), 0);
              const avgPrice = totalFilled > 0 ? totalCost / totalFilled : trade.price;
              order = {
                id: trade.orderId,
                status: 'closed',
                filled: totalFilled,
                amount: totalFilled,
                cost: totalCost,
                average: avgPrice,
                price: avgPrice,
                side: trade.side.toLowerCase(),
                symbol: trade.symbol,
              };
            } else {
              throw orderError;
            }
          }

          if (!order || !order.id) {
            throw new Error(`Order ${trade.orderId} não encontrada na exchange`);
          }

          // Criar TradeJob
          const tradeJob = await this.prisma.tradeJob.create({
            data: {
              exchange_account_id: accountId,
              trade_mode: 'REAL',
              symbol: trade.symbol,
              side: trade.side,
              order_type: 'MARKET',
              status: 'FILLED',
              reason_code: 'AUDIT_IMPORT',
              reason_message: `Importado via auditoria - Order ID: ${trade.orderId}`,
            },
          });

          // Extrair taxas
          let feeAmount: number | null = null;
          let feeCurrency: string | null = null;
          try {
            const fees = adapter.extractFeesFromOrder(order, trade.side.toLowerCase() as 'buy' | 'sell');
            feeAmount = fees.feeAmount;
            feeCurrency = fees.feeCurrency;
          } catch (feeError: any) {
            console.warn(`[ADMIN] Erro ao extrair taxas: ${feeError.message}`);
          }

          // Criar TradeExecution
          const executedQty = order.filled || order.amount || trade.qty;
          const avgPrice = order.average || order.price || trade.price;
          const cummQuoteQty = order.cost || (executedQty * avgPrice);

          await this.prisma.tradeExecution.create({
            data: {
              trade_job_id: tradeJob.id,
              exchange_account_id: accountId,
              trade_mode: 'REAL',
              exchange: account.exchange,
              exchange_order_id: trade.orderId,
              client_order_id: `audit-import-${trade.orderId}`,
              status_exchange: order.status || 'closed',
              executed_qty: executedQty,
              cumm_quote_qty: cummQuoteQty,
              avg_price: avgPrice,
              fee_amount: feeAmount || undefined,
              fee_currency: feeCurrency || undefined,
              raw_response_json: JSON.parse(JSON.stringify(order)),
            },
          });

          // Se for BUY, tentar criar ou vincular posição
          if (trade.side === 'BUY') {
            try {
              const positionService = new PositionService(this.prisma);
              await positionService.onBuyExecuted(
                tradeJob.id,
                (await this.prisma.tradeExecution.findFirst({
                  where: { trade_job_id: tradeJob.id },
                  orderBy: { created_at: 'desc' },
                }))!.id,
                executedQty,
                avgPrice,
                feeAmount || undefined,
                feeCurrency || undefined
              );
            } catch (posError: any) {
              console.warn(`[ADMIN] Erro ao criar/vincular posição para job ${tradeJob.id}: ${posError.message}`);
            }
          }

          results.missingImported++;
          console.log(`[ADMIN] ✅ Trade faltante importado: Order ID ${trade.orderId}`);
        } catch (error: any) {
          results.errors.push({
            type: 'MISSING_TRADE',
            data: trade,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao importar trade ${trade.orderId}:`, error.message);
        }
      }

      // 2. Deletar executions extras
      for (const executionId of extraExecutionIds) {
        try {
          const execution = await this.prisma.tradeExecution.findUnique({
            where: { id: executionId },
            include: {
              position_fills: true,
            },
          });

          if (!execution) {
            results.errors.push({
              type: 'EXTRA_EXECUTION',
              data: { executionId },
              error: 'Execution não encontrada',
            });
            continue;
          }

          // Verificar se tem fills vinculados (não deve deletar se tiver)
          if (execution.position_fills.length > 0) {
            results.errors.push({
              type: 'EXTRA_EXECUTION',
              data: { executionId },
              error: `Execution tem ${execution.position_fills.length} fill(s) vinculado(s), não pode ser deletada`,
            });
            continue;
          }

          await this.prisma.tradeExecution.delete({
            where: { id: executionId },
          });

          results.extraDeleted++;
          console.log(`[ADMIN] ✅ Execution ${executionId} deletada`);
        } catch (error: any) {
          results.errors.push({
            type: 'EXTRA_EXECUTION',
            data: { executionId },
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao deletar execution ${executionId}:`, error.message);
        }
      }

      // 3. Corrigir duplicados
      for (const orderId of duplicateOrderIds) {
        try {
          // Buscar todas as executions com este orderId
          const executions = await this.prisma.tradeExecution.findMany({
            where: {
              exchange_order_id: orderId,
              exchange_account_id: accountId,
            },
            include: {
              position_fills: true,
            },
            orderBy: {
              created_at: 'desc',
            },
          });

          if (executions.length <= 1) {
            console.log(`[ADMIN] ⚠️ Order ID ${orderId} não tem duplicados, pulando`);
            continue;
          }

          // Manter a mais recente, deletar as outras (apenas se não tiverem fills)
          const toKeep = executions[0];
          const toDelete = executions.slice(1).filter(e => e.position_fills.length === 0);

          for (const exec of toDelete) {
            await this.prisma.tradeExecution.delete({
              where: { id: exec.id },
            });
            console.log(`[ADMIN] ✅ Execution duplicada ${exec.id} deletada (orderId: ${orderId})`);
          }

          if (toDelete.length > 0) {
            results.duplicatesFixed++;
          }

          // Se todas as executions têm fills, não podemos deletar
          const withFills = executions.filter(e => e.position_fills.length > 0);
          if (withFills.length > 1) {
            results.errors.push({
              type: 'DUPLICATE',
              data: { orderId, executionIds: withFills.map(e => e.id) },
              error: `${withFills.length} execution(s) duplicada(s) têm fills vinculados, não podem ser deletadas automaticamente`,
            });
          }
        } catch (error: any) {
          results.errors.push({
            type: 'DUPLICATE',
            data: { orderId },
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao corrigir duplicado ${orderId}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Correção de trades concluída em ${duration}ms: ${results.missingImported} importado(s), ${results.extraDeleted} deletado(s), ${results.duplicatesFixed} duplicado(s) corrigido(s), ${results.errors.length} erro(s)`);

      return {
        missing_imported: results.missingImported,
        extra_deleted: results.extraDeleted,
        duplicates_fixed: results.duplicatesFixed,
        errors: results.errors.length,
        error_details: results.errors,
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao corrigir trades da exchange:', error);
      throw error;
    }
  }

  @Post('system/audit-duplicates')
  @ApiOperation({
    summary: 'Auditar duplicatas de trade jobs e posições',
    description: 'Detecta trade jobs duplicados (mesmo exchange_order_id) e posições duplicadas (mesmo trade_job_id_open) no período especificado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de duplicatas encontradas',
  })
  async auditDuplicates(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string
  ) {
    console.log('[ADMIN] Iniciando auditoria de duplicatas...');

    const accountIdNum = accountId ? parseInt(accountId) : undefined;
    const dateFrom = from ? new Date(from) : undefined;
    const dateTo = to ? new Date(to) : undefined;

    if (!dateFrom || !dateTo) {
      throw new BadRequestException('from e to são obrigatórios para auditoria de duplicatas');
    }

    try {
      // 1. Detectar trade jobs duplicados
      const tradeJobsDuplicates: Array<{
        order_id: string;
        job_ids: number[];
        created_at: string[];
        symbol: string;
        side: string;
      }> = [];

      const jobsWithOrderId = await this.prisma.tradeJob.findMany({
        where: {
          ...(accountIdNum && { exchange_account_id: accountIdNum }),
          created_at: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        include: {
          executions: {
            select: {
              exchange_order_id: true,
            },
            take: 1,
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      // Agrupar jobs por exchange_order_id
      const jobsByOrderId = new Map<string, typeof jobsWithOrderId>();
      for (const job of jobsWithOrderId) {
        const orderId = job.executions[0]?.exchange_order_id;
        if (orderId && !String(orderId).startsWith('DUST-')) {
          if (!jobsByOrderId.has(orderId)) {
            jobsByOrderId.set(orderId, []);
          }
          jobsByOrderId.get(orderId)!.push(job);
        }
      }

      // Verificar duplicatas (mesmo order_id, mesmo symbol, mesmo side, criados em período próximo)
      for (const [orderId, jobs] of jobsByOrderId.entries()) {
        if (jobs.length > 1) {
          // Agrupar por symbol e side
          const jobsBySymbolSide = new Map<string, typeof jobs>();
          for (const job of jobs) {
            const key = `${job.symbol}_${job.side}`;
            if (!jobsBySymbolSide.has(key)) {
              jobsBySymbolSide.set(key, []);
            }
            jobsBySymbolSide.get(key)!.push(job);
          }

          // Verificar duplicatas em cada grupo
          for (const [key, groupJobs] of jobsBySymbolSide.entries()) {
            if (groupJobs.length > 1) {
              // Verificar se foram criados em período próximo (tolerância de 1 minuto)
              const sortedJobs = groupJobs.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
              const timeWindow = 60 * 1000; // 1 minuto

              for (let i = 0; i < sortedJobs.length; i++) {
                const currentJob = sortedJobs[i];
                const duplicates: typeof groupJobs = [currentJob];

                for (let j = i + 1; j < sortedJobs.length; j++) {
                  const otherJob = sortedJobs[j];
                  const timeDiff = Math.abs(otherJob.created_at.getTime() - currentJob.created_at.getTime());
                  
                  if (timeDiff <= timeWindow) {
                    duplicates.push(otherJob);
                  } else {
                    break;
                  }
                }

                if (duplicates.length > 1) {
                  tradeJobsDuplicates.push({
                    order_id: orderId,
                    job_ids: duplicates.map(j => j.id),
                    created_at: duplicates.map(j => j.created_at.toISOString()),
                    symbol: currentJob.symbol,
                    side: currentJob.side,
                  });
                  // Pular jobs já processados
                  i += duplicates.length - 1;
                }
              }
            }
          }
        }
      }

      // 2. Detectar posições duplicadas
      const positionsDuplicates: Array<{
        job_id_open: number;
        position_ids: number[];
        created_at: string[];
      }> = [];

      const allPositions = await this.prisma.tradePosition.findMany({
        where: {
          ...(accountIdNum && { exchange_account_id: accountIdNum }),
          ...(dateFrom || dateTo ? {
            created_at: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          } : {}),
        },
        select: {
          id: true,
          trade_job_id_open: true,
          created_at: true,
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      // Filtrar apenas posições com trade_job_id_open não nulo
      const positionsWithJobId = allPositions.filter(pos => pos.trade_job_id_open !== null);

      // Agrupar por trade_job_id_open
      const positionsByJob = new Map<number, typeof positionsWithJobId>();
      for (const pos of positionsWithJobId) {
        if (pos.trade_job_id_open) {
          if (!positionsByJob.has(pos.trade_job_id_open)) {
            positionsByJob.set(pos.trade_job_id_open, []);
          }
          positionsByJob.get(pos.trade_job_id_open)!.push(pos);
        }
      }

      // Verificar duplicatas
      for (const [jobId, positions] of positionsByJob.entries()) {
        if (positions.length > 1) {
          const firstPosition = positions[0];
          const duplicatePositions = positions.slice(1);

          positionsDuplicates.push({
            job_id_open: jobId,
            position_ids: [firstPosition.id, ...duplicatePositions.map(p => p.id)],
            created_at: [firstPosition.created_at.toISOString(), ...duplicatePositions.map(p => p.created_at.toISOString())],
          });
        }
      }

      console.log(`[ADMIN] Auditoria de duplicatas concluída: ${tradeJobsDuplicates.length} trade job(s) duplicado(s), ${positionsDuplicates.length} posição(ões) duplicada(s)`);

      return {
        trade_jobs_duplicates: tradeJobsDuplicates,
        positions_duplicates: positionsDuplicates,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na auditoria de duplicatas:', error);
      throw error;
    }
  }

  @Post('system/delete-duplicates')
  @ApiOperation({
    summary: 'Deletar duplicatas de executions, jobs e posições',
    description: 'Deleta executions, jobs e posições duplicadas com validações de segurança.',
  })
  @ApiResponse({
    status: 200,
    description: 'Duplicatas deletadas',
  })
  async deleteDuplicates(@Body() body: {
    executionIds?: number[];
    jobIds?: number[];
    positionIds?: number[];
  }) {
    console.log('[ADMIN] Iniciando deleção de duplicatas...');

    const { executionIds = [], jobIds = [], positionIds = [] } = body;

    const results = {
      executionsDeleted: 0,
      jobsDeleted: 0,
      positionsDeleted: 0,
      errors: [] as Array<{ type: string; id: number; error: string }>,
    };

    try {
      // 1. Deletar executions duplicados
      for (const executionId of executionIds) {
        try {
          const execution = await this.prisma.tradeExecution.findUnique({
            where: { id: executionId },
            include: {
              position_fills: true,
            },
          });

          if (!execution) {
            results.errors.push({
              type: 'EXECUTION',
              id: executionId,
              error: 'Execution não encontrada',
            });
            continue;
          }

          // Validar: só deletar se não tiver fills
          if (execution.position_fills.length > 0) {
            results.errors.push({
              type: 'EXECUTION',
              id: executionId,
              error: `Execution tem ${execution.position_fills.length} fill(s) vinculado(s), não pode ser deletada`,
            });
            continue;
          }

          await this.prisma.tradeExecution.delete({
            where: { id: executionId },
          });

          results.executionsDeleted++;
          console.log(`[ADMIN] ✅ Execution ${executionId} deletada`);
        } catch (error: any) {
          results.errors.push({
            type: 'EXECUTION',
            id: executionId,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao deletar execution ${executionId}:`, error.message);
        }
      }

      // 2. Deletar jobs duplicados
      for (const jobId of jobIds) {
        try {
          const job = await this.prisma.tradeJob.findUnique({
            where: { id: jobId },
            include: {
              executions: true,
              position_open: true,
            },
          });

          if (!job) {
            results.errors.push({
              type: 'JOB',
              id: jobId,
              error: 'Job não encontrado',
            });
            continue;
          }

          // Validar: só deletar se não tiver executions ou se todas as executions forem deletadas
          if (job.executions.length > 0) {
            // Verificar se todas as executions foram deletadas ou podem ser deletadas
            const executionsWithFills = await this.prisma.tradeExecution.findMany({
              where: {
                trade_job_id: jobId,
              },
              include: {
                position_fills: true,
              },
            });

            const hasFills = executionsWithFills.some(e => e.position_fills.length > 0);
            if (hasFills) {
              results.errors.push({
                type: 'JOB',
                id: jobId,
                error: 'Job tem executions com fills vinculados, não pode ser deletado',
              });
              continue;
            }
          }

          // Validar: não deletar se tiver posição aberta vinculada
          if (job.position_open) {
            results.errors.push({
              type: 'JOB',
              id: jobId,
              error: 'Job tem posição aberta vinculada, não pode ser deletado',
            });
            continue;
          }

          await this.prisma.tradeJob.delete({
            where: { id: jobId },
          });

          results.jobsDeleted++;
          console.log(`[ADMIN] ✅ Job ${jobId} deletado`);
        } catch (error: any) {
          results.errors.push({
            type: 'JOB',
            id: jobId,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao deletar job ${jobId}:`, error.message);
        }
      }

      // 3. Deletar posições duplicadas
      for (const positionId of positionIds) {
        try {
          const position = await this.prisma.tradePosition.findUnique({
            where: { id: positionId },
            include: {
              fills: true,
            },
          });

          if (!position) {
            results.errors.push({
              type: 'POSITION',
              id: positionId,
              error: 'Posição não encontrada',
            });
            continue;
          }

          // Validar: só deletar se não tiver fills ou se todos os fills forem removidos
          if (position.fills.length > 0) {
            results.errors.push({
              type: 'POSITION',
              id: positionId,
              error: `Posição tem ${position.fills.length} fill(s) vinculado(s), não pode ser deletada`,
            });
            continue;
          }

          await this.prisma.tradePosition.delete({
            where: { id: positionId },
          });

          results.positionsDeleted++;
          console.log(`[ADMIN] ✅ Posição ${positionId} deletada`);
        } catch (error: any) {
          results.errors.push({
            type: 'POSITION',
            id: positionId,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao deletar posição ${positionId}:`, error.message);
        }
      }

      console.log(`[ADMIN] Deleção de duplicatas concluída: ${results.executionsDeleted} execution(s), ${results.jobsDeleted} job(s), ${results.positionsDeleted} posição(ões), ${results.errors.length} erro(s)`);

      return {
        executions_deleted: results.executionsDeleted,
        jobs_deleted: results.jobsDeleted,
        positions_deleted: results.positionsDeleted,
        errors: results.errors.length,
        error_details: results.errors,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao deletar duplicatas:', error);
      throw error;
    }
  }

  @Post('system/sync-with-exchange')
  @ApiOperation({
    summary: 'Sincronizar sistema com exchange',
    description: 'Executa auditoria completa e sincroniza sistema com exchange, detectando e corrigindo inconsistências: trade jobs órfãos, posições duplicadas, trade jobs duplicados e jobs sem correspondência na exchange.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronização concluída',
  })
  async syncWithExchange(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('autoFix') autoFix?: string
  ) {
    if (!accountId) {
      throw new BadRequestException('accountId é obrigatório para sincronização com exchange');
    }

    const accountIdNum = parseInt(accountId);
    const dateFrom = from ? new Date(from) : undefined;
    const dateTo = to ? new Date(to) : undefined;
    const autoFixFlag = autoFix === 'true' || autoFix === '1';

    if (!dateFrom || !dateTo) {
      throw new BadRequestException('from e to são obrigatórios para sincronização com exchange');
    }

    console.log(`[ADMIN] Iniciando sincronização com exchange para conta ${accountIdNum}...`);
    console.log(`[ADMIN] Período: ${dateFrom.toISOString()} até ${dateTo.toISOString()}`);
    console.log(`[ADMIN] AutoFix: ${autoFixFlag ? 'HABILITADO' : 'DESABILITADO'}`);

    const startTime = Date.now();
    const validations = {
      orphan_jobs: [] as Array<{ job_id: number; reason: string }>,
      duplicate_positions: [] as Array<{ job_id_open: number; position_ids: number[] }>,
      duplicate_jobs: [] as Array<{ order_id: string; job_ids: number[] }>,
      jobs_without_exchange: [] as Array<{ job_id: number; order_id: string }>,
    };

    const fixesApplied = {
      jobs_deleted: 0,
      positions_deleted: 0,
      jobs_corrected: 0,
      executions_corrected: 0,
    };

    const errors: Array<{ type: string; id: number; error: string }> = [];

    try {
      // Buscar conta
      const account = await this.prisma.exchangeAccount.findUnique({
        where: { id: accountIdNum },
        select: {
          id: true,
          exchange: true,
          api_key_enc: true,
          api_secret_enc: true,
          testnet: true,
          is_simulation: true,
        },
      });

      if (!account) {
        throw new NotFoundException(`ExchangeAccount ${accountIdNum} not found`);
      }

      if (account.is_simulation) {
        throw new BadRequestException('Não é possível sincronizar conta de simulação');
      }

      if (!account.api_key_enc || !account.api_secret_enc) {
        throw new BadRequestException('Conta sem API keys configuradas');
      }

      // Descriptografar API keys
      const apiKey = await this.encryptionService.decrypt(account.api_key_enc);
      const apiSecret = await this.encryptionService.decrypt(account.api_secret_enc);

      // Criar adapter
      const adapter = AdapterFactory.createAdapter(
        account.exchange as ExchangeType,
        apiKey,
        apiSecret,
        { testnet: account.testnet }
      );

      // 1. Detectar trade jobs órfãos
      console.log('[ADMIN] Detectando trade jobs órfãos...');
      try {
        const jobsFilled = await this.prisma.tradeJob.findMany({
          where: {
            exchange_account_id: accountIdNum,
            status: 'FILLED',
            created_at: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          include: {
            executions: {
              select: {
                id: true,
                exchange_order_id: true,
              },
              orderBy: {
                created_at: 'desc',
              },
            },
            position_open: {
              select: {
                id: true,
              },
            },
          },
        });

        for (const job of jobsFilled) {
          try {
            const execution = job.executions[0];
            
            if (!execution) {
              validations.orphan_jobs.push({
                job_id: job.id,
                reason: 'Job FILLED sem executions',
              });
            } else if (!execution.exchange_order_id) {
              validations.orphan_jobs.push({
                job_id: job.id,
                reason: 'Job FILLED sem exchange_order_id',
              });
            } else if (String(execution.exchange_order_id).startsWith('DUST-')) {
              validations.orphan_jobs.push({
                job_id: job.id,
                reason: 'Job com execution DUST (não existe na exchange)',
              });
            } else {
              // Validar se existe na exchange
              try {
                await adapter.fetchOrder(execution.exchange_order_id, job.symbol);
              } catch (orderError: any) {
                if (
                  orderError.message?.includes('not found') ||
                  orderError.message?.includes('does not exist') ||
                  orderError.message?.includes('-2013')
                ) {
                  validations.jobs_without_exchange.push({
                    job_id: job.id,
                    order_id: execution.exchange_order_id,
                  });
                }
              }
            }
          } catch (jobError: any) {
            console.error(`[ADMIN] Erro ao validar job ${job.id}:`, jobError.message);
            errors.push({
              type: 'ORPHAN_JOB_VALIDATION',
              id: job.id,
              error: `Erro ao validar: ${jobError.message}`,
            });
          }
        }
      } catch (error: any) {
        console.error('[ADMIN] Erro ao detectar trade jobs órfãos:', error.message);
        errors.push({
          type: 'ORPHAN_JOBS_DETECTION',
          id: 0,
          error: `Erro ao detectar jobs órfãos: ${error.message}`,
        });
      }

      // 2. Detectar posições duplicadas
      console.log('[ADMIN] Detectando posições duplicadas...');
      try {
        const allPositions = await this.prisma.tradePosition.findMany({
          where: {
            exchange_account_id: accountIdNum,
            ...(dateFrom || dateTo ? {
              created_at: {
                ...(dateFrom && { gte: dateFrom }),
                ...(dateTo && { lte: dateTo }),
              },
            } : {}),
          },
          select: {
            id: true,
            trade_job_id_open: true,
            created_at: true,
            fills: {
              select: {
                id: true,
              },
            },
          },
          orderBy: {
            created_at: 'asc',
          },
        });

        // Filtrar apenas posições com trade_job_id_open não nulo
        const positionsWithJobId = allPositions.filter(pos => pos.trade_job_id_open !== null);

        const positionsByJob = new Map<number, typeof positionsWithJobId>();
        for (const pos of positionsWithJobId) {
          if (pos.trade_job_id_open) {
            if (!positionsByJob.has(pos.trade_job_id_open)) {
              positionsByJob.set(pos.trade_job_id_open, []);
            }
            positionsByJob.get(pos.trade_job_id_open)!.push(pos);
          }
        }

        for (const [jobId, positions] of positionsByJob.entries()) {
          if (positions.length > 1) {
            validations.duplicate_positions.push({
              job_id_open: jobId,
              position_ids: positions.map(p => p.id),
            });
          }
        }
      } catch (error: any) {
        console.error('[ADMIN] Erro ao detectar posições duplicadas:', error.message);
        errors.push({
          type: 'DUPLICATE_POSITIONS_DETECTION',
          id: 0,
          error: `Erro ao detectar posições duplicadas: ${error.message}`,
        });
      }

      // 3. Detectar trade jobs duplicados
      console.log('[ADMIN] Detectando trade jobs duplicados...');
      try {
        const systemExecutions = await this.prisma.tradeExecution.findMany({
          where: {
            exchange_account_id: accountIdNum,
            created_at: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          include: {
            trade_job: {
              select: {
                id: true,
                created_at: true,
                symbol: true,
                side: true,
                position_open: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

        const jobsByOrderId = new Map<string, Array<{
          job_id: number;
          created_at: Date;
          has_position: boolean;
        }>>();

        for (const exec of systemExecutions) {
          try {
            const orderId = exec.exchange_order_id;
            if (orderId && !String(orderId).startsWith('DUST-')) {
              if (!jobsByOrderId.has(orderId)) {
                jobsByOrderId.set(orderId, []);
              }
              const jobInfo = {
                job_id: exec.trade_job.id,
                created_at: exec.trade_job.created_at,
                has_position: !!exec.trade_job.position_open,
              };
              if (!jobsByOrderId.get(orderId)!.some(j => j.job_id === jobInfo.job_id)) {
                jobsByOrderId.get(orderId)!.push(jobInfo);
              }
            }
          } catch (execError: any) {
            console.error(`[ADMIN] Erro ao processar execution ${exec.id}:`, execError.message);
            errors.push({
              type: 'DUPLICATE_JOBS_PROCESSING',
              id: exec.id,
              error: `Erro ao processar: ${execError.message}`,
            });
          }
        }

        for (const [orderId, jobs] of jobsByOrderId.entries()) {
          if (jobs.length > 1) {
            validations.duplicate_jobs.push({
              order_id: orderId,
              job_ids: jobs.map(j => j.job_id),
            });
          }
        }
      } catch (error: any) {
        console.error('[ADMIN] Erro ao detectar trade jobs duplicados:', error.message);
        errors.push({
          type: 'DUPLICATE_JOBS_DETECTION',
          id: 0,
          error: `Erro ao detectar jobs duplicados: ${error.message}`,
        });
      }

      // 4. Aplicar correções se autoFix estiver habilitado
      if (autoFixFlag) {
        console.log('[ADMIN] Aplicando correções automáticas...');

        // 4.1 Deletar posições duplicadas (manter apenas a primeira)
        for (const dup of validations.duplicate_positions) {
          try {
            const positions = await this.prisma.tradePosition.findMany({
              where: {
                id: { in: dup.position_ids },
              },
              select: {
                id: true,
                created_at: true,
                fills: {
                  select: {
                    id: true,
                  },
                },
              },
              orderBy: {
                created_at: 'asc',
              },
            });

          if (positions.length > 1) {
            const toKeep = positions[0];
            const toDelete = positions.slice(1);

            for (const pos of toDelete) {
              try {
                if (pos.fills.length > 0) {
                  errors.push({
                    type: 'DUPLICATE_POSITION',
                    id: pos.id,
                    error: `Posição tem ${pos.fills.length} fill(s) vinculado(s), não pode ser deletada`,
                  });
                  continue;
                }

                await this.prisma.tradePosition.delete({
                  where: { id: pos.id },
                });
                fixesApplied.positions_deleted++;
                console.log(`[ADMIN] ✅ Posição duplicada ${pos.id} deletada (job_id_open: ${dup.job_id_open})`);
              } catch (error: any) {
                errors.push({
                  type: 'DUPLICATE_POSITION',
                  id: pos.id,
                  error: error.message || 'Erro desconhecido',
                });
              }
            }
          }
          } catch (dupError: any) {
            console.error(`[ADMIN] Erro ao processar posições duplicadas para job_id_open ${dup.job_id_open}:`, dupError.message);
            errors.push({
              type: 'DUPLICATE_POSITION_FIX',
              id: dup.job_id_open,
              error: `Erro ao processar: ${dupError.message}`,
            });
          }
        }

        // 4.2 Deletar trade jobs duplicados (manter apenas o mais recente)
        for (const dup of validations.duplicate_jobs) {
          try {
            const jobs = await this.prisma.tradeJob.findMany({
              where: {
                id: { in: dup.job_ids },
              },
              include: {
                executions: true,
                position_open: {
                  select: {
                    id: true,
                  },
                },
              },
              orderBy: {
                created_at: 'desc',
              },
            });

            if (jobs.length > 1) {
              const toKeep = jobs[0];
              const toDelete = jobs.slice(1);

              for (const job of toDelete) {
                try {
                  if (job.position_open) {
                    errors.push({
                      type: 'DUPLICATE_JOB',
                      id: job.id,
                      error: 'Job tem posição vinculada, não pode ser deletado',
                    });
                    continue;
                  }

                  // Deletar executions primeiro
                  for (const exec of job.executions) {
                    await this.prisma.tradeExecution.delete({
                      where: { id: exec.id },
                    });
                  }

                  await this.prisma.tradeJob.delete({
                    where: { id: job.id },
                  });
                  fixesApplied.jobs_deleted++;
                  console.log(`[ADMIN] ✅ Trade job duplicado ${job.id} deletado (order_id: ${dup.order_id})`);
                } catch (error: any) {
                  errors.push({
                    type: 'DUPLICATE_JOB',
                    id: job.id,
                    error: error.message || 'Erro desconhecido',
                  });
                }
              }
            }
          } catch (dupError: any) {
            console.error(`[ADMIN] Erro ao processar jobs duplicados para order_id ${dup.order_id}:`, dupError.message);
            errors.push({
              type: 'DUPLICATE_JOB_FIX',
              id: 0,
              error: `Erro ao processar order_id ${dup.order_id}: ${dupError.message}`,
            });
          }
        }

        // 4.3 ✅ NOVO: Corrigir quantidades de posições baseado em saldos da exchange
        console.log('[ADMIN] Corrigindo quantidades de posições baseado em saldos da exchange...');
        try {
          const openPositions = await this.prisma.tradePosition.findMany({
            where: {
              exchange_account_id: accountIdNum,
              status: 'OPEN',
              qty_remaining: { gt: 0 },
            },
            select: {
              id: true,
              symbol: true,
              qty_remaining: true,
            },
          });

          // Agrupar por símbolo
          const positionsBySymbol = new Map<string, typeof openPositions>();
          for (const pos of openPositions) {
            if (!positionsBySymbol.has(pos.symbol)) {
              positionsBySymbol.set(pos.symbol, []);
            }
            positionsBySymbol.get(pos.symbol)!.push(pos);
          }

          // Para cada símbolo, buscar saldo na exchange
          for (const [symbol, positions] of positionsBySymbol.entries()) {
            try {
              const baseAsset = symbol.split('/')[0];
              const balances = await adapter.fetchBalance();
              const exchangeBalance = balances[baseAsset]?.free || 0;

              const localTotalQty = positions.reduce((sum, pos) => sum + pos.qty_remaining.toNumber(), 0);
              const difference = Math.abs(localTotalQty - exchangeBalance);
              const differencePct = exchangeBalance > 0 
                ? (difference / exchangeBalance) * 100 
                : (localTotalQty > 0 ? 100 : 0);

              // Se discrepância > 0.1%, corrigir proporcionalmente
              if (differencePct > 0.1 && exchangeBalance > 0) {
                const ratio = exchangeBalance / localTotalQty;
                for (const pos of positions) {
                  const correctedQty = pos.qty_remaining.toNumber() * ratio;
                  await this.prisma.tradePosition.update({
                    where: { id: pos.id },
                    data: {
                      qty_remaining: correctedQty,
                    },
                  });
                  fixesApplied.executions_corrected++;
                  console.log(
                    `[ADMIN] ✅ Quantidade corrigida: Posição ${pos.id} - ` +
                    `Local: ${pos.qty_remaining.toNumber()}, Exchange: ${correctedQty.toFixed(8)}`
                  );
                }
              }
            } catch (symbolError: any) {
              console.error(`[ADMIN] Erro ao corrigir quantidades para ${symbol}: ${symbolError.message}`);
            }
          }
        } catch (qtyError: any) {
          console.error(`[ADMIN] Erro ao corrigir quantidades: ${qtyError.message}`);
          errors.push({
            type: 'QUANTITY_CORRECTION',
            id: 0,
            error: `Erro ao corrigir quantidades: ${qtyError.message}`,
          });
        }

        // 4.4 ✅ NOVO: Corrigir taxas baseado em trades reais da exchange
        console.log('[ADMIN] Corrigindo taxas baseado em trades reais da exchange...');
        try {
          const executionsToFix = await this.prisma.tradeExecution.findMany({
            where: {
              exchange_account_id: accountIdNum,
              created_at: {
                gte: dateFrom,
                lte: dateTo,
              },
            },
            include: {
              trade_job: {
                select: {
                  symbol: true,
                },
              },
            },
            take: 100, // Limitar a 100 por execução
          });

          for (const exec of executionsToFix) {
            try {
              if (!exec.exchange_order_id || !exec.trade_job?.symbol) continue;

              const since = exec.created_at.getTime() - 60000;
              const trades = await adapter.fetchMyTrades(exec.trade_job.symbol, since, 100);
              const orderTrades = trades.filter((t: any) => {
                return t.order === exec.exchange_order_id || 
                       t.orderId === exec.exchange_order_id;
              });

              if (orderTrades.length === 0) continue;

              const fees = adapter.extractFeesFromTrades(orderTrades);
              if (fees.feeAmount === 0) continue;

              const localFee = exec.fee_amount?.toNumber() || 0;
              const differencePct = fees.feeAmount > 0
                ? (Math.abs(localFee - fees.feeAmount) / fees.feeAmount) * 100
                : 0;

              // Se discrepância > 1%, corrigir
              if (differencePct > 1) {
                await this.prisma.tradeExecution.update({
                  where: { id: exec.id },
                  data: {
                    fee_amount: fees.feeAmount,
                    fee_currency: fees.feeCurrency,
                    fee_rate: exec.cumm_quote_qty.toNumber() > 0
                      ? (fees.feeAmount / exec.cumm_quote_qty.toNumber()) * 100
                      : null,
                  },
                });
                fixesApplied.executions_corrected++;
                console.log(
                  `[ADMIN] ✅ Taxa corrigida: Execução ${exec.id} - ` +
                  `Local: ${localFee}, Exchange: ${fees.feeAmount}`
                );
              }
            } catch (execError: any) {
              // Continuar com próximo
            }
          }
        } catch (feeError: any) {
          console.error(`[ADMIN] Erro ao corrigir taxas: ${feeError.message}`);
          errors.push({
            type: 'FEE_CORRECTION',
            id: 0,
            error: `Erro ao corrigir taxas: ${feeError.message}`,
          });
        }

        // 4.5 Deletar trade jobs órfãos (sem execution válida na exchange)
        for (const orphan of validations.orphan_jobs) {
          try {
            const job = await this.prisma.tradeJob.findUnique({
              where: { id: orphan.job_id },
              include: {
                executions: true,
                position_open: {
                  select: {
                    id: true,
                  },
                },
              },
            });

            if (!job) {
              continue;
            }

            if (job.position_open) {
              errors.push({
                type: 'ORPHAN_JOB',
                id: job.id,
                error: 'Job órfão tem posição vinculada, não pode ser deletado',
              });
              continue;
            }

            // Deletar executions primeiro
            for (const exec of job.executions) {
              await this.prisma.tradeExecution.delete({
                where: { id: exec.id },
              });
            }

            await this.prisma.tradeJob.delete({
              where: { id: job.id },
            });
            fixesApplied.jobs_deleted++;
            console.log(`[ADMIN] ✅ Trade job órfão ${job.id} deletado: ${orphan.reason}`);
          } catch (error: any) {
            errors.push({
              type: 'ORPHAN_JOB',
              id: orphan.job_id,
              error: error.message || 'Erro desconhecido',
            });
          }
        }

        // 4.4 Deletar trade jobs sem correspondência na exchange
        for (const jobWithoutExchange of validations.jobs_without_exchange) {
          try {
            const job = await this.prisma.tradeJob.findUnique({
              where: { id: jobWithoutExchange.job_id },
              include: {
                executions: true,
                position_open: {
                  select: {
                    id: true,
                  },
                },
              },
            });

            if (!job) {
              continue;
            }

            if (job.position_open) {
              errors.push({
                type: 'JOB_WITHOUT_EXCHANGE',
                id: job.id,
                error: 'Job tem posição vinculada, não pode ser deletado',
              });
              continue;
            }

            // Deletar executions primeiro
            for (const exec of job.executions) {
              await this.prisma.tradeExecution.delete({
                where: { id: exec.id },
              });
            }

            await this.prisma.tradeJob.delete({
              where: { id: job.id },
            });
            fixesApplied.jobs_deleted++;
            console.log(`[ADMIN] ✅ Trade job ${job.id} sem correspondência na exchange deletado (order_id: ${jobWithoutExchange.order_id})`);
          } catch (error: any) {
            errors.push({
              type: 'JOB_WITHOUT_EXCHANGE',
              id: jobWithoutExchange.job_id,
              error: error.message || 'Erro desconhecido',
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Sincronização concluída em ${duration}ms`);
      console.log(`[ADMIN] Validações: ${validations.orphan_jobs.length} jobs órfãos, ${validations.duplicate_positions.length} posições duplicadas, ${validations.duplicate_jobs.length} jobs duplicados, ${validations.jobs_without_exchange.length} jobs sem exchange`);
      if (autoFixFlag) {
        console.log(`[ADMIN] Correções: ${fixesApplied.jobs_deleted} jobs deletados, ${fixesApplied.positions_deleted} posições deletadas`);
      }

      return {
        account_id: accountIdNum,
        period: {
          from: dateFrom.toISOString(),
          to: dateTo.toISOString(),
        },
        validations,
        ...(autoFixFlag ? { fixes_applied: fixesApplied } : {}),
        errors: errors.length > 0 ? errors : undefined,
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na sincronização com exchange:', error);
      throw error;
    }
  }

  @Get('system/validate-integrity')
  @ApiOperation({
    summary: 'Validar integridade de posições',
    description: 'Valida a integridade de todas as posições abertas, verificando quantidades, taxas e consistência.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado da validação de integridade',
  })
  async validateIntegrity(
    @Query('accountId') accountId?: string,
    @Query('positionId') positionId?: string
  ) {
    console.log('[ADMIN] Iniciando validação de integridade...');

    const positionService = new PositionService(this.prisma);
    const results: Array<{
      position_id: number;
      valid: boolean;
      errors: string[];
      warnings: string[];
      details: any;
    }> = [];

    try {
      let positionsToValidate;

      if (positionId) {
        // Validar posição específica
        const posId = parseInt(positionId);
        const position = await this.prisma.tradePosition.findUnique({
          where: { id: posId },
        });
        positionsToValidate = position ? [position] : [];
      } else if (accountId) {
        // Validar posições de uma conta
        const accountIdNum = parseInt(accountId);
        positionsToValidate = await this.prisma.tradePosition.findMany({
          where: {
            exchange_account_id: accountIdNum,
            status: 'OPEN',
          },
        });
      } else {
        // Validar todas as posições abertas
        positionsToValidate = await this.prisma.tradePosition.findMany({
          where: {
            status: 'OPEN',
          },
          take: 1000, // Limitar a 1000 para não sobrecarregar
        });
      }

      console.log(`[ADMIN] Validando ${positionsToValidate.length} posição(ões)...`);

      for (const position of positionsToValidate) {
        try {
          const validation = await positionService.validatePositionIntegrity(position.id);
          results.push({
            position_id: position.id,
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            details: validation.details,
          });
        } catch (error: any) {
          results.push({
            position_id: position.id,
            valid: false,
            errors: [`Erro ao validar: ${error.message}`],
            warnings: [],
            details: {},
          });
        }
      }

      const invalidCount = results.filter(r => !r.valid).length;
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

      console.log(
        `[ADMIN] ✅ Validação concluída: ${results.length} posição(ões) validada(s), ` +
        `${invalidCount} inválida(s), ${totalErrors} erro(s), ${totalWarnings} aviso(s)`
      );

      return {
        total_validated: results.length,
        invalid_count: invalidCount,
        total_errors: totalErrors,
        total_warnings: totalWarnings,
        results: results.slice(0, 100), // Limitar a 100 resultados
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na validação de integridade:', error);
      throw error;
    }
  }

  @Get('system/dust-positions')
  @ApiOperation({
    summary: 'Listar posições resíduo',
    description: 'Lista todas as posições marcadas como resíduo (dust), agrupadas por símbolo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de posições resíduo',
  })
  async getDustPositions() {
    console.log('[ADMIN] Buscando posições resíduo...');
    
    try {
      const positionService = new PositionService(this.prisma);
      
      // Buscar posições resíduo abertas
      // ✅ BUG-BAIXO-004 FIX: Adicionar paginação padrão
      const dustPositions = await this.prisma.tradePosition.findMany({
        where: {
          is_dust: true,
          status: 'OPEN',
          qty_remaining: { gt: 0 },
        },
        take: 50,
        skip: 0,
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      // Agrupar por símbolo e exchange_account_id
      const groups = await positionService.getDustPositionsBySymbol();

      return {
        groups,
        positions: dustPositions.map(p => ({
          id: p.id,
          symbol: p.symbol,
          exchange_account_id: p.exchange_account_id,
          exchange_account_label: p.exchange_account.label,
          exchange: p.exchange_account.exchange,
          qty_remaining: p.qty_remaining.toNumber(),
          qty_total: p.qty_total.toNumber(),
          price_open: p.price_open.toNumber(),
          dust_value_usd: p.dust_value_usd?.toNumber() || 0,
          original_position_id: p.original_position_id,
          created_at: p.created_at,
        })),
        total_count: dustPositions.length,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao buscar posições resíduo:', error);
      throw error;
    }
  }

  @Post('system/identify-dust-positions')
  @ApiOperation({
    summary: 'Identificar posições candidatas a resíduo',
    description: 'Identifica posições que atendem os critérios para serem convertidas em resíduo (< 1% E < US$ 5.00).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de posições candidatas',
  })
  async identifyDustPositions() {
    console.log('[ADMIN] Identificando posições candidatas a resíduo...');
    
    try {
      const positionService = new PositionService(this.prisma);
      const candidates = await positionService.findDustPositions();

      console.log(`[ADMIN] Encontradas ${candidates.length} posição(ões) candidata(s) a resíduo`);

      return {
        candidates,
        total_found: candidates.length,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao identificar posições resíduo:', error);
      throw error;
    }
  }

  @Post('system/convert-to-dust')
  @ApiOperation({
    summary: 'Converter posições para resíduo',
    description: 'Converte posições selecionadas em resíduo, criando novas posições resíduo e fechando as originais.',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversão concluída',
  })
  async convertToDust(@Body() body: { positionIds: number[] }) {
    console.log('[ADMIN] Convertendo posições para resíduo...');
    
    const startTime = Date.now();
    let converted = 0;
    const errors: Array<{ positionId: number; error: string }> = [];
    const newDustPositions: number[] = [];

    try {
      const { positionIds } = body;
      const positionService = new PositionService(this.prisma);

      console.log(`[ADMIN] Convertendo ${positionIds.length} posição(ões)`);

      for (const positionId of positionIds) {
        try {
          const newDustPositionId = await positionService.convertToDustPosition(positionId);
          newDustPositions.push(newDustPositionId);
          converted++;
          console.log(`[ADMIN] ✅ Posição ${positionId} convertida para resíduo (nova posição: ${newDustPositionId})`);
        } catch (error: any) {
          errors.push({
            positionId,
            error: error.message || 'Erro desconhecido',
          });
          console.error(`[ADMIN] ❌ Erro ao converter posição ${positionId}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Conversão concluída em ${duration}ms: ${converted}/${positionIds.length} convertida(s), ${errors.length} erro(s)`);

      return {
        total_requested: positionIds.length,
        converted,
        new_dust_positions: newDustPositions,
        errors: errors.length,
        error_details: errors,
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao converter posições para resíduo:', error);
      throw error;
    }
  }

  @Post('system/close-dust-by-symbol')
  @ApiOperation({
    summary: 'Fechar resíduos por símbolo',
    description: 'Fecha todas as posições resíduo do mesmo símbolo em uma única ordem. Valida que valor total >= US$ 5.00.',
  })
  @ApiResponse({
    status: 200,
    description: 'Fechamento concluído',
  })
  async closeDustBySymbol(@Body() body: { symbol: string; exchangeAccountId: number; positionIds: number[] }) {
    console.log('[ADMIN] Fechando resíduos por símbolo...');
    
    try {
      const { symbol, exchangeAccountId, positionIds } = body;
      const positionService = new PositionService(this.prisma);

      const result = await positionService.closeDustPositions(symbol, exchangeAccountId, positionIds, true);

      // Enfileirar job para execução
      if (this.tradeJobQueueService && typeof this.tradeJobQueueService.enqueueTradeJob === 'function') {
        await this.tradeJobQueueService.enqueueTradeJob(result.tradeJobId);
      } else {
        // Fallback: usar método direto do Prisma para atualizar status
        // O job será processado pelo monitor de limit orders ou executor
        console.log(`[ADMIN] Job ${result.tradeJobId} criado para fechar resíduos (será processado automaticamente)`);
      }

      console.log(`[ADMIN] ✅ Job de venda criado: ${result.tradeJobId} para fechar ${result.totalQty} de ${symbol} (US$ ${result.totalValueUsd.toFixed(2)})`);

      return {
        message: 'Job de venda criado com sucesso',
        tradeJobId: result.tradeJobId,
        totalQty: result.totalQty,
        totalValueUsd: result.totalValueUsd,
        symbol,
        positionIds,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro ao fechar resíduos:', error);
      throw error;
    }
  }

  @Get('settings/payment-gateway')
  @ApiOperation({ summary: 'Obter gateway de pagamento padrão' })
  @ApiResponse({ status: 200, description: 'Gateway padrão configurado' })
  async getPaymentGateway() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'payment_gateway' },
    });

    return {
      gateway: setting?.value || 'mercadopago',
      available_gateways: ['mercadopago', 'transfi'],
    };
  }

  @Put('settings/payment-gateway')
  @ApiOperation({ summary: 'Definir gateway de pagamento padrão' })
  @ApiResponse({ status: 200, description: 'Gateway atualizado' })
  async setPaymentGateway(@Body() body: { gateway: 'mercadopago' | 'transfi' }) {
    if (!['mercadopago', 'transfi'].includes(body.gateway)) {
      throw new BadRequestException('Gateway inválido. Use "mercadopago" ou "transfi"');
    }

    return this.prisma.systemSetting.upsert({
      where: { key: 'payment_gateway' },
      create: {
        key: 'payment_gateway',
        value: body.gateway,
        description: 'Gateway de pagamento padrão (mercadopago ou transfi)',
        category: 'payment',
      },
      update: {
        value: body.gateway,
        updated_at: new Date(),
      },
    });
  }

  @Post('audit-fifo-positions')
  @ApiOperation({
    summary: 'Auditar e corrigir posições FIFO',
    description: 'Audita vendas das últimas X horas e corrige posições que não fecharam corretamente por FIFO, comparando quantidade vendida com quantidade em aberto das posições.',
  })
  @ApiResponse({
    status: 200,
    description: 'Auditoria concluída',
  })
  async auditFifoPositions(@Body() body: { hours?: number; dryRun?: boolean }) {
    const hours = body.hours || 24;
    const dryRun = body.dryRun !== false; // Padrão true
    const positionService = new PositionService(this.prisma);

    console.log(`[ADMIN] Iniciando auditoria FIFO de posições (últimas ${hours}h, dry-run: ${dryRun})...`);

    const startTime = Date.now();
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    // Buscar execuções SELL das últimas X horas
    const sellExecutions = await this.prisma.tradeExecution.findMany({
      where: {
        trade_job: {
          side: 'SELL',
          created_at: { gte: cutoffDate },
        },
      },
      include: {
        trade_job: {
          select: {
            id: true,
            side: true,
            symbol: true,
            exchange_account_id: true,
            trade_mode: true,
            position_id_to_close: true,
            webhook_event_id: true,
          },
        },
        position_fills: {
          where: { side: 'SELL' },
          include: {
            position: {
              select: {
                id: true,
                status: true,
                qty_remaining: true,
                qty_total: true,
                created_at: true,
                exchange_account_id: true,
                trade_mode: true,
                symbol: true,
              },
            },
          },
          orderBy: {
            created_at: 'asc',
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    console.log(`[ADMIN] Encontradas ${sellExecutions.length} execuções de venda para auditar`);

    const details: Array<{
      executionId: number;
      executionQty: number;
      fillsSum: number;
      status: 'OK' | 'MISMATCH' | 'FIFO_ERROR' | 'MISSING_FILLS';
      positionsBefore: Array<{ id: number; qty_remaining: number; status: string; created_at: Date }>;
      positionsAfter: Array<{ id: number; qty_remaining: number; status: string }>;
      correctPositions: Array<{ id: number; qty_remaining: number }>;
      fixed: boolean;
      error?: string;
    }> = [];

    let problemsFound = 0;
    let fixed = 0;
    const errors: string[] = [];

    for (const execution of sellExecutions) {
      try {
        const executionQty = execution.executed_qty.toNumber();
        const fillsSum = execution.position_fills.reduce(
          (sum, fill) => sum + fill.qty.toNumber(),
          0
        );

        // Verificar se soma dos fills bate com executed_qty
        const qtyMismatch = Math.abs(fillsSum - executionQty) > 0.00000001; // Tolerância para decimais

        // Buscar posições que foram fechadas por esta execução (via PositionFills)
        const positionsClosedByExecution = execution.position_fills
          .map((fill) => fill.position)
          .filter((pos) => pos.status === 'CLOSED');

        // Buscar snapshot de posições abertas no momento da execução
        // Usar created_at <= execution.created_at para pegar posições que existiam naquele momento
        const executionTime = execution.created_at;
        
        // Se tem position_id_to_close, não precisa verificar FIFO (é fechamento específico)
        const needsFifoCheck = !execution.trade_job.position_id_to_close;

        let fifoError = false;
        let correctPositions: Array<{ id: number; qty_remaining: number }> = [];

        if (needsFifoCheck) {
          // Buscar todas as posições criadas antes da execução com seus fills
          const allPositionsAtTime = await this.prisma.tradePosition.findMany({
            where: {
              exchange_account_id: execution.trade_job.exchange_account_id,
              trade_mode: execution.trade_job.trade_mode,
              symbol: execution.trade_job.symbol,
              side: 'LONG',
              created_at: { lte: executionTime },
            },
            orderBy: { created_at: 'asc' },
            include: {
              fills: {
                where: {
                  side: 'SELL',
                  execution: {
                    created_at: { lt: executionTime },
                  },
                },
              },
            },
          });

          // Calcular quais posições deveriam ter sido fechadas (FIFO)
          // Simular estado das posições no momento da execução
          let remainingQty = executionQty;
          const shouldHaveClosed: number[] = [];
          
          for (const pos of allPositionsAtTime) {
            if (remainingQty <= 0) break;
            
            // Calcular qty_remaining no momento da execução
            const qtyClosedBefore = pos.fills.reduce(
              (sum, fill) => sum + fill.qty.toNumber(),
              0
            );
            const qtyRemainingAtTime = pos.qty_total.toNumber() - qtyClosedBefore;

            // Se a posição estava aberta no momento da execução
            if (qtyRemainingAtTime > 0) {
              const qtyToClose = Math.min(qtyRemainingAtTime, remainingQty);
              shouldHaveClosed.push(pos.id);
              remainingQty -= qtyToClose;
            }
          }

          // Verificar se as posições fechadas são as corretas
          const closedIds = new Set(positionsClosedByExecution.map((p) => p.id));
          const shouldHaveClosedSet = new Set(shouldHaveClosed);

          if (closedIds.size !== shouldHaveClosedSet.size) {
            fifoError = true;
          } else {
            // Verificar se são exatamente as mesmas posições
            for (const id of closedIds) {
              if (!shouldHaveClosedSet.has(id)) {
                fifoError = true;
                break;
              }
            }
            // Verificar ordem (primeiras posições fechadas devem ser as mais antigas)
            const closedPositionsOrdered = positionsClosedByExecution
              .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
              .map((p) => p.id);
            const shouldHaveClosedOrdered = allPositionsAtTime
              .filter((p) => shouldHaveClosedSet.has(p.id))
              .map((p) => p.id);

            if (closedPositionsOrdered.length !== shouldHaveClosedOrdered.length) {
              fifoError = true;
            } else {
              for (let i = 0; i < closedPositionsOrdered.length; i++) {
                if (closedPositionsOrdered[i] !== shouldHaveClosedOrdered[i]) {
                  fifoError = true;
                  break;
                }
              }
            }
          }

          correctPositions = allPositionsAtTime
            .filter((p) => shouldHaveClosedSet.has(p.id))
            .map((p) => ({
              id: p.id,
              qty_remaining: p.qty_remaining.toNumber(),
            }));
        }

        // Determinar status
        let status: 'OK' | 'MISMATCH' | 'FIFO_ERROR' | 'MISSING_FILLS' = 'OK';
        if (execution.position_fills.length === 0) {
          status = 'MISSING_FILLS';
        } else if (qtyMismatch) {
          status = 'MISMATCH';
        } else if (fifoError) {
          status = 'FIFO_ERROR';
        }

        const positionsBefore = positionsClosedByExecution.map((pos) => ({
          id: pos.id,
          qty_remaining: pos.qty_remaining.toNumber(),
          status: pos.status,
          created_at: pos.created_at,
        }));

        if (status !== 'OK') {
          problemsFound++;

          // Se não for dry-run, corrigir
          if (!dryRun) {
            try {
              // Reverter execução atual
              const revertResult = await positionService.revertSellExecution(execution.id, false);
              
              if (revertResult.success) {
                // Determinar origin baseado no job
                let origin: 'WEBHOOK' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'TRAILING' = 'WEBHOOK';
                if (execution.trade_job.position_id_to_close) {
                  const targetPosition = await this.prisma.tradePosition.findUnique({
                    where: { id: execution.trade_job.position_id_to_close },
                  });
                  if (targetPosition) {
                    if (targetPosition.tp_triggered) origin = 'TAKE_PROFIT';
                    else if (targetPosition.sl_triggered) origin = 'STOP_LOSS';
                    else if (targetPosition.trailing_triggered) origin = 'TRAILING';
                    else origin = execution.trade_job.webhook_event_id ? 'WEBHOOK' : 'MANUAL';
                  }
                } else {
                  // Buscar posições abertas para determinar origin
                  const openPositions = await this.prisma.tradePosition.findMany({
                    where: {
                      exchange_account_id: execution.trade_job.exchange_account_id,
                      trade_mode: execution.trade_job.trade_mode,
                      symbol: execution.trade_job.symbol,
                      side: 'LONG',
                      status: 'OPEN',
                      qty_remaining: { gt: 0 },
                    },
                    orderBy: { created_at: 'asc' },
                    take: 1,
                  });

                  if (openPositions.length > 0) {
                    const firstPos = openPositions[0];
                    if (firstPos.tp_triggered) origin = 'TAKE_PROFIT';
                    else if (firstPos.sl_triggered) origin = 'STOP_LOSS';
                    else if (firstPos.trailing_triggered) origin = 'TRAILING';
                    else origin = execution.trade_job.webhook_event_id ? 'WEBHOOK' : 'MANUAL';
                  }
                }

                // Re-executar onSellExecuted com FIFO correto
                await positionService.onSellExecuted(
                  execution.trade_job.id,
                  execution.id,
                  executionQty,
                  execution.avg_price.toNumber(),
                  origin,
                  execution.fee_amount?.toNumber(),
                  execution.fee_currency || undefined
                );

                fixed++;
                console.log(`[ADMIN] ✅ Execução ${execution.id} corrigida`);
              } else {
                errors.push(`Erro ao reverter execução ${execution.id}: ${revertResult.message}`);
              }
            } catch (error: any) {
              const errorMsg = `Erro ao corrigir execução ${execution.id}: ${error.message}`;
              errors.push(errorMsg);
              console.error(`[ADMIN] ❌ ${errorMsg}`);
            }
          }
        }

        // Buscar posições após correção (ou estado atual se dry-run)
        const positionsAfter = await this.prisma.tradePosition.findMany({
          where: {
            id: { in: positionsBefore.map((p) => p.id) },
          },
          select: {
            id: true,
            qty_remaining: true,
            status: true,
          },
        });

        details.push({
          executionId: execution.id,
          executionQty,
          fillsSum,
          status,
          positionsBefore,
          positionsAfter: positionsAfter.map((p) => ({
            id: p.id,
            qty_remaining: p.qty_remaining.toNumber(),
            status: p.status,
          })),
          correctPositions,
          fixed: !dryRun && status !== 'OK' && fixed > 0,
          error: status !== 'OK' && !dryRun && errors.length > 0 ? errors[errors.length - 1] : undefined,
        });
      } catch (error: any) {
        const errorMsg = `Erro ao processar execução ${execution.id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`[ADMIN] ❌ ${errorMsg}`);
        details.push({
          executionId: execution.id,
          executionQty: execution.executed_qty.toNumber(),
          fillsSum: execution.position_fills.reduce((sum, fill) => sum + fill.qty.toNumber(), 0),
          status: 'MISMATCH',
          positionsBefore: [],
          positionsAfter: [],
          correctPositions: [],
          fixed: false,
          error: errorMsg,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ADMIN] Auditoria FIFO concluída em ${duration}ms: ${problemsFound} problema(s) encontrado(s), ${fixed} corrigido(s)`);

    return {
      totalExecutions: sellExecutions.length,
      checkedExecutions: sellExecutions.length,
      problemsFound,
      fixed,
      errors,
      dryRun,
      duration_ms: duration,
      details,
    };
  }

  @Post('cancel-all-pending-orders')
  @ApiOperation({
    summary: 'Cancelar todas ordens pendentes',
    description: 'Cancela todas as ordens com status PENDING ou PENDING_LIMIT em todas as contas. Pode filtrar por conta, símbolo ou side. Suporta dry-run para verificar antes de cancelar.',
  })
  @ApiResponse({
    status: 200,
    description: 'Ordens canceladas com sucesso',
  })
  async cancelAllPendingOrders(
    @Body()
    body: {
      accountIds?: number[];
      symbol?: string;
      side?: 'BUY' | 'SELL';
      orderType?: 'MARKET' | 'LIMIT';
      dryRun?: boolean;
    }
  ) {
    const { accountIds, symbol, side, orderType, dryRun = false } = body;

    // Buscar ordens PENDING e PENDING_LIMIT
    const whereConditions: any = {
      status: { in: ['PENDING', 'PENDING_LIMIT'] },
    };

    if (accountIds && accountIds.length > 0) {
      whereConditions.exchange_account_id = { in: accountIds };
    }
    if (symbol) {
      whereConditions.symbol = symbol.toUpperCase().trim();
    }
    if (side) {
      whereConditions.side = side;
    }
    if (orderType) {
      whereConditions.order_type = orderType;
    }

    // Buscar TODAS as ordens pendentes (sem limite)
    const pendingOrders = await this.prisma.tradeJob.findMany({
      where: whereConditions,
      orderBy: { created_at: 'asc' }, // Mais antigas primeiro
      include: {
        exchange_account: true,
        executions: {
          take: 1,
          orderBy: { id: 'desc' },
        },
      },
    });

    // Identificar ordens órfãs (sem executions ou sem exchange_order_id)
    const orphanedOrders = pendingOrders.filter((o) => o.executions.length === 0 || !o.executions[0]?.exchange_order_id);
    const ordersWithExecutions = pendingOrders.filter((o) => o.executions.length > 0 && o.executions[0]?.exchange_order_id);

    console.log(`[ADMIN] Encontradas ${pendingOrders.length} ordens pendentes:`);
    console.log(`[ADMIN] - ${orphanedOrders.length} órfãs (sem executions - nunca foram enfileiradas)`);
    console.log(`[ADMIN] - ${ordersWithExecutions.length} com executions (na exchange)`);

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        ordersFound: pendingOrders.length,
        orphansFound: orphanedOrders.length,
        withExecutions: ordersWithExecutions.length,
        orders: pendingOrders.slice(0, 50).map((o) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          orderType: o.order_type,
          status: o.status,
          hasExchangeOrder: o.executions.length > 0 && !!o.executions[0]?.exchange_order_id,
          exchangeOrderId: o.executions[0]?.exchange_order_id || null,
          accountId: o.exchange_account_id,
          accountLabel: o.exchange_account.label,
          isOrphan: o.executions.length === 0,
          createdAt: o.created_at,
        })),
      };
    }

    // Cancelar TODAS as ordens pendentes
    const results = {
      total: pendingOrders.length,
      orphansFound: orphanedOrders.length,
      withExecutions: ordersWithExecutions.length,
      canceledInExchange: 0,
      canceledInDb: 0,
      errors: 0,
      errorDetails: [] as Array<{ orderId: number; error: string }>,
    };

    const { ExchangeAccountService } = await import('@mvcashnode/domain');
    const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);

    for (const order of pendingOrders) {
      try {
        // Se tem exchange_order_id, cancelar na exchange
        if (order.executions.length > 0 && order.executions[0].exchange_order_id) {
          const exchangeOrderId = order.executions[0].exchange_order_id;
          
          // ✅ BUG 1 FIX: Validar se exchange_order_id é numérico (válido para exchange)
          // IDs como "DUST-123-1234567890" ou "TEST-456" não são válidos para cancelar na exchange
          const isValidOrderId = /^\d+$/.test(String(exchangeOrderId));
          
          if (!isValidOrderId) {
            console.log(
              `[ADMIN] Pulando cancelamento na exchange para job ${order.id}: ` +
              `exchange_order_id "${exchangeOrderId}" não é numérico (provavelmente ordem DUST/TEST)`
            );
            // Continuar para cancelar no banco mesmo sem cancelar na exchange
          } else {
            try {
              const keys = await accountService.decryptApiKeys(order.exchange_account_id);
              if (keys && keys.apiKey && keys.apiSecret) {
                const adapter = AdapterFactory.createAdapter(
                  order.exchange_account.exchange as ExchangeType,
                  keys.apiKey,
                  keys.apiSecret,
                  { testnet: order.exchange_account.testnet }
                );

                await adapter.cancelOrder(exchangeOrderId, order.symbol);
                results.canceledInExchange++;
                console.log(`[ADMIN] Ordem ${exchangeOrderId} cancelada na exchange para job ${order.id}`);
              } else {
                console.warn(`[ADMIN] Não foi possível obter API keys para conta ${order.exchange_account_id}, pulando cancelamento na exchange`);
              }
            } catch (exchangeError: any) {
              console.error(`[ADMIN] Erro ao cancelar ordem ${exchangeOrderId} na exchange: ${exchangeError.message}`);
              // Continuar mesmo se falhar na exchange, ainda vamos cancelar no banco
            }
          }
        }

        // Atualizar status no banco
        await this.prisma.tradeJob.update({
          where: { id: order.id },
          data: {
            status: 'CANCELED',
            reason_code: 'ADMIN_CANCEL',
            reason_message: 'Cancelado via ferramenta de debug',
          },
        });

        results.canceledInDb++;
        console.log(`[ADMIN] Job ${order.id} cancelado no banco de dados`);
      } catch (error: any) {
        results.errors++;
        const errorMsg = error?.message || 'Erro desconhecido';
        results.errorDetails.push({
          orderId: order.id,
          error: errorMsg,
        });
        console.error(`[ADMIN] Erro ao cancelar ordem ${order.id}: ${errorMsg}`);
      }

      // Rate limit protection: 100ms entre ordens
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[ADMIN] Cancelamento concluído:`);
    console.log(`[ADMIN] - ${results.canceledInDb} canceladas no banco`);
    console.log(`[ADMIN] - ${results.canceledInExchange} canceladas na exchange`);
    console.log(`[ADMIN] - ${results.orphansFound} eram órfãs (apenas canceladas no banco)`);
    console.log(`[ADMIN] - ${results.errors} erros`);

    return {
      success: true,
      message: `${results.canceledInDb} ordens canceladas (${results.orphansFound} órfãs, ${results.canceledInExchange} na exchange)`,
      ...results,
    };
  }

  @Post('enqueue-pending-limit-orders')
  @ApiOperation({
    summary: 'Enfileirar ordens LIMIT pendentes sem executions',
    description: 'Busca ordens LIMIT com status PENDING que não têm executions (órfãs) e enfileira na fila BullMQ apropriada para o executor processar. Útil para resolver ordens que foram criadas mas nunca foram enfileiradas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Ordens enfileiradas com sucesso',
  })
  async enqueuePendingLimitOrders(
    @Body()
    body: {
      accountIds?: number[];
      symbol?: string;
      side?: 'BUY' | 'SELL';
      tradeMode?: 'REAL' | 'SIMULATION';
      dryRun?: boolean;
      limit?: number;
    }
  ) {
    const { accountIds, symbol, side, tradeMode, dryRun = false, limit = 100 } = body;

    console.log('[ADMIN] Buscando ordens LIMIT pendentes sem executions...');

    // Buscar ordens PENDING LIMIT sem executions
    const whereConditions: any = {
      status: 'PENDING',
      order_type: 'LIMIT',
      executions: {
        none: {}, // Sem executions associadas
      },
    };

    if (accountIds && accountIds.length > 0) {
      whereConditions.exchange_account_id = { in: accountIds };
    }
    if (symbol) {
      whereConditions.symbol = symbol.toUpperCase().trim();
    }
    if (side) {
      whereConditions.side = side;
    }
    if (tradeMode) {
      whereConditions.trade_mode = tradeMode;
    }

    const orphanedOrders = await this.prisma.tradeJob.findMany({
      where: whereConditions,
      take: Math.min(limit, 500), // Máximo 500 por vez
      orderBy: { created_at: 'asc' }, // Mais antigas primeiro
      include: {
        exchange_account: {
          select: {
            id: true,
            label: true,
            exchange: true,
          },
        },
      },
    });

    console.log(`[ADMIN] Encontradas ${orphanedOrders.length} ordens LIMIT órfãs`);

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        ordersFound: orphanedOrders.length,
        orders: orphanedOrders.map((o) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          orderType: o.order_type,
          tradeMode: o.trade_mode,
          limitPrice: o.limit_price?.toNumber(),
          accountId: o.exchange_account_id,
          accountLabel: o.exchange_account.label,
          createdAt: o.created_at,
        })),
      };
    }

    // Enfileirar ordens
    const results = {
      total: orphanedOrders.length,
      enqueued: 0,
      alreadyEnqueued: 0,
      errors: 0,
      errorDetails: [] as Array<{ orderId: number; error: string }>,
    };

    for (const order of orphanedOrders) {
      try {
        await this.tradeJobQueueService.enqueueTradeJob(order.id);
        results.enqueued++;
        console.log(`[ADMIN] Job ${order.id} enfileirado com sucesso`);
      } catch (error: any) {
        // Verificar se o erro é de job já enfileirado
        if (error.message && error.message.includes('já está enfileirado')) {
          results.alreadyEnqueued++;
          console.log(`[ADMIN] Job ${order.id} já estava enfileirado`);
        } else {
          results.errors++;
          const errorMsg = error?.message || 'Erro desconhecido';
          results.errorDetails.push({
            orderId: order.id,
            error: errorMsg,
          });
          console.error(`[ADMIN] Erro ao enfileirar job ${order.id}: ${errorMsg}`);
        }
      }

      // Rate limit protection: 50ms entre enfileiramentos
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    console.log(
      `[ADMIN] Enfileiramento concluído: ${results.enqueued} enfileiradas, ` +
      `${results.alreadyEnqueued} já enfileiradas, ${results.errors} erros`
    );

    return {
      success: true,
      ...results,
    };
  }

  @Get('orphaned-executions')
  @ApiOperation({ 
    summary: 'Detectar executions órfãs (vendas executadas mas não vinculadas às posições)',
    description: 'Identifica TradeJobs com status FAILED ou SKIPPED que têm executions associadas mas a posição não foi fechada. Isso indica venda executada na exchange mas não processada no sistema.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de executions órfãs encontradas',
  })
  async detectOrphanedExecutions() {
    console.log('[ADMIN] Detectando executions órfãs...');

    // Buscar jobs FAILED/SKIPPED com executions
    const problematicJobs = await this.prisma.tradeJob.findMany({
      where: {
        side: 'SELL',
        status: { in: ['SKIPPED', 'FAILED'] },
        reason_code: { in: ['POSITION_NOT_ELIGIBLE', 'EXECUTION_ORPHANED'] },
        executions: { some: {} }, // Tem pelo menos 1 execution
      },
      include: {
        executions: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        position_to_close: true,
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    
    // Filtrar apenas aqueles onde execution foi realmente executada
    const orphaned = problematicJobs.filter(job => {
      const execution = job.executions[0];
      return execution && execution.executed_qty && execution.executed_qty.toNumber() > 0;
    });

    console.log(`[ADMIN] Encontradas ${orphaned.length} executions órfãs`);
    
    return orphaned.map(job => ({
      jobId: job.id,
      executionId: job.executions[0].id,
      symbol: job.symbol,
      qty: job.executions[0].executed_qty?.toNumber() || 0,
      price: job.executions[0].avg_price?.toNumber() || 0,
      value: job.executions[0].cumm_quote_qty?.toNumber() || 0,
      positionId: job.position_id_to_close,
      positionStatus: job.position_to_close?.status || 'NOT_FOUND',
      positionQtyRemaining: job.position_to_close?.qty_remaining?.toNumber() || 0,
      reason: job.reason_message,
      createdAt: job.created_at,
    }));
  }

  @Post('fix-orphaned-executions')
  @ApiOperation({ 
    summary: 'Corrigir executions órfãs selecionadas',
    description: 'Vincula manualmente executions órfãs às suas posições, fechando as posições retroativamente e recalculando lucros. Suporta posições alternativas para casos onde a posição original já foi fechada.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado da correção',
  })
  async fixOrphanedExecutions(@Body() dto: { 
    jobIds: number[];
    alternativePositions?: Array<{ jobId: number; positionId: number }>;
  }) {
    console.log(`[ADMIN] Corrigindo ${dto.jobIds.length} executions órfãs...`);
    if (dto.alternativePositions) {
      console.log(`[ADMIN] ${dto.alternativePositions.length} posições alternativas fornecidas`);
    }
    
    const results = [];
    const needsAlternative: Array<{
      jobId: number;
      reason: string;
      originalPositionId: number;
      originalPositionStatus: string;
    }> = [];
    
    for (const jobId of dto.jobIds) {
      try {
        const job = await this.prisma.tradeJob.findUnique({
          where: { id: jobId },
          include: { 
            executions: {
              orderBy: { created_at: 'desc' },
              take: 1,
            },
            position_to_close: true,
            exchange_account: true,
          },
        });
        
        if (!job) {
          results.push({ jobId, success: false, error: 'Job not found' });
          continue;
        }

        if (!job.executions[0]) {
          results.push({ jobId, success: false, error: 'No execution found' });
          continue;
        }

        const execution = job.executions[0];
        
        // Determinar qual posição usar
        let targetPosition = job.position_to_close;
        
        // Se não tem posição original, procurar alternativa
        if (!targetPosition) {
          const alternative = dto.alternativePositions?.find(alt => alt.jobId === jobId);
          if (alternative) {
            targetPosition = await this.prisma.tradePosition.findUnique({
              where: { id: alternative.positionId },
            });
          }
        }
        
        // Se posição original está CLOSED, verificar se há alternativa
        if (targetPosition && targetPosition.status === 'CLOSED') {
          const alternative = dto.alternativePositions?.find(alt => alt.jobId === jobId);
          if (alternative) {
            console.log(`[ADMIN] Job ${jobId}: Usando posição alternativa ${alternative.positionId} (original ${targetPosition.id} está CLOSED)`);
            targetPosition = await this.prisma.tradePosition.findUnique({
              where: { id: alternative.positionId },
            });
          } else {
            // Precisa de alternativa mas não foi fornecida
            needsAlternative.push({
              jobId,
              reason: 'Position is CLOSED',
              originalPositionId: targetPosition.id,
              originalPositionStatus: targetPosition.status,
            });
            results.push({ 
              jobId, 
              success: false, 
              error: 'Position is CLOSED, needs alternative',
              needsAlternative: true,
            });
            continue;
          }
        }
        
        if (!targetPosition) {
          results.push({ jobId, success: false, error: 'No valid position found' });
          continue;
        }
        
        // Verificar se posição está OPEN
        if (targetPosition.status !== 'OPEN') {
          needsAlternative.push({
            jobId,
            reason: `Position status is ${targetPosition.status}`,
            originalPositionId: targetPosition.id,
            originalPositionStatus: targetPosition.status,
          });
          results.push({ 
            jobId, 
            success: false, 
            error: `Position ${targetPosition.id} is ${targetPosition.status}`,
            needsAlternative: true,
          });
          continue;
        }
        
        // Reprocessar vinculação
        await this.prisma.$transaction(async (tx) => {
          // Fechar posição retroativamente
          const qtyToClose = Math.min(
            targetPosition.qty_remaining.toNumber(),
            execution.executed_qty.toNumber()
          );
          
          const grossProfit = (execution.avg_price.toNumber() - targetPosition.price_open.toNumber()) * qtyToClose;
          const feeUsd = execution.fee_amount?.toNumber() || 0;
          const netProfit = grossProfit - feeUsd;

          const newQtyRemaining = targetPosition.qty_remaining.toNumber() - qtyToClose;
          const isClosed = newQtyRemaining <= 0.00001;
          
          // Atualizar posição
          await tx.tradePosition.update({
            where: { id: targetPosition.id },
            data: {
              qty_remaining: { decrement: qtyToClose },
              status: isClosed ? 'CLOSED' : 'OPEN',
              realized_profit_usd: { increment: netProfit },
              fees_on_sell_usd: { increment: feeUsd },
              total_fees_paid_usd: { increment: feeUsd },
              close_reason: isClosed ? 'MANUAL_FIX' : targetPosition.close_reason,
              closed_at: isClosed ? new Date() : targetPosition.closed_at,
            },
          });
          
          // ✅ CRIAR POSITION FILL (vínculo entre execution e posição)
          await tx.positionFill.create({
            data: {
              position_id: targetPosition.id,
              trade_execution_id: execution.id,
              side: 'SELL',
              qty: qtyToClose,
              price: execution.avg_price.toNumber(),
            },
          });
          
          // ✅ ATUALIZAR JOB COM POSITION_ID_TO_CLOSE (vínculo do job com a posição)
          await tx.tradeJob.update({
            where: { id: jobId },
            data: {
              position_id_to_close: targetPosition.id, // ← IMPORTANTE
              status: 'FILLED',
              reason_code: 'MANUALLY_FIXED',
              reason_message: targetPosition.id !== job.position_id_to_close 
                ? `Execution vinculada manualmente via admin tools a posição alternativa ${targetPosition.id} (original: ${job.position_id_to_close})`
                : 'Execution vinculada manualmente via admin tools',
            },
          });

          console.log(`[ADMIN] Job ${jobId} corrigido: posição ${targetPosition.id} atualizada com ${qtyToClose} units, lucro ${netProfit.toFixed(2)} USD, PositionFill criado`);
        });
        
        results.push({ 
          jobId, 
          success: true, 
          qtyFixed: execution.executed_qty.toNumber(),
          positionId: targetPosition.id,
        });
      } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error';
        console.error(`[ADMIN] Erro ao corrigir job ${jobId}: ${errorMsg}`);
        results.push({ jobId, success: false, error: errorMsg });
      }
    }

    const fixed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.needsAlternative).length;
    
    console.log(`[ADMIN] Correção concluída: ${fixed} corrigidas, ${failed} falhadas, ${needsAlternative.length} precisam de alternativa`);
    
    return { 
      fixed,
      failed,
      needsAlternative: needsAlternative.length > 0 ? needsAlternative : undefined,
      results 
    };
  }

  @Get('orphaned-executions/:jobId/alternative-positions')
  @ApiOperation({ 
    summary: 'Buscar posições alternativas para execution órfã',
    description: 'Quando a posição original de um job órfão já foi fechada, busca outras posições OPEN do mesmo símbolo e conta que podem ser usadas como alternativa.'
  })
  @ApiParam({ 
    name: 'jobId', 
    type: 'number',
    description: 'ID do TradeJob órfão',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Posições alternativas disponíveis',
  })
  async getAlternativePositions(@Param('jobId', ParseIntPipe) jobId: number) {
    console.log(`[ADMIN] Buscando posições alternativas para job ${jobId}...`);
    
    const job = await this.prisma.tradeJob.findUnique({
      where: { id: jobId },
      include: { 
        position_to_close: true,
        exchange_account: true,
        executions: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const originalPosition = job.position_to_close;
    const execution = job.executions[0];

    if (!execution) {
      throw new NotFoundException(`No execution found for job ${jobId}`);
    }

    const needsAlternative = !originalPosition || originalPosition.status !== 'OPEN';

    console.log(`[ADMIN] Job ${jobId} - Detalhes para busca de alternativas:`);
    console.log(`[ADMIN]   - exchange_account_id: ${job.exchange_account_id}`);
    console.log(`[ADMIN]   - symbol: ${job.symbol}`);
    console.log(`[ADMIN]   - trade_mode: ${job.trade_mode}`);
    console.log(`[ADMIN]   - originalPosition: ${originalPosition ? `#${originalPosition.id} (${originalPosition.status})` : 'null'}`);
    console.log(`[ADMIN]   - needsAlternative: ${needsAlternative}`);

    if (!needsAlternative) {
      return {
        jobId,
        symbol: job.symbol,
        executedQty: execution.executed_qty?.toNumber() || 0,
        originalPosition: {
          id: originalPosition.id,
          symbol: originalPosition.symbol,
          status: originalPosition.status,
          qty_remaining: originalPosition.qty_remaining.toNumber(),
        },
        needsAlternative: false,
        alternatives: [],
      };
    }

    // Normalizar símbolo para buscar (pode estar com ou sem barra)
    // Job pode ter 'UNI/USDT' mas posições no banco podem estar como 'UNIUSDT'
    const symbolWithSlash = job.symbol.includes('/') ? job.symbol : job.symbol.replace(/USDT$/, '/USDT').replace(/BTC$/, '/BTC').replace(/ETH$/, '/ETH').replace(/BNB$/, '/BNB');
    const symbolWithoutSlash = job.symbol.replace('/', '');
    
    console.log(`[ADMIN] Buscando com múltiplos formatos de símbolo: '${job.symbol}', '${symbolWithSlash}', '${symbolWithoutSlash}'`);

    // Buscar posições alternativas com ambos os formatos de símbolo
    const alternatives = await this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: job.exchange_account_id,
        symbol: { in: [job.symbol, symbolWithSlash, symbolWithoutSlash] },
        trade_mode: job.trade_mode,
        side: 'LONG', // ← IMPORTANTE: Apenas posições LONG podem ser fechadas
        status: 'OPEN',
        qty_remaining: { gt: 0 },
      },
      orderBy: { created_at: 'asc' }, // Mais antigas primeiro (FIFO)
      take: 10,
    });

    console.log(`[ADMIN] Query executada: exchange_account_id=${job.exchange_account_id}, symbol IN [${job.symbol}, ${symbolWithSlash}, ${symbolWithoutSlash}], trade_mode=${job.trade_mode}, side=LONG, status=OPEN`);
    console.log(`[ADMIN] Encontradas ${alternatives.length} posições alternativas para job ${jobId}`);

    // ✅ DEBUG: Se não encontrou, buscar TODAS as posições OPEN da conta para diagnóstico
    if (alternatives.length === 0) {
      const allOpenPositions = await this.prisma.tradePosition.findMany({
        where: {
          exchange_account_id: job.exchange_account_id,
          trade_mode: job.trade_mode,
          status: 'OPEN',
          qty_remaining: { gt: 0 },
        },
        select: {
          id: true,
          symbol: true,
          side: true,
          qty_remaining: true,
        },
        take: 20,
      });
      
      console.log(`[ADMIN] ℹ️ DEBUG: ${allOpenPositions.length} posições OPEN encontradas na conta ${job.exchange_account_id} (${job.trade_mode}):`);
      allOpenPositions.forEach(pos => {
        console.log(`[ADMIN]   - Posição #${pos.id}: symbol='${pos.symbol}', side='${pos.side}', qty=${pos.qty_remaining.toNumber()}`);
      });
    }

    return {
      jobId,
      symbol: job.symbol,
      executedQty: execution.executed_qty?.toNumber() || 0,
      originalPosition: originalPosition ? {
        id: originalPosition.id,
        symbol: originalPosition.symbol,
        status: originalPosition.status,
        qty_remaining: originalPosition.qty_remaining.toNumber(),
      } : null,
      needsAlternative: true,
      alternatives: alternatives.map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        qty_remaining: pos.qty_remaining.toNumber(),
        qty_total: pos.qty_total.toNumber(),
        price_open: pos.price_open.toNumber(),
        created_at: pos.created_at,
      })),
    };
  }

  @Get('detect-missing-orders/:accountId')
  @ApiOperation({ 
    summary: 'Detectar ordens da exchange que não estão no sistema',
    description: 'Busca ordens BUY e SELL na exchange e compara com TradeExecution no sistema.'
  })
  @ApiParam({ 
    name: 'accountId', 
    type: 'number',
    description: 'ID da ExchangeAccount',
  })
  async detectMissingOrders(
    @Param('accountId', ParseIntPipe) accountId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    console.log(`[ADMIN] Detectando ordens faltantes para conta ${accountId}...`);
    console.log(`[ADMIN] Período: ${from || 'início'} até ${to || 'agora'}`);

    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException(`ExchangeAccount ${accountId} not found`);
    }

    // Descriptografar credenciais
    const apiKey = await this.encryptionService.decrypt(account.api_key_enc);
    const apiSecret = await this.encryptionService.decrypt(account.api_secret_enc);

    // Criar adapter usando AdapterFactory.createAdapter (método estático)
    const adapter = AdapterFactory.createAdapter(
      account.exchange as ExchangeType,
      apiKey,
      apiSecret,
      { testnet: account.testnet }
    );

    // Determinar período de busca
    let startDate: Date;
    let endDate: Date;

    if (from) {
      startDate = new Date(from);
    } else {
      // Padrão: 7 dias atrás
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    }

    if (to) {
      endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999); // Fim do dia
    } else {
      endDate = new Date(); // Agora
    }

    const since = startDate.getTime();

    console.log(`[ADMIN] Buscando trades desde ${startDate.toISOString()} até ${endDate.toISOString()}...`);

    // Buscar todos os jobs para obter símbolos
    const systemJobs = await this.prisma.tradeJob.findMany({
      where: {
        exchange_account_id: accountId,
        created_at: { gte: startDate },
      },
      select: { symbol: true },
      distinct: ['symbol'],
    });

    // Buscar também símbolos com posições abertas
    const openPositionSymbols = await this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: accountId,
        status: 'OPEN',
      },
      select: { symbol: true },
      distinct: ['symbol'],
    });

    const allSymbols = [...new Set([
      ...systemJobs.map(s => s.symbol),
      ...openPositionSymbols.map(s => s.symbol),
    ])];

    console.log(`[ADMIN] Símbolos a verificar (${allSymbols.length}): ${allSymbols.join(', ')}`);

    const missingOrders = [];

    for (const symbol of allSymbols) {
      try {
        // Buscar trades da exchange
        const exchangeTrades = await adapter.fetchMyTrades(symbol, since, 500);
        
        console.log(`[ADMIN] ${symbol}: ${exchangeTrades.length} trades na exchange`);

        for (const trade of exchangeTrades) {
          // Verificar se existe no sistema
          const existsInSystem = await this.prisma.tradeExecution.findFirst({
            where: {
              exchange_account_id: accountId,
              exchange_order_id: trade.order,
            },
          });

          if (!existsInSystem) {
            missingOrders.push({
              exchangeOrderId: trade.order,
              symbol: trade.symbol,
              side: trade.side.toUpperCase(),
              qty: trade.amount,
              price: trade.price,
              cost: trade.cost,
              fee: trade.fee?.cost || 0,
              feeCurrency: trade.fee?.currency || '',
              timestamp: new Date(trade.timestamp),
              info: trade.info,
            });
          }
        }
      } catch (error: any) {
        console.error(`[ADMIN] Erro ao buscar trades de ${symbol}:`, error.message);
      }
    }

    console.log(`[ADMIN] Detectadas ${missingOrders.length} ordens faltantes`);

    return {
      accountId,
      accountName: account.label,
      missing: missingOrders,
      total: missingOrders.length,
    };
  }

  @Get('open-positions/:accountId/:symbol')
  @ApiOperation({ 
    summary: 'Buscar posições abertas de um símbolo específico',
    description: 'Retorna posições OPEN para vincular com ordens SELL.'
  })
  async getOpenPositions(
    @Param('accountId', ParseIntPipe) accountId: number,
    @Param('symbol') symbol: string,
  ) {
    const positions = await this.prisma.tradePosition.findMany({
      where: {
        exchange_account_id: accountId,
        symbol: { in: [symbol, symbol.replace('/', ''), symbol.replace(/USDT$/, '/USDT')] },
        status: 'OPEN',
        qty_remaining: { gt: 0 },
        side: 'LONG',
      },
      select: {
        id: true,
        symbol: true,
        qty_total: true,
        qty_remaining: true,
        price_open: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    return positions.map(pos => ({
      id: pos.id,
      symbol: pos.symbol,
      qty_total: pos.qty_total.toNumber(),
      qty_remaining: pos.qty_remaining.toNumber(),
      price_open: pos.price_open.toNumber(),
      created_at: pos.created_at,
    }));
  }

  @Post('import-missing-orders')
  @ApiOperation({ 
    summary: 'Importar ordens faltantes para o sistema',
    description: 'Cria TradeExecution, TradeJob e TradePosition (se BUY) ou vincula a posição existente (se SELL).'
  })
  async importMissingOrders(
    @Body() dto: { 
      accountId: number; 
      orders: Array<{
        exchangeOrderId: string;
        symbol: string;
        side: 'BUY' | 'SELL';
        qty: number;
        price: number;
        cost: number;
        fee: number;
        feeCurrency: string;
        timestamp: string;
        positionId?: number; // Para SELL, ID da posição a vincular
      }>
    }
  ) {
    console.log(`[ADMIN] Importando ${dto.orders.length} ordens para conta ${dto.accountId}...`);

    const account = await this.prisma.exchangeAccount.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new BadRequestException(`ExchangeAccount ${dto.accountId} not found`);
    }

    const results = [];

    for (const order of dto.orders) {
      try {
        // Validação: Ordens SELL devem ter positionId
        if (order.side === 'SELL' && (!order.positionId || order.positionId <= 0)) {
          throw new BadRequestException(`Ordem SELL ${order.exchangeOrderId} requer positionId. FIFO foi removido - todas as ordens SELL devem ter position_id_to_close.`);
        }

        await this.prisma.$transaction(async (tx) => {
          // 1. Criar TradeJob
          const job = await tx.tradeJob.create({
            data: {
              exchange_account_id: dto.accountId,
              symbol: order.symbol,
              side: order.side,
              base_quantity: order.qty,
              order_type: 'MARKET',
              trade_mode: account.is_simulation ? 'SIMULATION' : 'REAL',
              status: 'FILLED',
              reason_code: 'IMPORTED',
              reason_message: 'Ordem importada via admin tools',
              position_id_to_close: order.side === 'SELL' ? order.positionId : null,
            },
          });

          // 2. Criar TradeExecution
          const execution = await tx.tradeExecution.create({
            data: {
              trade_job_id: job.id,
              exchange_account_id: dto.accountId,
              trade_mode: account.is_simulation ? 'SIMULATION' : 'REAL',
              exchange: account.exchange,
              exchange_order_id: order.exchangeOrderId,
              client_order_id: `IMPORTED_${order.exchangeOrderId}`,
              status_exchange: 'FILLED',
              executed_qty: order.qty,
              avg_price: order.price,
              cumm_quote_qty: order.cost,
              fee_amount: order.fee,
              fee_currency: order.feeCurrency,
              created_at: new Date(order.timestamp),
            },
          });

          // 3. Se BUY, criar TradePosition
          if (order.side === 'BUY') {
            const position = await tx.tradePosition.create({
              data: {
                exchange_account: {
                  connect: { id: dto.accountId },
                },
                open_job: {
                  connect: { id: job.id },
                },
                symbol: order.symbol,
                side: 'LONG',
                trade_mode: account.is_simulation ? 'SIMULATION' : 'REAL',
                qty_total: order.qty,
                qty_remaining: order.qty,
                price_open: order.price,
                status: 'OPEN',
                created_at: new Date(order.timestamp),
              },
            });

            // Criar PositionFill
            await tx.positionFill.create({
              data: {
                position_id: position.id,
                trade_execution_id: execution.id,
                side: 'BUY',
                qty: order.qty,
                price: order.price,
              },
            });

            console.log(`[ADMIN] BUY importado: Posição #${position.id} criada`);
          }

          // 4. Se SELL, vincular a posição
          if (order.side === 'SELL' && order.positionId) {
            const position = await tx.tradePosition.findUnique({
              where: { id: order.positionId },
            });

            if (!position) {
              throw new Error(`Posição #${order.positionId} não encontrada`);
            }

            const qtyToClose = Math.min(position.qty_remaining.toNumber(), order.qty);
            const grossProfit = (order.price - position.price_open.toNumber()) * qtyToClose;
            const netProfit = grossProfit - order.fee;
            const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
            const isClosed = newQtyRemaining <= 0.00001;

            await tx.tradePosition.update({
              where: { id: order.positionId },
              data: {
                qty_remaining: { decrement: qtyToClose },
                status: isClosed ? 'CLOSED' : 'OPEN',
                realized_profit_usd: { increment: netProfit },
                close_reason: isClosed ? 'IMPORTED' : null,
                closed_at: isClosed ? new Date(order.timestamp) : null,
              },
            });

            // Criar PositionFill
            await tx.positionFill.create({
              data: {
                position_id: order.positionId,
                trade_execution_id: execution.id,
                side: 'SELL',
                qty: qtyToClose,
                price: order.price,
              },
            });

            console.log(`[ADMIN] SELL importado: Posição #${order.positionId} ${isClosed ? 'fechada' : 'parcialmente fechada'}`);
          }

          results.push({
            exchangeOrderId: order.exchangeOrderId,
            success: true,
            jobId: job.id,
            executionId: execution.id,
          });
        });
      } catch (error: any) {
        console.error(`[ADMIN] Erro ao importar ordem ${order.exchangeOrderId}:`, error.message);
        results.push({
          exchangeOrderId: order.exchangeOrderId,
          success: false,
          error: error.message,
        });
      }
    }

    const imported = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[ADMIN] Importação concluída: ${imported} importadas, ${failed} falhadas`);

    return { imported, failed, results };
  }
}

