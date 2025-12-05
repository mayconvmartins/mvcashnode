import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { UpdateSLTPDto } from './dto/update-sltp.dto';
import { ClosePositionDto } from './dto/close-position.dto';
import { SellLimitDto } from './dto/sell-limit.dto';
import { CreateManualPositionDto, CreateManualPositionMethod } from './dto/create-manual-position.dto';
import { CreateManualBuyDto } from './dto/create-manual-buy.dto';
import { TradeJobService } from '@mvcashnode/domain';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';
import { PrismaService } from '@mvcashnode/db';
import { OrderType, ExchangeType, CacheService, UserRole } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { WebSocketService } from '../websocket/websocket.service';
import { PositionService, TradeParameterService } from '@mvcashnode/domain';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';

@ApiTags('Positions')
@Controller('positions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PositionsController {
  private cacheService: CacheService;

  private positionService: PositionService;
  private tradeParameterService: TradeParameterService;

  constructor(
    private positionsService: PositionsService,
    private tradeJobQueueService: TradeJobQueueService,
    private prisma: PrismaService,
    private wsService: WebSocketService,
    private encryptionService: EncryptionService
  ) {
    this.positionService = new PositionService(this.prisma);
    this.tradeParameterService = new TradeParameterService(this.prisma);
    // Inicializar cache service Redis
    this.cacheService = new CacheService(
      process.env.REDIS_HOST || 'localhost',
      parseInt(process.env.REDIS_PORT || '6379'),
      process.env.REDIS_PASSWORD
    );
    this.cacheService.connect().catch((err) => {
      console.error('[PositionsController] Erro ao conectar ao Redis:', err);
    });
  }

  @Get()
  @ApiOperation({ 
    summary: 'Listar posições',
    description: 'Retorna todas as posições do usuário autenticado com filtros opcionais. Suporta paginação e filtros por status, modo de trading, conta de exchange, símbolo e período.',
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: ['OPEN', 'CLOSED'],
    description: 'Filtrar por status da posição (aberta ou fechada)',
    example: 'OPEN'
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading (REAL ou SIMULATION)',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'exchange_account_id', 
    required: false, 
    type: Number,
    description: 'Filtrar por ID da conta de exchange',
    example: 1
  })
  @ApiQuery({ 
    name: 'symbol', 
    required: false, 
    type: String,
    description: 'Filtrar por símbolo do par de trading (ex: BTCUSDT, SOL/USDT)',
    example: 'BTCUSDT'
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    type: String,
    description: 'Data inicial para filtrar posições (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    type: String,
    description: 'Data final para filtrar posições (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Número da página para paginação (começa em 1)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Quantidade de itens por página',
    example: 20
  })
  @ApiQuery({ 
    name: 'include_fills', 
    required: false, 
    type: Boolean,
    description: 'Incluir fills na resposta (padrão: false para melhor performance)',
    example: false
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de posições retornada com sucesso',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              exchange_account_id: { type: 'number', example: 1 },
              symbol: { type: 'string', example: 'BTCUSDT' },
              side: { type: 'string', enum: ['BUY', 'SELL'], example: 'BUY' },
              status: { type: 'string', enum: ['OPEN', 'CLOSED'], example: 'OPEN' },
              qty_total: { type: 'number', example: 0.001 },
              qty_remaining: { type: 'number', example: 0.001 },
              price_open: { type: 'number', example: 50000 },
              price_close: { type: 'number', nullable: true, example: null },
              pnl: { type: 'number', nullable: true, example: 0 },
              pnl_pct: { type: 'number', nullable: true, example: 0 },
              sl_enabled: { type: 'boolean', example: true },
              sl_pct: { type: 'number', nullable: true, example: 2.0 },
              tp_enabled: { type: 'boolean', example: true },
              tp_pct: { type: 'number', nullable: true, example: 5.0 },
              current_price: { type: 'number', nullable: true, example: 51000 },
              invested_value_usd: { type: 'number', nullable: true, example: 50.0 },
              current_value_usd: { type: 'number', nullable: true, example: 51.0 },
              unrealized_pnl: { type: 'number', nullable: true, example: 1.0 },
              unrealized_pnl_pct: { type: 'number', nullable: true, example: 2.0 },
              created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            current_page: { type: 'number', example: 1 },
            per_page: { type: 'number', example: 20 },
            total_items: { type: 'number', example: 100 },
            total_pages: { type: 'number', example: 5 },
          },
        },
        summary: {
          type: 'object',
          properties: {
            total_invested: { type: 'number', example: 1000.0 },
            total_current_value: { type: 'number', example: 1050.0 },
            total_unrealized_pnl: { type: 'number', example: 50.0 },
            total_unrealized_pnl_pct: { type: 'number', example: 5.0 },
            total_realized_pnl: { type: 'number', example: 25.0 },
          },
        },
      },
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('trade_mode') tradeMode?: string,
    @Query('exchange_account_id') exchangeAccountId?: number,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('include_fills') includeFills?: boolean
  ): Promise<any> {
    const startTime = Date.now();
    try {
      // Buscar IDs das exchange accounts do usuário (com cache)
      const cacheKey = `user:${user.userId}:accounts`;
      let accountIds: number[] = [];
      
      const cachedAccounts = await this.cacheService.get<number[]>(cacheKey);
      if (cachedAccounts) {
        accountIds = cachedAccounts;
      } else {
        const userAccounts = await this.prisma.exchangeAccount.findMany({
          where: { user_id: user.userId },
          select: { id: true },
        });
        accountIds = userAccounts.map((acc) => acc.id);
        // Cachear por 5 minutos
        await this.cacheService.set(cacheKey, accountIds, { ttl: 300 });
      }

      if (accountIds.length === 0) {
        return {
          data: [],
          pagination: {
            current_page: page || 1,
            per_page: limit || 20,
            total_items: 0,
            total_pages: 0,
          },
          summary: {
            total_invested: 0,
            total_current_value: 0,
            total_unrealized_pnl: 0,
            total_unrealized_pnl_pct: 0,
            total_realized_pnl: 0,
          },
        };
      }

      // Construir filtros (todos aplicados na WHERE clause)
      const where: any = {
        exchange_account_id: { in: accountIds },
      };

      if (status) {
        where.status = status.toUpperCase();
      }

      // Sempre aplicar filtro de trade_mode se fornecido
      if (tradeMode) {
        const normalizedTradeMode = String(tradeMode).toUpperCase().trim();
        if (normalizedTradeMode === 'REAL' || normalizedTradeMode === 'SIMULATION') {
          where.trade_mode = normalizedTradeMode;
        }
      }

      if (exchangeAccountId) {
        // Validar que a conta pertence ao usuário
        if (!accountIds.includes(exchangeAccountId)) {
          throw new BadRequestException('Conta de exchange não encontrada ou não pertence ao usuário');
        }
        where.exchange_account_id = exchangeAccountId;
      }

      if (symbol) {
        where.symbol = symbol;
      }

      // Filtros de data
      if (from || to) {
        where.created_at = {};
        if (from) {
          where.created_at.gte = new Date(from);
        }
        if (to) {
          where.created_at.lte = new Date(to);
        }
      }

      // Paginação
      const pageNum = page || 1;
      const limitNum = limit || 20;
      const skip = (pageNum - 1) * limitNum;

      // Determinar se deve incluir fills (apenas se solicitado explicitamente)
      const shouldIncludeFills = includeFills === true;

      // Executar count e findMany em paralelo
      const [positions, total] = await Promise.all([
        this.prisma.tradePosition.findMany({
          where,
          select: {
            id: true,
            exchange_account_id: true,
            trade_mode: true,
            symbol: true,
            side: true,
            qty_total: true,
            qty_remaining: true,
            price_open: true,
            status: true,
            realized_profit_usd: true,
            sl_enabled: true,
            sl_pct: true,
            tp_enabled: true,
            tp_pct: true,
            min_profit_pct: true,
            is_grouped: true,
            group_started_at: true,
            created_at: true,
            exchange_account: {
              select: {
                id: true,
                label: true,
                exchange: true,
                is_simulation: true,
              },
            },
            open_job: {
              select: {
                id: true,
                symbol: true,
                side: true,
                order_type: true,
                status: true,
                created_at: true,
              },
            },
            fills: {
              where: {
                side: 'SELL',
              },
              select: shouldIncludeFills ? {
                id: true,
                price: true,
                qty: true,
                created_at: true,
                execution: {
                  select: {
                    id: true,
                    avg_price: true,
                    executed_qty: true,
                    created_at: true,
                    trade_job: {
                      select: {
                        id: true,
                        symbol: true,
                        side: true,
                        order_type: true,
                        status: true,
                        created_at: true,
                        limit_price: true,
                        base_quantity: true,
                        quote_amount: true,
                      },
                    },
                  },
                },
              } : {
                id: true,
                price: true,
                qty: true,
                created_at: true,
                execution: {
                  select: {
                    id: true,
                    avg_price: true,
                    created_at: true,
                  },
                },
              },
              orderBy: {
                created_at: 'desc',
              },
              take: 1, // Apenas o fill mais recente para price_close
            },
          },
          orderBy: {
            created_at: 'desc',
          },
          skip,
          take: limitNum,
        }),
        this.prisma.tradePosition.count({ where }),
      ]);

      // Separar posições abertas e fechadas (já filtradas pela WHERE clause)
      const openPositions = positions.filter(p => p.status === 'OPEN');
      const closedPositions = positions.filter(p => p.status === 'CLOSED');

      // Agrupar símbolos únicos por exchange para buscar preços do cache
      const symbolExchangeMap = new Map<string, { symbols: Set<string>; exchange: string }>();
      
      openPositions.forEach((position) => {
        const exchange = position.exchange_account.exchange;
        const key = exchange;
        if (!symbolExchangeMap.has(key)) {
          symbolExchangeMap.set(key, { symbols: new Set(), exchange });
        }
        symbolExchangeMap.get(key)!.symbols.add(position.symbol);
      });

      // Buscar preços do cache Redis (agrupados por exchange)
      const priceMap = new Map<string, number>();
      
      for (const [exchangeKey, { symbols, exchange }] of symbolExchangeMap.entries()) {
        // Buscar preços do cache Redis para todos os símbolos desta exchange
        const cacheKeys = Array.from(symbols).map(symbol => `price:${exchange}:${symbol}`);
        const cachedPrices = await this.cacheService.mget<number>(cacheKeys);
        
        // Mapear preços encontrados
        let index = 0;
        for (const symbol of symbols) {
          const price = cachedPrices[index];
          if (price !== null && price > 0) {
            priceMap.set(`${exchange}:${symbol}`, price);
          }
          index++;
        }
        
        // Se algum preço não estiver no cache, tentar buscar da exchange como fallback
        const missingSymbols = Array.from(symbols).filter((symbol, idx) => cachedPrices[idx] === null);
        if (missingSymbols.length > 0) {
          try {
            const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);
            const fallbackPromises = missingSymbols.map(async (symbol) => {
              try {
                const ticker = await adapter.fetchTicker(symbol);
                const price = ticker.last;
                if (price && price > 0) {
                  // Armazenar no cache com TTL de 25s
                  await this.cacheService.set(`price:${exchange}:${symbol}`, price, { ttl: 25 });
                  return { symbol, price };
                }
              } catch (error: any) {
                console.warn(`[PositionsController] Erro ao buscar preço para ${symbol} na ${exchange}: ${error.message}`);
              }
              return { symbol, price: null };
            });
            
            const fallbackPrices = await Promise.all(fallbackPromises);
            fallbackPrices.forEach(({ symbol, price }) => {
              if (price !== null) {
                priceMap.set(`${exchange}:${symbol}`, price);
              }
            });
          } catch (error: any) {
            console.warn(`[PositionsController] Erro ao criar adapter para ${exchange}: ${error.message}`);
          }
        }
      }

      // Calcular métricas para cada posição
      let totalInvested = 0;
      let totalCurrentValue = 0;
      let totalUnrealizedPnl = 0;
      let totalRealizedPnl = 0;

      const positionsWithMetrics = positions.map((position) => {
        const priceOpen = position.price_open.toNumber();
        const qtyRemaining = position.qty_remaining.toNumber();
        const qtyTotal = position.qty_total.toNumber();
        
        let currentPrice: number | null = null;
        let priceClose: number | null = null;
        let unrealizedPnl: number | null = null;
        let unrealizedPnlPct: number | null = null;
        let investedValueUsd: number | null = null;
        let currentValueUsd: number | null = null;

        // Apenas buscar preço atual para posições abertas
        if (position.status === 'OPEN') {
          const priceKey = `${position.exchange_account.exchange}:${position.symbol}`;
          currentPrice = priceMap.get(priceKey) || null;

          if (currentPrice && currentPrice > 0) {
            // Valor investido (comprado) em USD
            investedValueUsd = qtyTotal * priceOpen;
            totalInvested += investedValueUsd;
            
            // Valor atual em USD
            currentValueUsd = qtyRemaining * currentPrice;
            totalCurrentValue += currentValueUsd;
            
            // PnL não realizado (unrealized PnL)
            unrealizedPnl = (currentPrice - priceOpen) * qtyRemaining;
            unrealizedPnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
            totalUnrealizedPnl += unrealizedPnl;
          } else {
            // Mesmo sem preço atual, calcular valor investido
            investedValueUsd = qtyTotal * priceOpen;
            totalInvested += investedValueUsd;
          }
        } else {
          // Para posições fechadas, pegar o preço médio da execução que fechou a posição
          // Pegar o fill de SELL mais recente (último que fechou) e usar o avg_price da execução
          if (position.fills && position.fills.length > 0) {
            // O fill mais recente é o primeiro da lista (ordenado por created_at desc)
            const lastSellFill = position.fills[0];
            if (lastSellFill.execution?.avg_price) {
              priceClose = lastSellFill.execution.avg_price.toNumber();
            }
          }
          
          // Calcular valor investido
          investedValueUsd = qtyTotal * priceOpen;
          totalInvested += investedValueUsd;
        }

        // PnL realizado
        const realizedPnl = position.realized_profit_usd.toNumber();
        totalRealizedPnl += realizedPnl;

        // Extrair sell_jobs dos fills (apenas fills de SELL)
        const sellJobs: any[] = [];
        if (shouldIncludeFills && position.fills) {
          const uniqueJobIds = new Set<number>();
          
          for (const fill of position.fills) {
            // Type guard: verificar se execution tem trade_job (só quando shouldIncludeFills é true)
            const execution = fill.execution as any;
            if (execution?.trade_job) {
              const jobId = execution.trade_job.id;
              // Evitar duplicatas (mesmo job pode ter múltiplos fills)
              if (!uniqueJobIds.has(jobId)) {
                uniqueJobIds.add(jobId);
                sellJobs.push({
                  ...execution.trade_job,
                  limit_price: execution.trade_job.limit_price?.toNumber() || null,
                  base_quantity: execution.trade_job.base_quantity?.toNumber() || null,
                  quote_amount: execution.trade_job.quote_amount?.toNumber() || null,
                });
              }
            }
          }
        }

        return {
          ...position,
          current_price: currentPrice,
          price_close: priceClose,
          invested_value_usd: investedValueUsd,
          current_value_usd: currentValueUsd,
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_pct: unrealizedPnlPct,
          ...(shouldIncludeFills ? { sell_jobs: sellJobs } : {}),
        };
      });

      // Calcular status de agrupamento (grouping_open) para posições agrupadas
      // Buscar parâmetros de trade em batch para otimizar queries
      const groupedPositions = positionsWithMetrics.filter(p => p.is_grouped);
      const parameterMap = new Map<string, any>();
      
      if (groupedPositions.length > 0) {
        // Agrupar posições por exchange_account_id e symbol para buscar parâmetros
        const uniqueKeys = new Set<string>();
        groupedPositions.forEach(pos => {
          const key = `${pos.exchange_account_id}:${pos.symbol}`;
          uniqueKeys.add(key);
        });

        // Buscar todos os parâmetros relevantes de uma vez
        // Como os símbolos podem ter vírgulas (múltiplos símbolos), buscar todos os parâmetros das contas
        const accountIds = Array.from(new Set(Array.from(uniqueKeys).map(key => parseInt(key.split(':')[0]))));
        
        const parameters = await this.prisma.tradeParameter.findMany({
          where: {
            exchange_account_id: { in: accountIds },
            side: { in: ['BUY', 'BOTH'] },
          },
          select: {
            exchange_account_id: true,
            symbol: true,
            group_positions_enabled: true,
            group_positions_interval_minutes: true,
          },
        });

        // Criar mapa para acesso rápido
        // Como símbolos podem ter vírgulas, criar entradas para cada símbolo individual
        parameters.forEach(param => {
          const key = `${param.exchange_account_id}:${param.symbol}`;
          parameterMap.set(key, param);
          
          // Se o símbolo tem vírgulas, criar entradas individuais também
          if (param.symbol.includes(',')) {
            const individualSymbols = param.symbol.split(',').map(s => s.trim());
            individualSymbols.forEach(symbol => {
              const individualKey = `${param.exchange_account_id}:${symbol}`;
              if (!parameterMap.has(individualKey)) {
                parameterMap.set(individualKey, param);
              }
            });
          }
        });

        // Função auxiliar para normalizar símbolo (mesma lógica do trade-parameter.service.ts)
        const normalizeSymbol = (s: string): string => {
          if (!s) return '';
          return s.trim().toUpperCase().replace(/\.(P|F|PERP|FUTURES)$/i, '').replace(/\//g, '').replace(/\s/g, '');
        };

        // Função auxiliar para verificar se um símbolo está contido em uma string de símbolos (pode ter vírgulas)
        const symbolMatches = (positionSymbol: string, parameterSymbol: string): boolean => {
          if (!parameterSymbol) return false;
          
          // Normalizar ambos os símbolos
          const normalizedPos = normalizeSymbol(positionSymbol);
          const normalizedParam = normalizeSymbol(parameterSymbol.trim());
          
          // Se o parâmetro tem vírgulas, verificar se o símbolo está na lista
          if (normalizedParam.includes(',') || parameterSymbol.includes(',')) {
            // Usar o símbolo original para split, mas normalizar cada um
            const paramSymbols = parameterSymbol.split(',').map(s => s.trim()).filter(s => s.length > 0);
            return paramSymbols.some(s => {
              const normalized = normalizeSymbol(s);
              return normalized === normalizedPos;
            });
          }
          
          // Caso contrário, comparar diretamente
          return normalizedParam === normalizedPos;
        };

        // Calcular grouping_open para cada posição agrupada
        positionsWithMetrics.forEach((position: any) => {
          if (position.is_grouped) {
            // Normalizar símbolo da posição para busca
            const normalizedPositionSymbol = normalizeSymbol(position.symbol);
            
            // Tentar encontrar parâmetro exato primeiro (com símbolo normalizado)
            let parameter = parameterMap.get(`${position.exchange_account_id}:${position.symbol}`);
            
            // Se não encontrou, tentar com símbolo normalizado
            if (!parameter && normalizedPositionSymbol) {
              parameter = parameterMap.get(`${position.exchange_account_id}:${normalizedPositionSymbol}`);
            }
            
            // Se ainda não encontrou, buscar em todos os parâmetros por correspondência de símbolo
            // Isso é necessário porque o parâmetro pode ter múltiplos símbolos separados por vírgula
            if (!parameter) {
              // Buscar em todos os parâmetros da mesma conta
              for (const param of parameters) {
                if (param.exchange_account_id === position.exchange_account_id) {
                  // Verificar se o símbolo da posição está contido no campo symbol do parâmetro
                  if (symbolMatches(position.symbol, param.symbol)) {
                    parameter = param;
                    console.log(`[PositionsController] Parâmetro encontrado para posição ${position.id}: symbol="${position.symbol}" (normalized: "${normalizedPositionSymbol}") -> param.symbol="${param.symbol}"`);
                    break;
                  }
                }
              }
            } else {
              console.log(`[PositionsController] Parâmetro encontrado via mapa para posição ${position.id}: symbol="${position.symbol}"`);
            }

            if (!parameter) {
              console.warn(`[PositionsController] Nenhum parâmetro encontrado para posição ${position.id}: account=${position.exchange_account_id}, symbol="${position.symbol}" (normalized: "${normalizedPositionSymbol}")`);
              console.warn(`[PositionsController] Parâmetros disponíveis para esta conta:`, 
                parameters.filter(p => p.exchange_account_id === position.exchange_account_id).map(p => ({
                  id: p.id,
                  symbol: p.symbol,
                  symbol_normalized: normalizeSymbol(p.symbol)
                }))
              );
            }

            // Usar função helper para calcular grouping_open
            const groupingOpen = this.positionService.isGroupingOpen(
              {
                is_grouped: position.is_grouped,
                group_started_at: position.group_started_at ? new Date(position.group_started_at) : null,
                created_at: new Date(position.created_at),
              },
              parameter
            );

            position.grouping_open = groupingOpen;
          } else {
            position.grouping_open = null;
          }
        });
      } else {
        // Se não há posições agrupadas, definir grouping_open como null para todas
        positionsWithMetrics.forEach((position: any) => {
          position.grouping_open = null;
        });
      }

      // Calcular percentual de PnL não realizado
      const totalUnrealizedPnlPct = totalInvested > 0 
        ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 
        : 0;

      const duration = Date.now() - startTime;
      
      // Log de performance para queries lentas (>1s)
      if (duration > 1000) {
        console.warn(`[PositionsController] GET /positions executou em ${duration}ms (LENTO!) - userId: ${user.userId}, status: ${status}, tradeMode: ${tradeMode}`);
      }

      return {
        data: positionsWithMetrics,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_items: total,
          total_pages: Math.ceil(total / limitNum),
        },
        summary: {
          total_invested: totalInvested,
          total_current_value: totalCurrentValue,
          total_unrealized_pnl: totalUnrealizedPnl,
          total_unrealized_pnl_pct: totalUnrealizedPnlPct,
          total_realized_pnl: totalRealizedPnl,
        },
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.error(`[PositionsController] GET /positions ERRO após ${duration}ms - userId: ${user.userId}`);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao buscar posições: ${error.message}`);
    }
  }

  @Post('sync-missing')
  @ApiOperation({
    summary: 'Sincronizar posições faltantes',
    description: 'Busca jobs BUY FILLED sem posição e cria as posições faltantes, verificando na exchange se necessário',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronização concluída',
    schema: {
      example: {
        total_checked: 10,
        positions_created: 2,
        executions_updated: 1,
        errors: [],
      },
    },
  })
  async syncMissingPositions(@CurrentUser() user: any): Promise<any> {
    console.log(`[SYNC-MISSING] Iniciando sincronização de posições faltantes para usuário ${user.userId}`);
    
    try {
      // Buscar IDs das exchange accounts do usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);
      console.log(`[SYNC-MISSING] Contas do usuário: ${accountIds.length} conta(s)`);

      if (accountIds.length === 0) {
        console.log(`[SYNC-MISSING] Nenhuma conta encontrada para o usuário`);
        return {
          total_checked: 0,
          positions_created: 0,
          executions_updated: 0,
          errors: [],
        };
      }

      // Buscar jobs BUY FILLED sem posição associada
      const jobsWithoutPosition = await this.prisma.tradeJob.findMany({
        where: {
          exchange_account_id: { in: accountIds },
          side: 'BUY',
          status: 'FILLED',
          position_open: null,
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              exchange: true,
              is_simulation: true,
              testnet: true,
            },
          },
          executions: {
            orderBy: {
              created_at: 'desc',
            },
            take: 1, // Pegar a execução mais recente
          },
        },
      });

      console.log(`[SYNC-MISSING] Encontrados ${jobsWithoutPosition.length} jobs BUY FILLED sem posição`);

      // Filtrar jobs que já estão em PositionGroupedJob (já foram agrupados)
      const groupedJobIds = await this.prisma.positionGroupedJob.findMany({
        select: { trade_job_id: true },
      });
      const groupedJobIdsSet = new Set(groupedJobIds.map(gj => gj.trade_job_id));
      
      // Filtrar jobs que não estão agrupados
      const jobsToProcess = jobsWithoutPosition.filter(job => !groupedJobIdsSet.has(job.id));
      
      const skippedGrouped = jobsWithoutPosition.length - jobsToProcess.length;
      if (skippedGrouped > 0) {
        console.log(`[SYNC-MISSING] ${skippedGrouped} job(s) ignorado(s) (já agrupado(s))`);
      }

      let positionsCreated = 0;
      let executionsUpdated = 0;
      const errors: Array<{ jobId: number; error: string }> = [];

      for (const job of jobsToProcess) {
        try {
          console.log(`[SYNC-MISSING] Processando job ${job.id} (${job.symbol}, conta ${job.exchange_account_id})`);
          
          let execution = job.executions[0];
          let shouldUpdateExecution = false;
          let finalExecutedQty = execution?.executed_qty?.toNumber() || 0;
          let finalAvgPrice = execution?.avg_price?.toNumber() || 0;
          let finalCummQuoteQty = execution?.cumm_quote_qty?.toNumber() || 0;

          console.log(`[SYNC-MISSING] Job ${job.id} - Execução atual: qty=${finalExecutedQty}, price=${finalAvgPrice}, cost=${finalCummQuoteQty}, orderId=${execution?.exchange_order_id || 'N/A'}`);

          // SEMPRE verificar na exchange se:
          // 1. Não há execução
          // 2. A execução tem quantidade 0 OU preço 0 (valores zerados)
          // 3. Há exchange_order_id disponível
          const needsExchangeCheck = !execution || 
                                     (execution && execution.exchange_order_id && (finalExecutedQty === 0 || finalAvgPrice === 0));

          if (needsExchangeCheck) {
            if (job.exchange_account.is_simulation) {
              // Para simulação, não podemos verificar na exchange
              console.log(`[SYNC-MISSING] Job ${job.id} é de simulação, pulando verificação na exchange`);
              errors.push({
                jobId: job.id,
                error: 'Job de simulação sem execução válida',
              });
              continue;
            }

            // Verificar se temos exchange_order_id para buscar na exchange
            const exchangeOrderId = execution?.exchange_order_id;
            if (!exchangeOrderId) {
              console.log(`[SYNC-MISSING] Job ${job.id} não tem exchange_order_id, não é possível verificar na exchange`);
              errors.push({
                jobId: job.id,
                error: 'Job sem exchange_order_id para verificar na exchange',
              });
              continue;
            }

            try {
              console.log(`[SYNC-MISSING] Job ${job.id} - Verificando ordem ${exchangeOrderId} na exchange ${job.exchange_account.exchange}...`);
              
              // Obter chaves da API
              const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
              const keys = await accountService.decryptApiKeys(job.exchange_account_id);

              if (!keys || !keys.apiKey || !keys.apiSecret) {
                console.log(`[SYNC-MISSING] Job ${job.id} - API keys não encontradas`);
                errors.push({
                  jobId: job.id,
                  error: 'API keys não encontradas',
                });
                continue;
              }

              // Criar adapter
              const adapter = AdapterFactory.createAdapter(
                job.exchange_account.exchange as ExchangeType,
                keys.apiKey,
                keys.apiSecret,
                { testnet: job.exchange_account.testnet }
              );

              // Buscar ordem na exchange
              // Para Bybit, usar fetchClosedOrder (ordens antigas não estão nas últimas 500)
              let order;
              if (job.exchange_account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
                console.log(`[SYNC-MISSING] Job ${job.id} - Usando fetchClosedOrder para ordem antiga da Bybit`);
                order = await adapter.fetchClosedOrder(exchangeOrderId, job.symbol);
              } else {
                order = await adapter.fetchOrder(exchangeOrderId, job.symbol);
              }
              console.log(`[SYNC-MISSING] Job ${job.id} - Dados da exchange:`, {
                status: order.status,
                filled: order.filled,
                amount: order.amount,
                cost: order.cost,
                average: order.average,
                price: order.price,
                fillsCount: order.fills?.length || 0,
              });

              // Extrair dados da ordem
              let updatedFilled = order.filled || 0;
              let updatedAverage = order.average || order.price || 0;
              let updatedCost = order.cost || 0;

              // Se não encontrou dados diretos, tentar extrair dos fills
              if ((updatedFilled === 0 || updatedAverage === 0) && order.fills && order.fills.length > 0) {
                console.log(`[SYNC-MISSING] Job ${job.id} - Extraindo dados dos fills (${order.fills.length} fill(s))`);
                let totalFilled = 0;
                let totalCost = 0;

                for (const fill of order.fills) {
                  const fillQty = fill.amount || fill.quantity || 0;
                  const fillPrice = fill.price || 0;
                  totalFilled += fillQty;
                  totalCost += fillQty * fillPrice;
                  console.log(`[SYNC-MISSING] Job ${job.id} - Fill: qty=${fillQty}, price=${fillPrice}`);
                }

                if (totalFilled > 0) {
                  updatedFilled = totalFilled;
                  updatedAverage = totalCost / totalFilled;
                  updatedCost = totalCost;
                  console.log(`[SYNC-MISSING] Job ${job.id} - Dados calculados dos fills: qty=${updatedFilled}, avgPrice=${updatedAverage}, cost=${updatedCost}`);
                }
              }

              if (updatedFilled > 0 && updatedAverage > 0) {
                finalExecutedQty = updatedFilled;
                finalAvgPrice = updatedAverage;
                finalCummQuoteQty = updatedCost > 0 ? updatedCost : (updatedFilled * updatedAverage);
                shouldUpdateExecution = true;
                console.log(`[SYNC-MISSING] Job ${job.id} - Dados atualizados: qty=${finalExecutedQty}, price=${finalAvgPrice}, cost=${finalCummQuoteQty}`);
              } else {
                console.log(`[SYNC-MISSING] Job ${job.id} - Ordem na exchange também tem valores zerados ou inválidos`);
              }
            } catch (exchangeError: any) {
              console.error(`[SYNC-MISSING] Job ${job.id} - Erro ao verificar na exchange:`, exchangeError.message);
              console.error(`[SYNC-MISSING] Stack:`, exchangeError.stack);
              errors.push({
                jobId: job.id,
                error: `Erro ao verificar na exchange: ${exchangeError.message}`,
              });
              continue;
            }
          }

          // Se ainda não temos execução válida, pular
          if (finalExecutedQty === 0 || finalAvgPrice === 0) {
            errors.push({
              jobId: job.id,
              error: 'Execução sem quantidade ou preço válido',
            });
            continue;
          }

          // Atualizar execução se necessário (sempre que os dados foram corrigidos)
          if (shouldUpdateExecution && execution) {
            console.log(`[SYNC-MISSING] Job ${job.id} - Atualizando execução ${execution.id} com dados corretos`);
            await this.prisma.tradeExecution.update({
              where: { id: execution.id },
              data: {
                executed_qty: finalExecutedQty,
                avg_price: finalAvgPrice,
                cumm_quote_qty: finalCummQuoteQty,
                status_exchange: 'FILLED',
              },
            });
            executionsUpdated++;
            console.log(`[SYNC-MISSING] Job ${job.id} - Execução ${execution.id} atualizada com sucesso`);
          }

          // Criar posição
          console.log(`[SYNC-MISSING] Job ${job.id} - Criando posição com qty=${finalExecutedQty}, price=${finalAvgPrice}`);
          const positionService = new PositionService(this.prisma);
          const executionId = execution?.id;
          
          if (!executionId) {
            // Se não há execução, criar uma nova
            console.log(`[SYNC-MISSING] Job ${job.id} - Criando nova execução`);
            const newExecution = await this.prisma.tradeExecution.create({
              data: {
                trade_job_id: job.id,
                exchange_account_id: job.exchange_account_id,
                trade_mode: job.trade_mode,
                exchange: job.exchange_account.exchange,
                exchange_order_id: execution?.exchange_order_id || `SYNC-${job.id}`,
                client_order_id: `sync-${job.id}-${Date.now()}`,
                status_exchange: 'FILLED',
                executed_qty: finalExecutedQty,
                cumm_quote_qty: finalCummQuoteQty,
                avg_price: finalAvgPrice,
              },
            });
            
            const positionId = await positionService.onBuyExecuted(
              job.id,
              newExecution.id,
              finalExecutedQty,
              finalAvgPrice
            );
            console.log(`[SYNC-MISSING] Job ${job.id} - Posição ${positionId} criada com sucesso`);
          } else {
            const positionId = await positionService.onBuyExecuted(
              job.id,
              executionId,
              finalExecutedQty,
              finalAvgPrice
            );
            console.log(`[SYNC-MISSING] Job ${job.id} - Posição ${positionId} criada com sucesso`);
          }

          positionsCreated++;
        } catch (error: any) {
          console.error(`[SYNC-MISSING] Job ${job.id} - Erro ao processar:`, error.message);
          console.error(`[SYNC-MISSING] Stack:`, error.stack);
          errors.push({
            jobId: job.id,
            error: error.message || 'Erro desconhecido',
          });
        }
      }

      console.log(`[SYNC-MISSING] Sincronização concluída: ${positionsCreated} posição(ões) criada(s), ${executionsUpdated} execução(ões) atualizada(s), ${errors.length} erro(s)`);

      return {
        total_checked: jobsWithoutPosition.length,
        positions_created: positionsCreated,
        executions_updated: executionsUpdated,
        errors,
      };
    } catch (error: any) {
      console.error(`[SYNC-MISSING] Erro geral na sincronização:`, error.message);
      console.error(`[SYNC-MISSING] Stack:`, error.stack);
      throw new BadRequestException(`Erro ao sincronizar posições: ${error.message}`);
    }
  }

  @Post('sync-missing-all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Sincronizar posições faltantes para todos os usuários (Admin)',
    description: 'Busca jobs BUY FILLED sem posição para todos os usuários e cria as posições faltantes, verificando na exchange se necessário',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronização concluída',
    schema: {
      example: {
        total_users: 5,
        total_checked: 50,
        positions_created: 10,
        executions_updated: 5,
        errors: [],
      },
    },
  })
  async syncMissingPositionsAll(): Promise<any> {
    console.log(`[SYNC-MISSING-ALL] Iniciando sincronização de posições faltantes para todos os usuários`);
    
    try {
      // Buscar todos os usuários ativos
      const users = await this.prisma.user.findMany({
        where: {
          is_active: true,
        },
        select: {
          id: true,
        },
      });

      console.log(`[SYNC-MISSING-ALL] Encontrados ${users.length} usuário(s) ativo(s)`);

      let totalChecked = 0;
      let totalPositionsCreated = 0;
      let totalExecutionsUpdated = 0;
      const allErrors: Array<{ userId: number; jobId: number; error: string }> = [];

      // Processar cada usuário
      for (const user of users) {
        try {
          // Buscar IDs das exchange accounts do usuário
          const userAccounts = await this.prisma.exchangeAccount.findMany({
            where: { user_id: user.id },
            select: { id: true },
          });

          const accountIds = userAccounts.map((acc) => acc.id);

          if (accountIds.length === 0) {
            continue;
          }

          // Buscar jobs BUY FILLED sem posição associada
          const jobsWithoutPosition = await this.prisma.tradeJob.findMany({
            where: {
              exchange_account_id: { in: accountIds },
              side: 'BUY',
              status: 'FILLED',
              position_open: null,
            },
            include: {
              exchange_account: {
                select: {
                  id: true,
                  exchange: true,
                  is_simulation: true,
                  testnet: true,
                },
              },
              executions: {
                orderBy: {
                  created_at: 'desc',
                },
                take: 1,
              },
            },
          });

          totalChecked += jobsWithoutPosition.length;

          let positionsCreated = 0;
          let executionsUpdated = 0;

          for (const job of jobsWithoutPosition) {
            try {
              let execution = job.executions[0];
              let shouldUpdateExecution = false;
              let finalExecutedQty = execution?.executed_qty?.toNumber() || 0;
              let finalAvgPrice = execution?.avg_price?.toNumber() || 0;
              let finalCummQuoteQty = execution?.cumm_quote_qty?.toNumber() || 0;

              const needsExchangeCheck = !execution || 
                                       (execution && execution.exchange_order_id && (finalExecutedQty === 0 || finalAvgPrice === 0));

              if (needsExchangeCheck) {
                if (job.exchange_account.is_simulation) {
                  allErrors.push({
                    userId: user.id,
                    jobId: job.id,
                    error: 'Job de simulação sem execução válida',
                  });
                  continue;
                }

                const exchangeOrderId = execution?.exchange_order_id;
                if (!exchangeOrderId) {
                  allErrors.push({
                    userId: user.id,
                    jobId: job.id,
                    error: 'Job sem exchange_order_id para verificar na exchange',
                  });
                  continue;
                }

                try {
                  const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
                  const keys = await accountService.decryptApiKeys(job.exchange_account_id);

                  if (!keys || !keys.apiKey || !keys.apiSecret) {
                    allErrors.push({
                      userId: user.id,
                      jobId: job.id,
                      error: 'API keys não encontradas',
                    });
                    continue;
                  }

                  const adapter = AdapterFactory.createAdapter(
                    job.exchange_account.exchange as ExchangeType,
                    keys.apiKey,
                    keys.apiSecret,
                    { testnet: job.exchange_account.testnet }
                  );

                  let order;
                  if (job.exchange_account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
                    order = await adapter.fetchClosedOrder(exchangeOrderId, job.symbol);
                  } else {
                    order = await adapter.fetchOrder(exchangeOrderId, job.symbol);
                  }

                  let updatedFilled = order.filled || 0;
                  let updatedAverage = order.average || order.price || 0;
                  let updatedCost = order.cost || 0;

                  if ((updatedFilled === 0 || updatedAverage === 0) && order.fills && order.fills.length > 0) {
                    let totalFilled = 0;
                    let totalCost = 0;

                    for (const fill of order.fills) {
                      const fillQty = fill.amount || fill.quantity || 0;
                      const fillPrice = fill.price || 0;
                      totalFilled += fillQty;
                      totalCost += fillQty * fillPrice;
                    }

                    if (totalFilled > 0) {
                      updatedFilled = totalFilled;
                      updatedAverage = totalCost / totalFilled;
                      updatedCost = totalCost;
                    }
                  }

                  if (updatedFilled > 0 && updatedAverage > 0) {
                    finalExecutedQty = updatedFilled;
                    finalAvgPrice = updatedAverage;
                    finalCummQuoteQty = updatedCost > 0 ? updatedCost : (updatedFilled * updatedAverage);
                    shouldUpdateExecution = true;
                  }
                } catch (exchangeError: any) {
                  allErrors.push({
                    userId: user.id,
                    jobId: job.id,
                    error: `Erro ao verificar na exchange: ${exchangeError.message}`,
                  });
                  continue;
                }
              }

              if (finalExecutedQty === 0 || finalAvgPrice === 0) {
                allErrors.push({
                  userId: user.id,
                  jobId: job.id,
                  error: 'Execução sem quantidade ou preço válido',
                });
                continue;
              }

              if (shouldUpdateExecution && execution) {
                await this.prisma.tradeExecution.update({
                  where: { id: execution.id },
                  data: {
                    executed_qty: finalExecutedQty,
                    avg_price: finalAvgPrice,
                    cumm_quote_qty: finalCummQuoteQty,
                    status_exchange: 'FILLED',
                  },
                });
                executionsUpdated++;
              }

              const positionService = new PositionService(this.prisma);
              const executionId = execution?.id;
              
              if (!executionId) {
                const newExecution = await this.prisma.tradeExecution.create({
                  data: {
                    trade_job_id: job.id,
                    exchange_account_id: job.exchange_account_id,
                    trade_mode: job.trade_mode,
                    exchange: job.exchange_account.exchange,
                    exchange_order_id: execution?.exchange_order_id || `SYNC-${job.id}`,
                    client_order_id: `sync-${job.id}-${Date.now()}`,
                    status_exchange: 'FILLED',
                    executed_qty: finalExecutedQty,
                    cumm_quote_qty: finalCummQuoteQty,
                    avg_price: finalAvgPrice,
                  },
                });
                
                await positionService.onBuyExecuted(
                  job.id,
                  newExecution.id,
                  finalExecutedQty,
                  finalAvgPrice
                );
              } else {
                await positionService.onBuyExecuted(
                  job.id,
                  executionId,
                  finalExecutedQty,
                  finalAvgPrice
                );
              }

              positionsCreated++;
            } catch (error: any) {
              allErrors.push({
                userId: user.id,
                jobId: job.id,
                error: error.message || 'Erro desconhecido',
              });
            }
          }

          totalPositionsCreated += positionsCreated;
          totalExecutionsUpdated += executionsUpdated;
        } catch (error: any) {
          console.error(`[SYNC-MISSING-ALL] Erro ao processar usuário ${user.id}:`, error.message);
        }
      }

      console.log(`[SYNC-MISSING-ALL] Sincronização concluída: ${totalPositionsCreated} posição(ões) criada(s), ${totalExecutionsUpdated} execução(ões) atualizada(s), ${allErrors.length} erro(s)`);

      return {
        total_users: users.length,
        total_checked: totalChecked,
        positions_created: totalPositionsCreated,
        executions_updated: totalExecutionsUpdated,
        errors: allErrors,
      };
    } catch (error: any) {
      console.error(`[SYNC-MISSING-ALL] Erro geral na sincronização:`, error.message);
      console.error(`[SYNC-MISSING-ALL] Stack:`, error.stack);
      throw new BadRequestException(`Erro ao sincronizar posições: ${error.message}`);
    }
  }

  @Get('monitoring-tp-sl')
  @ApiOperation({ 
    summary: 'Monitorar posições com TP/SL ativado',
    description: 'Retorna posições abertas com Take Profit ou Stop Loss habilitado, incluindo cálculo de proximidade de execução e status de lucro/perda.',
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading (REAL ou SIMULATION)',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'exchange_account_id', 
    required: false, 
    type: Number,
    description: 'Filtrar por ID da conta de exchange',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de posições com monitoramento TP/SL',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              symbol: { type: 'string', example: 'BTCUSDT' },
              trade_mode: { type: 'string', example: 'REAL' },
              price_open: { type: 'number', example: 50000 },
              current_price: { type: 'number', example: 51000 },
              pnl_pct: { type: 'number', example: 2.0 },
              tp_enabled: { type: 'boolean', example: true },
              tp_pct: { type: 'number', example: 5.0 },
              sl_enabled: { type: 'boolean', example: true },
              sl_pct: { type: 'number', example: 2.0 },
              tp_proximity_pct: { type: 'number', example: 40.0 },
              sl_proximity_pct: { type: 'number', example: 0.0 },
              distance_to_tp_pct: { type: 'number', example: 3.0 },
              distance_to_sl_pct: { type: 'number', example: 4.0 },
              status: { type: 'string', enum: ['PROFIT', 'LOSS', 'AT_TP', 'AT_SL'], example: 'PROFIT' },
            },
          },
        },
      },
    },
  })
  async getMonitoringTPSL(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('exchange_account_id') exchangeAccountId?: number
  ): Promise<any> {
    try {
      // Buscar IDs das exchange accounts do usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);

      if (accountIds.length === 0) {
        return { data: [] };
      }

      // Construir filtros
      const where: any = {
        exchange_account_id: { in: accountIds },
        status: 'OPEN',
        qty_remaining: { gt: 0 },
        OR: [
          { sl_enabled: true },
          { tp_enabled: true },
        ],
      };

      if (tradeMode) {
        where.trade_mode = tradeMode.toUpperCase();
      }

      if (exchangeAccountId) {
        // Validar que a conta pertence ao usuário
        if (!accountIds.includes(exchangeAccountId)) {
          throw new BadRequestException('Conta de exchange não encontrada ou não pertence ao usuário');
        }
        where.exchange_account_id = exchangeAccountId;
      }

      // Buscar posições
      const positions = await this.prisma.tradePosition.findMany({
        where,
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
              is_simulation: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      if (positions.length === 0) {
        return { data: [] };
      }

      // Agrupar símbolos por exchange para buscar preços em batch
      const symbolExchangeMap = new Map<string, { symbols: Set<string>; exchange: string }>();
      
      positions.forEach((position) => {
        const exchange = position.exchange_account.exchange;
        const key = exchange;
        if (!symbolExchangeMap.has(key)) {
          symbolExchangeMap.set(key, { symbols: new Set(), exchange });
        }
        symbolExchangeMap.get(key)!.symbols.add(position.symbol);
      });

      // Buscar preços em batch (agrupados por exchange)
      const priceMap = new Map<string, number>();
      
      for (const [exchangeKey, { symbols, exchange }] of symbolExchangeMap.entries()) {
        try {
          const adapter = AdapterFactory.createAdapter(exchange as ExchangeType);
          
          // Buscar preços para todos os símbolos desta exchange
          const pricePromises = Array.from(symbols).map(async (symbol) => {
            const cacheKey = `price:${exchange}:${symbol}`;
            
            // Tentar buscar do cache primeiro
            const cachedPrice = await this.cacheService.get<number>(cacheKey);
            if (cachedPrice !== null && cachedPrice > 0) {
              return { symbol, price: cachedPrice };
            }
            
            // Se não estiver no cache, buscar da exchange e adicionar ao cache
            try {
              const ticker = await adapter.fetchTicker(symbol);
              const price = ticker.last;
              if (price && price > 0) {
                // Armazenar no cache com TTL de 25 segundos (máximo)
                await this.cacheService.set(cacheKey, price, { ttl: 25 });
                return { symbol, price };
              }
            } catch (error: any) {
              console.warn(`[PositionsController] Erro ao buscar preço para ${symbol} na ${exchange}: ${error.message}`);
            }
            return { symbol, price: null };
          });
          
          const prices = await Promise.all(pricePromises);
          prices.forEach(({ symbol, price }) => {
            if (price !== null) {
              priceMap.set(`${exchange}:${symbol}`, price);
            }
          });
        } catch (error: any) {
          console.warn(`[PositionsController] Erro ao criar adapter para ${exchange}: ${error.message}`);
        }
      }

      // Calcular métricas de monitoramento para cada posição
      const monitoringData = positions.map((position) => {
        const priceOpen = position.price_open.toNumber();
        const priceKey = `${position.exchange_account.exchange}:${position.symbol}`;
        const currentPrice = priceMap.get(priceKey) || null;

        if (!currentPrice || currentPrice <= 0) {
          // Se não conseguir preço, retornar dados básicos sem cálculos
          const qtyTotal = position.qty_total.toNumber();
          const qtyRemaining = position.qty_remaining.toNumber();
          const totalInvestedUsd = qtyTotal * priceOpen;
          
          return {
            id: position.id,
            symbol: position.symbol,
            trade_mode: position.trade_mode,
            exchange_account_id: position.exchange_account_id,
            exchange_account_label: position.exchange_account.label,
            price_open: priceOpen,
            current_price: null,
            pnl_pct: null,
            tp_enabled: position.tp_enabled,
            tp_pct: position.tp_pct?.toNumber() || null,
            sl_enabled: position.sl_enabled,
            sl_pct: position.sl_pct?.toNumber() || null,
            tp_proximity_pct: null,
            sl_proximity_pct: null,
            distance_to_tp_pct: null,
            distance_to_sl_pct: null,
            status: 'UNKNOWN' as const,
            qty_remaining: qtyRemaining,
            qty_total: qtyTotal,
            sl_triggered: position.sl_triggered,
            tp_triggered: position.tp_triggered,
            total_value_usd: totalInvestedUsd,
            current_value_usd: null,
            unrealized_pnl_usd: null,
          };
        }

        // Calcular PnL percentual
        const pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
        
        // Calcular valores em USD
        const qtyTotal = position.qty_total.toNumber();
        const qtyRemaining = position.qty_remaining.toNumber();
        const totalInvestedUsd = qtyTotal * priceOpen; // Valor total investido
        const currentValueUsd = qtyRemaining * currentPrice; // Valor atual da posição
        const unrealizedPnlUsd = (currentPrice - priceOpen) * qtyRemaining; // PnL não realizado

        // Calcular proximidade e distância para TP
        let tpProximityPct: number | null = null;
        let distanceToTpPct: number | null = null;
        if (position.tp_enabled && position.tp_pct) {
          const tpPct = position.tp_pct.toNumber();
          if (pnlPct >= tpPct) {
            tpProximityPct = 100;
            distanceToTpPct = 0;
          } else {
            tpProximityPct = (pnlPct / tpPct) * 100;
            distanceToTpPct = tpPct - pnlPct;
          }
        }

        // Calcular proximidade e distância para SL
        let slProximityPct: number | null = null;
        let distanceToSlPct: number | null = null;
        if (position.sl_enabled && position.sl_pct) {
          const slPct = position.sl_pct.toNumber();
          if (pnlPct <= -slPct) {
            slProximityPct = 100;
            distanceToSlPct = 0;
          } else {
            slProximityPct = (Math.abs(pnlPct) / slPct) * 100;
            distanceToSlPct = slPct - Math.abs(pnlPct);
          }
        }

        // Determinar status
        let status: 'PROFIT' | 'LOSS' | 'AT_TP' | 'AT_SL' = pnlPct >= 0 ? 'PROFIT' : 'LOSS';
        if (position.tp_enabled && position.tp_pct && pnlPct >= position.tp_pct.toNumber()) {
          status = 'AT_TP';
        } else if (position.sl_enabled && position.sl_pct && pnlPct <= -position.sl_pct.toNumber()) {
          status = 'AT_SL';
        }

        return {
          id: position.id,
          symbol: position.symbol,
          trade_mode: position.trade_mode,
          exchange_account_id: position.exchange_account_id,
          exchange_account_label: position.exchange_account.label,
          price_open: priceOpen,
          current_price: currentPrice,
          pnl_pct: pnlPct,
          tp_enabled: position.tp_enabled,
          tp_pct: position.tp_pct?.toNumber() || null,
          sl_enabled: position.sl_enabled,
          sl_pct: position.sl_pct?.toNumber() || null,
          tp_proximity_pct: tpProximityPct,
          sl_proximity_pct: slProximityPct,
          distance_to_tp_pct: distanceToTpPct,
          distance_to_sl_pct: distanceToSlPct,
          status,
          qty_remaining: qtyRemaining,
          qty_total: qtyTotal,
          sl_triggered: position.sl_triggered,
          tp_triggered: position.tp_triggered,
          total_value_usd: totalInvestedUsd,
          current_value_usd: currentValueUsd,
          unrealized_pnl_usd: unrealizedPnlUsd,
        };
      });

      return { data: monitoringData };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao buscar monitoramento TP/SL: ${error.message}`);
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter posição por ID',
    description: 'Retorna os detalhes completos de uma posição específica, incluindo histórico de fills, SL/TP configurados e informações da conta de exchange.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID da posição',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Posição encontrada com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        exchange_account_id: { type: 'number', example: 1 },
        symbol: { type: 'string', example: 'BTCUSDT' },
        side: { type: 'string', enum: ['BUY', 'SELL'], example: 'BUY' },
        status: { type: 'string', enum: ['OPEN', 'CLOSED'], example: 'OPEN' },
        qty_total: { type: 'number', example: 0.001 },
        qty_remaining: { type: 'number', example: 0.001 },
        price_open: { type: 'number', example: 50000 },
        price_close: { type: 'number', nullable: true, example: null },
        pnl: { type: 'number', nullable: true, example: 0 },
        pnl_pct: { type: 'number', nullable: true, example: 0 },
        sl_enabled: { type: 'boolean', example: true },
        sl_pct: { type: 'number', nullable: true, example: 2.0 },
        tp_enabled: { type: 'boolean', example: true },
        tp_pct: { type: 'number', nullable: true, example: 5.0 },
        lock_sell_by_webhook: { type: 'boolean', example: false },
        fills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              executed_qty: { type: 'number', example: 0.001 },
              avg_price: { type: 'number', example: 50000 },
              created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
            },
          },
        },
        created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Posição não encontrada',
    schema: {
      example: {
        statusCode: 404,
        message: 'Posição não encontrada',
        error: 'Not Found',
      },
    },
  })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ): Promise<any> {
    try {
      // Buscar IDs das exchange accounts do usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);

      if (accountIds.length === 0) {
        throw new NotFoundException('Posição não encontrada');
      }

      // Buscar posição com todos os relacionamentos
      const position = await this.prisma.tradePosition.findFirst({
        where: {
          id,
          exchange_account_id: { in: accountIds },
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
              is_simulation: true,
            },
          },
          open_job: {
            select: {
              id: true,
              symbol: true,
              side: true,
              order_type: true,
              status: true,
              quote_amount: true,
              base_quantity: true,
              limit_price: true,
              created_at: true,
              executions: {
                select: {
                  id: true,
                  exchange_order_id: true,
                  client_order_id: true,
                },
                take: 1,
                orderBy: {
                  created_at: 'desc',
                },
              },
            },
          },
          fills: {
            // Buscar todos os fills (BUY e SELL) para exibir na página de detalhes
            orderBy: {
              created_at: 'desc',
            },
            include: {
              execution: {
                select: {
                  id: true,
                  avg_price: true,
                  executed_qty: true,
                  created_at: true,
                  trade_job: {
                    select: {
                      id: true,
                      side: true,
                      order_type: true,
                      status: true,
                      symbol: true,
                      quote_amount: true,
                      base_quantity: true,
                      limit_price: true,
                      created_at: true,
                      executions: {
                        select: {
                          id: true,
                          exchange_order_id: true,
                          client_order_id: true,
                        },
                        take: 1,
                        orderBy: {
                          created_at: 'desc',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          grouped_jobs: {
            include: {
              trade_job: {
                select: {
                  id: true,
                  symbol: true,
                  side: true,
                  order_type: true,
                  status: true,
                  quote_amount: true,
                  base_quantity: true,
                  limit_price: true,
                  created_at: true,
                  executions: {
                    select: {
                      id: true,
                      avg_price: true,
                      executed_qty: true,
                      created_at: true,
                    },
                    orderBy: {
                      created_at: 'desc',
                    },
                    take: 1,
                  },
                },
              },
            },
            orderBy: {
              created_at: 'asc',
            },
          },
        },
      });

      if (!position) {
        throw new NotFoundException('Posição não encontrada');
      }

      // Buscar preço atual e calcular métricas
      let currentPrice: number | null = null;
      let priceClose: number | null = null;
      let unrealizedPnl: number | null = null;
      let unrealizedPnlPct: number | null = null;
      let investedValueUsd: number | null = null;
      let currentValueUsd: number | null = null;

      // Calcular preço de venda para posições fechadas
      // Pegar o avg_price da execução que fechou a posição
      if (position.status === 'CLOSED' && position.fills) {
        const sellFills = position.fills.filter((fill: any) => fill.side === 'SELL');
        if (sellFills.length > 0) {
          // Pegar o fill mais recente (último que fechou) e usar o avg_price da execução
          const lastSellFill = sellFills[0]; // Já está ordenado por created_at desc
          if (lastSellFill.execution?.avg_price) {
            priceClose = lastSellFill.execution.avg_price.toNumber();
          }
        }
      }

      try {
        // Criar adapter read-only (sem API keys necessárias para buscar preço)
        const adapter = AdapterFactory.createAdapter(
          position.exchange_account.exchange as ExchangeType
        );
        
        const ticker = await adapter.fetchTicker(position.symbol);
        currentPrice = ticker.last;

        if (currentPrice && currentPrice > 0) {
          const priceOpen = position.price_open.toNumber();
          const qtyRemaining = position.qty_remaining.toNumber();
          const qtyTotal = position.qty_total.toNumber();
          
          // Valor investido (comprado) em USD
          investedValueUsd = qtyTotal * priceOpen;
          
          // Valor atual em USD (apenas para posições abertas)
          if (position.status === 'OPEN') {
            currentValueUsd = qtyRemaining * currentPrice;
            
            // PnL não realizado (unrealized PnL)
            unrealizedPnl = (currentPrice - priceOpen) * qtyRemaining;
            unrealizedPnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
          }
        }
      } catch (error: any) {
        // Se falhar ao buscar preço, continuar sem essas métricas
        // Não é crítico, apenas não teremos PnL não realizado
        console.warn(`[PositionsController] Erro ao buscar preço atual para posição ${id}: ${error.message}`);
      }

      // Buscar jobs de venda relacionados (via fills de SELL)
      const sellJobs: any[] = [];
      if (position.fills) {
        const sellFills = position.fills.filter((fill: any) => fill.side === 'SELL');
        const uniqueJobIds = new Set<number>();
        
        for (const fill of sellFills) {
          if (fill.execution?.trade_job) {
            const jobId = fill.execution.trade_job.id;
            if (!uniqueJobIds.has(jobId)) {
              uniqueJobIds.add(jobId);
              sellJobs.push({
                ...fill.execution.trade_job,
                limit_price: fill.execution.trade_job.limit_price?.toNumber() || null,
                base_quantity: fill.execution.trade_job.base_quantity?.toNumber() || null,
                quote_amount: fill.execution.trade_job.quote_amount?.toNumber() || null,
              });
            }
          }
        }
      }

      // Mapear fills para o formato esperado pelo frontend
      const fills = position.fills ? position.fills.map((fill: any) => ({
        id: fill.id,
        position_id: fill.position_id,
        trade_execution_id: fill.trade_execution_id,
        side: fill.side,
        qty: fill.qty.toNumber(),
        price: fill.price.toNumber(),
        created_at: fill.created_at,
      })) : [];

      // Mapear grouped_jobs para o formato esperado pelo frontend
      const groupedJobs = position.grouped_jobs ? position.grouped_jobs.map((groupedJob: any) => ({
        id: groupedJob.id,
        position_id: groupedJob.position_id,
        trade_job_id: groupedJob.trade_job_id,
        created_at: groupedJob.created_at,
        trade_job: groupedJob.trade_job ? {
          ...groupedJob.trade_job,
          quote_amount: groupedJob.trade_job.quote_amount?.toNumber() || null,
          base_quantity: groupedJob.trade_job.base_quantity?.toNumber() || null,
          limit_price: groupedJob.trade_job.limit_price?.toNumber() || null,
          executions: groupedJob.trade_job.executions?.map((exec: any) => ({
            ...exec,
            avg_price: exec.avg_price?.toNumber() || null,
            executed_qty: exec.executed_qty?.toNumber() || null,
          })) || [],
        } : null,
      })) : [];

      return {
        ...position,
        fills: fills,
        grouped_jobs: groupedJobs,
        current_price: currentPrice,
        price_close: priceClose,
        invested_value_usd: investedValueUsd,
        current_value_usd: currentValueUsd,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
        sell_jobs: sellJobs,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao buscar posição: ${error.message}`);
    }
  }

  @Put(':id/sltp')
  @ApiOperation({ 
    summary: 'Atualizar Stop Loss e Take Profit da posição',
    description: 'Atualiza os valores de Stop Loss (SL) e Take Profit (TP) de uma posição aberta. Os valores são em percentual do preço de abertura. Se a posição já tiver SL/TP configurados, eles serão substituídos.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID da posição',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'SL/TP atualizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        sl_enabled: { type: 'boolean', example: true },
        sl_pct: { type: 'number', example: 2.0, description: 'Stop Loss em percentual (ex: 2.0 = 2%)' },
        tp_enabled: { type: 'boolean', example: true },
        tp_pct: { type: 'number', example: 5.0, description: 'Take Profit em percentual (ex: 5.0 = 5%)' },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Valores inválidos ou posição já fechada',
    schema: {
      example: {
        statusCode: 400,
        message: 'Valores de SL/TP inválidos',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Posição não encontrada',
  })
  async updateSLTP(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() updateDto: UpdateSLTPDto
  ) {
    try {
      // Verificar se a posição pertence ao usuário
      const position = await this.prisma.tradePosition.findUnique({
        where: { id },
        include: { exchange_account: true },
      });

      if (!position) {
        throw new NotFoundException('Posição não encontrada');
      }

      if (position.exchange_account.user_id !== user.userId) {
        throw new ForbiddenException('Você não tem permissão para atualizar esta posição');
      }

      // Validar que a posição está aberta
      if (position.status !== 'OPEN') {
        throw new BadRequestException('Apenas posições abertas podem ter SL/TP atualizados');
      }

      const updatedPosition = await this.positionsService.getDomainService().updateSLTP(
        id,
        updateDto.slEnabled,
        updateDto.slPct,
        updateDto.tpEnabled,
        updateDto.tpPct
      );

      // Emitir evento WebSocket
      this.wsService.emitToUser(user.userId, 'position.updated', {
        id: updatedPosition.id,
        symbol: updatedPosition.symbol,
        sl_enabled: updatedPosition.sl_enabled,
        sl_pct: updatedPosition.sl_pct,
        tp_enabled: updatedPosition.tp_enabled,
        tp_pct: updatedPosition.tp_pct,
      });

      return updatedPosition;
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao atualizar SL/TP';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Posição não encontrada');
      }
      
      if (errorMessage.includes('invalid') || errorMessage.includes('inválido')) {
        throw new BadRequestException('Valores de SL/TP inválidos');
      }
      
      throw new BadRequestException('Erro ao atualizar stop loss/take profit');
    }
  }

  @Put(':id/lock-sell-by-webhook')
  @ApiOperation({ 
    summary: 'Travar/desbloquear venda por webhook',
    description: 'Bloqueia ou desbloqueia a venda automática de uma posição via webhook. Quando bloqueado (lock_sell_by_webhook=true), a posição não pode ser fechada automaticamente por webhooks, apenas manualmente.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID da posição',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lock atualizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        lock_sell_by_webhook: { type: 'boolean', example: true, description: 'true = bloqueado, false = desbloqueado' },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Posição não encontrada',
  })
  async lockSellByWebhook(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { lock_sell_by_webhook: boolean }
  ) {
    try {
      // Verificar se a posição pertence ao usuário
      const position = await this.prisma.tradePosition.findUnique({
        where: { id },
        include: { exchange_account: true },
      });

      if (!position) {
        throw new NotFoundException('Posição não encontrada');
      }

      if (position.exchange_account.user_id !== user.userId) {
        throw new ForbiddenException('Você não tem permissão para atualizar esta posição');
      }

      return await this.positionsService
        .getDomainService()
        .lockSellByWebhook(id, body.lock_sell_by_webhook);
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao atualizar lock';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Posição não encontrada');
      }
      
      throw new BadRequestException('Erro ao atualizar bloqueio de venda por webhook');
    }
  }

  @Post(':id/close')
  @ApiOperation({ 
    summary: 'Fechar posição (total ou parcial)',
    description: 'Fecha uma posição aberta total ou parcialmente. Pode ser fechada com ordem MARKET (execução imediata) ou LIMIT (aguarda preço). Se não especificar quantidade, fecha toda a posição. Retorna um trade job que será processado assincronamente.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID da posição a ser fechada',
    example: 1
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Job de fechamento criado com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Job de venda criado com sucesso' },
        positionId: { type: 'number', example: 1 },
        qtyToClose: { type: 'number', example: 0.001, description: 'Quantidade que será fechada' },
        tradeJobId: { type: 'number', example: 123, description: 'ID do job de trading criado' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Posição já fechada, quantidade insuficiente ou dados inválidos',
    schema: {
      example: {
        statusCode: 400,
        message: 'Posição já está fechada',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Sem permissão para fechar esta posição',
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Posição não encontrada',
  })
  async close(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() closeDto?: ClosePositionDto
  ) {
    try {
      // Verificar se a posição pertence ao usuário
      const position = await this.prisma.tradePosition.findUnique({
        where: { id },
        include: { exchange_account: true },
      });

      if (!position) {
        throw new NotFoundException('Posição não encontrada');
      }

      if (position.exchange_account.user_id !== user.userId) {
        throw new ForbiddenException('Você não tem permissão para fechar esta posição');
      }

      // Validar e converter orderType - apenas MARKET ou LIMIT são permitidos
      let orderType: 'MARKET' | 'LIMIT' = 'MARKET';
      if (closeDto?.orderType === OrderType.LIMIT) {
        orderType = 'LIMIT';
      } else if (closeDto?.orderType && closeDto.orderType !== OrderType.MARKET) {
        throw new BadRequestException('Apenas MARKET ou LIMIT são permitidos para fechamento de posição');
      }
      
      // Se orderType é LIMIT, limitPrice é obrigatório
      if (orderType === 'LIMIT' && !closeDto?.limitPrice) {
        throw new BadRequestException('Preço limite é obrigatório para ordens LIMIT');
      }

      const result = await this.positionsService
        .getDomainService()
        .closePosition(id, closeDto?.quantity, orderType, closeDto?.limitPrice);

      // Enfileirar job para execução
      await this.tradeJobQueueService.enqueueTradeJob(result.tradeJobId);

      return {
        message: 'Job de venda criado com sucesso',
        positionId: result.positionId,
        qtyToClose: result.qtyToClose,
        tradeJobId: result.tradeJobId,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      const errorMessage = error?.message || 'Erro ao fechar posição';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Posição não encontrada');
      }
      
      if (errorMessage.includes('already closed') || errorMessage.includes('já fechada')) {
        throw new BadRequestException('Posição já está fechada');
      }
      
      if (errorMessage.includes('insufficient') || errorMessage.includes('insuficiente')) {
        throw new BadRequestException('Quantidade insuficiente para fechar');
      }
      
      throw new BadRequestException('Erro ao fechar posição');
    }
  }

  @Post(':id/sell-limit')
  @ApiOperation({ 
    summary: 'Criar ordem LIMIT de venda para posição',
    description: 'Cria uma ordem LIMIT de venda para uma posição aberta. A ordem será executada quando o preço atingir o valor especificado. Pode especificar quantidade parcial ou vender toda a posição. Pode definir expiração em horas.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number',
    description: 'ID da posição',
    example: 1
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Ordem LIMIT criada com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Ordem LIMIT de venda criada com sucesso' },
        tradeJobId: { type: 'number', example: 123, description: 'ID do trade job criado' },
        limitPrice: { type: 'number', example: 52000, description: 'Preço limite da ordem' },
        quantity: { type: 'number', example: 0.001, description: 'Quantidade a ser vendida' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Preço limite inválido, quantidade excede disponível, ou posição já tem ordem LIMIT pendente',
    schema: {
      example: {
        statusCode: 400,
        message: 'Preço limite inválido',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ 
    status: 403, 
    description: 'Sem permissão para criar ordem nesta posição',
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Posição não encontrada',
  })
  async sellLimit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() sellLimitDto: SellLimitDto
  ) {
    try {
      if (!sellLimitDto.limitPrice || sellLimitDto.limitPrice <= 0) {
        throw new BadRequestException('Preço limite inválido');
      }

      // Verificar se a posição pertence ao usuário
      const position = await this.prisma.tradePosition.findUnique({
        where: { id },
        include: { exchange_account: true },
      });

      if (!position) {
        throw new NotFoundException('Posição não encontrada');
      }

      if (position.exchange_account.user_id !== user.userId) {
        throw new ForbiddenException('Você não tem permissão para criar ordem LIMIT nesta posição');
      }

      // Validar quantidade se fornecida
      if (sellLimitDto.quantity && sellLimitDto.quantity <= 0) {
        throw new BadRequestException('Quantidade inválida');
      }

      if (sellLimitDto.quantity && sellLimitDto.quantity > position.qty_remaining.toNumber()) {
        throw new BadRequestException('Quantidade excede o disponível na posição');
      }

      // Criar ordem LIMIT
      const result = await this.positionsService
        .getDomainService()
        .createLimitSellOrder(
          id,
          sellLimitDto.limitPrice,
          sellLimitDto.quantity,
          sellLimitDto.expiresInHours
        );

      // Para ordens LIMIT em modo REAL, precisamos criar a ordem na exchange primeiro
      // Por enquanto, apenas enfileiramos o job (o monitor de limit orders cuidará da criação na exchange)
      // Para modo SIMULATION, apenas enfileiramos
      await this.tradeJobQueueService.enqueueTradeJob(result.tradeJobId);

      return {
        message: 'Ordem LIMIT de venda criada com sucesso',
        tradeJobId: result.tradeJobId,
        limitPrice: result.limitPrice,
        quantity: result.quantity,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao criar ordem LIMIT';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Posição não encontrada');
      }

      if (errorMessage.includes('already has a pending LIMIT order')) {
        throw new BadRequestException(errorMessage);
      }
      
      throw new BadRequestException('Erro ao criar ordem LIMIT de venda');
    }
  }

  @Post('bulk-update-sltp')
  @ApiOperation({
    summary: 'Atualizar TP/SL em massa',
    description: 'Atualiza TP/SL para múltiplas posições de uma vez',
  })
  @ApiResponse({
    status: 200,
    description: 'TP/SL atualizado com sucesso',
  })
  async bulkUpdateSLTP(
    @CurrentUser() user: any,
    @Body() bulkUpdateDto: { positionIds: number[]; slEnabled?: boolean; slPct?: number; tpEnabled?: boolean; tpPct?: number }
  ): Promise<{ updated: number; errors: Array<{ positionId: number; error: string }> }> {
    const errors: Array<{ positionId: number; error: string }> = [];
    let updated = 0;

    for (const positionId of bulkUpdateDto.positionIds) {
      try {
        // Verificar se a posição pertence ao usuário
        const position = await this.prisma.tradePosition.findUnique({
          where: { id: positionId },
          include: { exchange_account: true },
        });

        if (!position) {
          errors.push({ positionId, error: 'Posição não encontrada' });
          continue;
        }

        if (position.exchange_account.user_id !== user.userId) {
          errors.push({ positionId, error: 'Sem permissão para atualizar esta posição' });
          continue;
        }

        if (position.status !== 'OPEN') {
          errors.push({ positionId, error: 'Apenas posições abertas podem ter SL/TP atualizados' });
          continue;
        }

        await this.positionsService.getDomainService().updateSLTP(
          positionId,
          bulkUpdateDto.slEnabled,
          bulkUpdateDto.slPct,
          bulkUpdateDto.tpEnabled,
          bulkUpdateDto.tpPct
        );

        // Emitir evento WebSocket
        this.wsService.emitToUser(user.userId, 'position.updated', {
          id: position.id,
          symbol: position.symbol,
        });

        updated++;
      } catch (error: any) {
        errors.push({
          positionId,
          error: error.message || 'Erro desconhecido',
        });
      }
    }

    return { updated, errors };
  }

  @Post('bulk-update-min-profit')
  @ApiOperation({
    summary: 'Atualizar lucro mínimo em massa',
    description: 'Atualiza min_profit_pct para múltiplas posições de uma vez',
  })
  @ApiResponse({
    status: 200,
    description: 'Lucro mínimo atualizado com sucesso',
  })
  async bulkUpdateMinProfit(
    @CurrentUser() user: any,
    @Body() bulkUpdateDto: { positionIds: number[]; minProfitPct?: number | null }
  ): Promise<{ updated: number; errors: Array<{ positionId: number; error: string }> }> {
    const errors: Array<{ positionId: number; error: string }> = [];
    let updated = 0;

    // Validar minProfitPct se fornecido
    if (bulkUpdateDto.minProfitPct !== undefined && bulkUpdateDto.minProfitPct !== null) {
      if (bulkUpdateDto.minProfitPct <= 0) {
        throw new BadRequestException('min_profit_pct deve ser maior que zero');
      }
    }

    for (const positionId of bulkUpdateDto.positionIds) {
      try {
        // Verificar se a posição pertence ao usuário
        const position = await this.prisma.tradePosition.findUnique({
          where: { id: positionId },
          include: { exchange_account: true },
        });

        if (!position) {
          errors.push({ positionId, error: 'Posição não encontrada' });
          continue;
        }

        if (position.exchange_account.user_id !== user.userId) {
          errors.push({ positionId, error: 'Sem permissão para atualizar esta posição' });
          continue;
        }

        if (position.status !== 'OPEN') {
          errors.push({ positionId, error: 'Apenas posições abertas podem ter lucro mínimo atualizado' });
          continue;
        }

        // Atualizar min_profit_pct
        await this.prisma.tradePosition.update({
          where: { id: positionId },
          data: {
            min_profit_pct: bulkUpdateDto.minProfitPct !== undefined 
              ? (bulkUpdateDto.minProfitPct === null ? null : bulkUpdateDto.minProfitPct)
              : undefined,
          },
        });

        // Emitir evento WebSocket
        this.wsService.emitToUser(user.userId, 'position.updated', {
          id: position.id,
          symbol: position.symbol,
        });

        updated++;
      } catch (error: any) {
        errors.push({
          positionId,
          error: error.message || 'Erro desconhecido',
        });
      }
    }

    return { updated, errors };
  }

  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Criar posição manualmente (Admin)',
    description: 'Permite que administradores criem posições manualmente, seja buscando dados de uma ordem na exchange ou inserindo todos os dados manualmente.',
  })
  @ApiResponse({
    status: 201,
    description: 'Posição criada com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou erro ao buscar ordem na exchange',
  })
  @ApiResponse({
    status: 403,
    description: 'Apenas administradores podem criar posições manualmente',
  })
  async createManualPosition(
    @CurrentUser() user: any,
    @Body() createDto: CreateManualPositionDto
  ): Promise<any> {
    try {
      // Verificar se a conta existe (pode ser de qualquer usuário)
      const account = await this.prisma.exchangeAccount.findUnique({
        where: { id: createDto.exchange_account_id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!account) {
        throw new BadRequestException('Conta de exchange não encontrada');
      }

      let executedQty: number;
      let avgPrice: number;
      let cummQuoteQty: number;
      let symbol: string;
      let tradeMode: 'REAL' | 'SIMULATION';
      let exchangeOrderId: string | undefined;
      let createdAt: Date | undefined;

      if (createDto.method === CreateManualPositionMethod.EXCHANGE_ORDER) {
        // Buscar dados da ordem na exchange
        if (!createDto.exchange_order_id || !createDto.symbol) {
          throw new BadRequestException('exchange_order_id e symbol são obrigatórios para EXCHANGE_ORDER');
        }

        if (account.is_simulation) {
          throw new BadRequestException('Não é possível buscar ordens de contas de simulação na exchange');
        }

        // Obter chaves da API
        const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
        const keys = await accountService.decryptApiKeys(createDto.exchange_account_id);

        if (!keys || !keys.apiKey || !keys.apiSecret) {
          throw new BadRequestException('API keys não encontradas para esta conta');
        }

        // Criar adapter
        const adapter = AdapterFactory.createAdapter(
          account.exchange as ExchangeType,
          keys.apiKey,
          keys.apiSecret,
          { testnet: account.testnet }
        );

        // Buscar ordem na exchange
        let order;
        if (account.exchange === 'BYBIT_SPOT' && adapter.fetchClosedOrder) {
          order = await adapter.fetchClosedOrder(createDto.exchange_order_id, createDto.symbol);
        } else {
          order = await adapter.fetchOrder(createDto.exchange_order_id, createDto.symbol);
        }

        // Validar que é uma ordem BUY (normalizar para case-insensitive)
        const normalizedSide = order.side?.toUpperCase();
        if (normalizedSide !== 'BUY') {
          throw new BadRequestException(`A ordem deve ser do tipo BUY. Tipo recebido: ${order.side}`);
        }

        // Validar que está FILLED
        if (order.status !== 'closed' && order.status !== 'filled') {
          throw new BadRequestException(`A ordem deve estar FILLED. Status atual: ${order.status}`);
        }

        // Verificar se já existe uma execução com este exchange_order_id para evitar duplicação
        const existingExecution = await this.prisma.tradeExecution.findFirst({
          where: {
            exchange_order_id: createDto.exchange_order_id,
            exchange_account_id: createDto.exchange_account_id,
          },
          include: {
            trade_job: {
              include: {
                position_open: true,
              },
            },
          },
        });

        if (existingExecution) {
          const positionInfo = existingExecution.trade_job?.position_open
            ? ` (já associada à posição #${existingExecution.trade_job.position_open.id})`
            : '';
          throw new BadRequestException(
            `Já existe uma execução com o ID de ordem ${createDto.exchange_order_id} nesta conta${positionInfo}. Não é possível criar posição duplicada.`
          );
        }

        // Extrair dados da ordem
        let filled = order.filled || 0;
        let average = order.average || order.price || 0;
        let cost = order.cost || 0;

        // Se não encontrou dados diretos, tentar extrair dos fills
        if ((filled === 0 || average === 0) && order.fills && order.fills.length > 0) {
          let totalFilled = 0;
          let totalCost = 0;

          for (const fill of order.fills) {
            const fillQty = fill.amount || fill.quantity || 0;
            const fillPrice = fill.price || 0;
            totalFilled += fillQty;
            totalCost += fillQty * fillPrice;
          }

          if (totalFilled > 0) {
            filled = totalFilled;
            average = totalCost / totalFilled;
            cost = totalCost;
          }
        }

        if (filled === 0 || average === 0) {
          throw new BadRequestException('Não foi possível extrair dados válidos da ordem na exchange');
        }

        executedQty = filled;
        avgPrice = average;
        cummQuoteQty = cost > 0 ? cost : filled * average;
        symbol = createDto.symbol;
        tradeMode = account.is_simulation ? 'SIMULATION' : 'REAL';
        exchangeOrderId = createDto.exchange_order_id;
      } else {
        // Usar dados manuais
        if (!createDto.manual_symbol || !createDto.qty_total || !createDto.price_open || !createDto.trade_mode) {
          throw new BadRequestException('Todos os campos obrigatórios devem ser preenchidos para MANUAL');
        }

        // Se foi fornecido manual_exchange_order_id, verificar se já existe para evitar duplicação
        if (createDto.manual_exchange_order_id) {
          const existingExecution = await this.prisma.tradeExecution.findFirst({
            where: {
              exchange_order_id: createDto.manual_exchange_order_id,
              exchange_account_id: createDto.exchange_account_id,
            },
            include: {
              trade_job: {
                include: {
                  position_open: true,
                },
              },
            },
          });

          if (existingExecution) {
            const positionInfo = existingExecution.trade_job?.position_open
              ? ` (já associada à posição #${existingExecution.trade_job.position_open.id})`
              : '';
            throw new BadRequestException(
              `Já existe uma execução com o ID de ordem ${createDto.manual_exchange_order_id} nesta conta${positionInfo}. Não é possível criar posição duplicada.`
            );
          }
        }

        executedQty = createDto.qty_total;
        avgPrice = createDto.price_open;
        cummQuoteQty = executedQty * avgPrice;
        symbol = createDto.manual_symbol;
        tradeMode = createDto.trade_mode;
        exchangeOrderId = createDto.manual_exchange_order_id || `MANUAL-${Date.now()}`;

        if (createDto.created_at) {
          createdAt = new Date(createDto.created_at);
        }
      }

      // Criar TradeJob BUY com status FILLED
      const tradeJob = await this.prisma.tradeJob.create({
        data: {
          exchange_account_id: createDto.exchange_account_id,
          trade_mode: tradeMode,
          symbol: symbol,
          side: 'BUY',
          order_type: 'MARKET',
          status: 'FILLED',
          base_quantity: executedQty,
          created_at: createdAt,
        },
      });

      // Criar TradeExecution
      const tradeExecution = await this.prisma.tradeExecution.create({
        data: {
          trade_job_id: tradeJob.id,
          exchange_account_id: createDto.exchange_account_id,
          trade_mode: tradeMode,
          exchange: account.exchange,
          exchange_order_id: exchangeOrderId,
          client_order_id: `manual-${tradeJob.id}-${Date.now()}`,
          status_exchange: 'FILLED',
          executed_qty: executedQty,
          cumm_quote_qty: cummQuoteQty,
          avg_price: avgPrice,
          created_at: createdAt,
        },
      });

      // Criar Position usando PositionService
      const positionService = new PositionService(this.prisma);
      const positionId = await positionService.onBuyExecuted(
        tradeJob.id,
        tradeExecution.id,
        executedQty,
        avgPrice
      );

      // Buscar posição criada com todos os relacionamentos
      const position = await this.prisma.tradePosition.findUnique({
        where: { id: positionId },
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
              is_simulation: true,
            },
          },
          open_job: {
            select: {
              id: true,
              symbol: true,
              side: true,
              order_type: true,
              status: true,
              created_at: true,
            },
          },
        },
      });

      return position;
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao criar posição manual: ${error.message}`);
    }
  }

  @Post('manual-buy')
  @ApiOperation({
    summary: 'Criar compra manual',
    description: 'Cria um trade job BUY que será executado na exchange. Usuários podem criar apenas em suas próprias contas, administradores podem criar em qualquer conta.',
  })
  @ApiResponse({
    status: 201,
    description: 'Trade job criado e enfileirado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou erro ao criar job',
  })
  @ApiResponse({
    status: 403,
    description: 'Usuário não tem permissão para criar compra nesta conta',
  })
  async createManualBuy(
    @CurrentUser() user: any,
    @Body() createDto: CreateManualBuyDto
  ): Promise<any> {
    try {
      // Verificar se a conta existe
      const account = await this.prisma.exchangeAccount.findUnique({
        where: { id: createDto.exchange_account_id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!account) {
        throw new BadRequestException('Conta de exchange não encontrada');
      }

      // Validar acesso: usuário normal só pode criar em suas próprias contas, admin pode criar em qualquer conta
      const isAdmin = user.roles?.includes(UserRole.ADMIN);
      if (!isAdmin && account.user_id !== user.userId) {
        throw new ForbiddenException('Você não tem permissão para criar compra nesta conta');
      }

      // Validar que a conta está ativa
      if (!account.is_active) {
        throw new BadRequestException('A conta de exchange está inativa');
      }

      // Validar campos baseado no tipo de ordem
      if (createDto.order_type === 'MARKET' && (!createDto.quote_amount || createDto.quote_amount <= 0)) {
        throw new BadRequestException('quote_amount é obrigatório e deve ser maior que zero para ordens MARKET');
      }

      if (createDto.order_type === 'LIMIT') {
        if (!createDto.limit_price || createDto.limit_price <= 0) {
          throw new BadRequestException('limit_price é obrigatório e deve ser maior que zero para ordens LIMIT');
        }
        if (!createDto.quote_amount || createDto.quote_amount <= 0) {
          throw new BadRequestException('quote_amount é obrigatório e deve ser maior que zero para ordens LIMIT');
        }
      }

      // Determinar trade mode baseado na conta
      const tradeMode = account.is_simulation ? 'SIMULATION' : 'REAL';

      // Criar trade job usando TradeJobService
      const tradeJobService = new TradeJobService(this.prisma);
      const tradeJob = await tradeJobService.createJob({
        exchangeAccountId: createDto.exchange_account_id,
        tradeMode: tradeMode as any,
        symbol: createDto.symbol.toUpperCase().trim(),
        side: 'BUY',
        orderType: createDto.order_type,
        quoteAmount: createDto.quote_amount,
        limitPrice: createDto.limit_price,
        skipParameterValidation: true, // Pular validação de parâmetros pois estamos fornecendo quote_amount diretamente
      });

      // Enfileirar o job para execução
      await this.tradeJobQueueService.enqueueTradeJob(tradeJob.id);

      return {
        success: true,
        trade_job: {
          id: tradeJob.id,
          symbol: tradeJob.symbol,
          side: tradeJob.side,
          order_type: tradeJob.order_type,
          quote_amount: tradeJob.quote_amount?.toNumber(),
          limit_price: tradeJob.limit_price?.toNumber(),
          status: tradeJob.status,
          created_at: tradeJob.created_at,
        },
        message: 'Compra manual criada e enfileirada com sucesso',
      };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao criar compra manual: ${error.message}`);
    }
  }

  @Post('group/preview')
  @ApiOperation({
    summary: 'Preview de agrupamento de posições',
    description: 'Retorna preview do agrupamento de posições sem persistir. Mostra como ficará o agrupamento antes de confirmar.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preview do agrupamento retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        positions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              symbol: { type: 'string' },
              qty_total: { type: 'number' },
              qty_remaining: { type: 'number' },
              price_open: { type: 'number' },
              is_grouped: { type: 'boolean' },
              created_at: { type: 'string' },
            },
          },
        },
        base_position_id: { type: 'number' },
        total_qty: { type: 'number' },
        total_qty_remaining: { type: 'number' },
        weighted_avg_price: { type: 'number' },
        total_invested: { type: 'number' },
        group_started_at: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou posições não podem ser agrupadas',
  })
  async groupPreview(
    @CurrentUser() user: any,
    @Body() body: { positionIds: number[] }
  ): Promise<any> {
    try {
      if (!body.positionIds || !Array.isArray(body.positionIds) || body.positionIds.length < 2) {
        throw new BadRequestException('É necessário fornecer pelo menos 2 IDs de posições');
      }

      // Verificar se todas as posições pertencem ao usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);

      if (accountIds.length === 0) {
        throw new BadRequestException('Nenhuma conta de exchange encontrada para o usuário');
      }

      const positions = await this.prisma.tradePosition.findMany({
        where: {
          id: { in: body.positionIds },
          exchange_account_id: { in: accountIds },
        },
        include: {
          exchange_account: {
            select: {
              user_id: true,
            },
          },
        },
      });

      if (positions.length !== body.positionIds.length) {
        throw new BadRequestException('Uma ou mais posições não foram encontradas ou não pertencem ao usuário');
      }

      // Verificar se todas pertencem ao mesmo usuário
      const userIds = new Set(positions.map(p => p.exchange_account.user_id));
      if (userIds.size > 1 || !userIds.has(user.userId)) {
        throw new ForbiddenException('Todas as posições devem pertencer ao usuário autenticado');
      }

      // Calcular preview usando o service do domain
      const positionService = new PositionService(this.prisma);
      const preview = await positionService.calculateGroupPreview(body.positionIds);

      return preview;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao calcular preview do agrupamento: ${error.message}`);
    }
  }

  @Post('group/confirm')
  @ApiOperation({
    summary: 'Confirmar agrupamento de posições',
    description: 'Executa o agrupamento de posições. Todas as posições selecionadas serão agrupadas em uma única posição base.',
  })
  @ApiResponse({
    status: 200,
    description: 'Posições agrupadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        symbol: { type: 'string' },
        qty_total: { type: 'number' },
        qty_remaining: { type: 'number' },
        price_open: { type: 'number' },
        is_grouped: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou posições não podem ser agrupadas',
  })
  async groupConfirm(
    @CurrentUser() user: any,
    @Body() body: { positionIds: number[] }
  ): Promise<any> {
    try {
      if (!body.positionIds || !Array.isArray(body.positionIds) || body.positionIds.length < 2) {
        throw new BadRequestException('É necessário fornecer pelo menos 2 IDs de posições');
      }

      // Verificar se todas as posições pertencem ao usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);

      if (accountIds.length === 0) {
        throw new BadRequestException('Nenhuma conta de exchange encontrada para o usuário');
      }

      const positions = await this.prisma.tradePosition.findMany({
        where: {
          id: { in: body.positionIds },
          exchange_account_id: { in: accountIds },
        },
        include: {
          exchange_account: {
            select: {
              user_id: true,
            },
          },
        },
      });

      if (positions.length !== body.positionIds.length) {
        throw new BadRequestException('Uma ou mais posições não foram encontradas ou não pertencem ao usuário');
      }

      // Verificar se todas pertencem ao mesmo usuário
      const userIds = new Set(positions.map(p => p.exchange_account.user_id));
      if (userIds.size > 1 || !userIds.has(user.userId)) {
        throw new ForbiddenException('Todas as posições devem pertencer ao usuário autenticado');
      }

      // Executar agrupamento usando o service do domain
      const positionService = new PositionService(this.prisma);
      const groupedPositionId = await positionService.groupPositions(body.positionIds);

      // Buscar posição agrupada resultante
      const groupedPosition = await this.prisma.tradePosition.findUnique({
        where: { id: groupedPositionId },
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
              is_simulation: true,
            },
          },
        },
      });

      if (!groupedPosition) {
        throw new BadRequestException('Erro ao buscar posição agrupada resultante');
      }

      // Emitir evento WebSocket
      this.wsService.emitToUser(user.userId, 'position.updated', {
        id: groupedPosition.id,
        symbol: groupedPosition.symbol,
        is_grouped: groupedPosition.is_grouped,
      });

      return groupedPosition;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao agrupar posições: ${error.message}`);
    }
  }
}

