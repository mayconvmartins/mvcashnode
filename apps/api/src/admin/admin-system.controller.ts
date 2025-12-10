import { Controller, Get, Post, Put, UseGuards, Body, BadRequestException } from '@nestjs/common';
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
          exchange_order_id: { not: null },
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
    description: 'Verifica uma a uma todas as posições abertas, execuções e taxas na exchange via API, comparando com dados do banco e reportando discrepâncias.',
  })
  @ApiResponse({
    status: 200,
    description: 'Auditoria concluída',
  })
  async auditAll() {
    console.log('[ADMIN] Iniciando auditoria completa de posições...');
    
    const startTime = Date.now();
    let totalPositionsChecked = 0;
    let totalExecutionsChecked = 0;
    const discrepancies: Array<{
      type: string;
      entityType: 'EXECUTION' | 'POSITION';
      entityId: number;
      field: string;
      currentValue: number | string;
      expectedValue: number | string;
      canAutoFix: boolean;
      fixDescription: string;
    }> = [];
    const errors: Array<{ positionId?: number; executionId?: number; error: string }> = [];

    try {
      // Buscar todas posições abertas (REAL)
      const openPositions = await this.prisma.tradePosition.findMany({
        where: {
          status: 'OPEN',
          trade_mode: 'REAL',
        },
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

      totalPositionsChecked = openPositions.length;
      console.log(`[ADMIN] Encontradas ${totalPositionsChecked} posições abertas para auditar`);

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
                  try {
                    if (account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
                      order = await adapter.fetchClosedOrder(execution.exchange_order_id, execution.trade_job.symbol);
                    } else {
                      // Para Binance, não passar parâmetros extras (não aceita acknowledged)
                      const params = account.exchange === 'BINANCE_SPOT' ? undefined : { acknowledged: true };
                      order = await adapter.fetchOrder(execution.exchange_order_id, execution.trade_job.symbol, params);
                    }
                  } catch (orderError: any) {
                    errors.push({
                      executionId: execution.id,
                      error: `Erro ao buscar ordem na exchange: ${orderError.message}`,
                    });
                    continue;
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

                  // Buscar taxas via fetchMyTrades
                  let realFeeAmount = 0;
                  let realFeeCurrency = '';
                  try {
                    const since = execution.created_at.getTime() - 3600000; // 1 hora antes
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

      const duration = Date.now() - startTime;
      console.log(`[ADMIN] Auditoria concluída em ${duration}ms: ${totalPositionsChecked} posições, ${totalExecutionsChecked} execuções, ${discrepancies.length} discrepância(s), ${errors.length} erro(s)`);

      return {
        total_positions_checked: totalPositionsChecked,
        total_executions_checked: totalExecutionsChecked,
        discrepancies_found: discrepancies.length,
        discrepancies,
        errors: errors.length,
        error_details: errors,
        duration_ms: duration,
      };
    } catch (error: any) {
      console.error('[ADMIN] Erro na auditoria:', error);
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
    entityType: 'EXECUTION' | 'POSITION';
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

    // ✅ BUG-BAIXO-004 FIX: Adicionar paginação padrão
    const pendingOrders = await this.prisma.tradeJob.findMany({
      where: whereConditions,
      take: 50,
      skip: 0,
      include: {
        exchange_account: true,
        executions: {
          where: { exchange_order_id: { not: null } },
          take: 1,
          orderBy: { id: 'desc' },
        },
      },
    });

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        ordersFound: pendingOrders.length,
        orders: pendingOrders.map((o) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          orderType: o.order_type,
          status: o.status,
          hasExchangeOrder: o.executions.length > 0,
          exchangeOrderId: o.executions[0]?.exchange_order_id || null,
          accountId: o.exchange_account_id,
          accountLabel: o.exchange_account.label,
        })),
      };
    }

    // Cancelar ordens
    const results = {
      total: pendingOrders.length,
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

    console.log(`[ADMIN] Cancelamento concluído: ${results.canceledInDb} canceladas no banco, ${results.canceledInExchange} na exchange, ${results.errors} erros`);

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
    description: 'Vincula manualmente executions órfãs às suas posições, fechando as posições retroativamente e recalculando lucros.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado da correção',
  })
  async fixOrphanedExecutions(@Body() dto: { jobIds: number[] }) {
    console.log(`[ADMIN] Corrigindo ${dto.jobIds.length} executions órfãs...`);
    
    const results = [];
    
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

        if (!job.position_to_close) {
          results.push({ jobId, success: false, error: 'Position not found' });
          continue;
        }
        
        const execution = job.executions[0];
        const position = job.position_to_close;
        
        // Reprocessar vinculação
        await this.prisma.$transaction(async (tx) => {
          // Fechar posição retroativamente
          const qtyToClose = Math.min(
            position.qty_remaining.toNumber(),
            execution.executed_qty.toNumber()
          );
          
          const grossProfit = (execution.avg_price.toNumber() - position.price_open.toNumber()) * qtyToClose;
          const netProfit = grossProfit - (execution.fee_amount?.toNumber() || 0);

          const newQtyRemaining = position.qty_remaining.toNumber() - qtyToClose;
          const isClosed = newQtyRemaining <= 0.00001;
          
          await tx.tradePosition.update({
            where: { id: position.id },
            data: {
              qty_remaining: { decrement: qtyToClose },
              status: isClosed ? 'CLOSED' : 'OPEN',
              price_close: execution.avg_price,
              profit_usd: { increment: netProfit },
              close_reason: 'MANUAL_FIX',
              closed_at: isClosed ? new Date() : position.closed_at,
            },
          });
          
          // Atualizar job para FILLED
          await tx.tradeJob.update({
            where: { id: jobId },
            data: {
              status: 'FILLED',
              reason_code: 'MANUALLY_FIXED',
              reason_message: 'Execution vinculada manualmente via admin tools',
            },
          });

          console.log(`[ADMIN] Job ${jobId} corrigido: posição ${position.id} fechada com ${qtyToClose} units, lucro ${netProfit.toFixed(2)} USD`);
        });
        
        results.push({ jobId, success: true, qtyFixed: execution.executed_qty.toNumber() });
      } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error';
        console.error(`[ADMIN] Erro ao corrigir job ${jobId}: ${errorMsg}`);
        results.push({ jobId, success: false, error: errorMsg });
      }
    }

    const fixed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`[ADMIN] Correção concluída: ${fixed} corrigidas, ${failed} falhadas`);
    
    return { 
      fixed,
      failed,
      results 
    };
  }
}

