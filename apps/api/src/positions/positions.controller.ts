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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TradeJobQueueService } from '../trade-jobs/trade-job-queue.service';
import { PrismaService } from '@mvcashnode/db';
import { OrderType, ExchangeType } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';

@ApiTags('Positions')
@Controller('positions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PositionsController {
  // Cache simples em memória para preços (TTL: 30 segundos)
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly PRICE_CACHE_TTL = 30000; // 30 segundos

  constructor(
    private positionsService: PositionsService,
    private tradeJobQueueService: TradeJobQueueService,
    private prisma: PrismaService
  ) {}

  private getCachedPrice(symbol: string, exchange: string): number | null {
    const key = `${exchange}:${symbol}`;
    const cached = this.priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }
    return null;
  }

  private setCachedPrice(symbol: string, exchange: string, price: number): void {
    const key = `${exchange}:${symbol}`;
    this.priceCache.set(key, { price, timestamp: Date.now() });
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
    try {
      // Buscar IDs das exchange accounts do usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);

      if (accountIds.length === 0) {
        return {
          data: [],
          pagination: {
            current_page: page || 1,
            per_page: limit || 20,
            total_items: 0,
            total_pages: 0,
          },
        };
      }

      // Construir filtros
      const where: any = {
        exchange_account_id: { in: accountIds },
      };

      if (status) {
        where.status = status.toUpperCase();
      }

      if (tradeMode) {
        // Normalizar trade_mode para uppercase para garantir match
        where.trade_mode = tradeMode.toUpperCase();
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
          ...(shouldIncludeFills ? {
            fills: {
              orderBy: {
                created_at: 'desc',
              },
              take: 10, // Limitar fills retornados
              include: {
                execution: {
                  include: {
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
              },
            },
          } : {}),
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limitNum,
      });

      // Contar total
      const total = await this.prisma.tradePosition.count({ where });

      // Separar posições abertas e fechadas
      const isOpenStatus = status?.toUpperCase() === 'OPEN';
      const openPositions = isOpenStatus ? positions : positions.filter(p => p.status === 'OPEN');
      const closedPositions = !isOpenStatus ? positions : positions.filter(p => p.status === 'CLOSED');

      // Agrupar símbolos únicos por exchange para buscar preços em batch
      const symbolExchangeMap = new Map<string, { symbols: Set<string>; exchange: string }>();
      
      openPositions.forEach((position) => {
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
            const cacheKey = `${exchange}:${symbol}`;
            const cachedPrice = this.getCachedPrice(symbol, exchange);
            
            if (cachedPrice !== null) {
              return { symbol, price: cachedPrice };
            }
            
            try {
              const ticker = await adapter.fetchTicker(symbol);
              const price = ticker.last;
              if (price && price > 0) {
                this.setCachedPrice(symbol, exchange, price);
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
          // Para posições fechadas, apenas calcular valor investido
          investedValueUsd = qtyTotal * priceOpen;
          totalInvested += investedValueUsd;
        }

        // PnL realizado
        const realizedPnl = position.realized_profit_usd.toNumber();
        totalRealizedPnl += realizedPnl;

        // Extrair sell_jobs dos fills (apenas fills de SELL)
        const sellJobs: any[] = [];
        if (shouldIncludeFills && position.fills) {
          const sellFills = position.fills.filter((fill: any) => fill.side === 'SELL');
          const uniqueJobIds = new Set<number>();
          
          for (const fill of sellFills) {
            if (fill.execution?.trade_job) {
              const jobId = fill.execution.trade_job.id;
              // Evitar duplicatas (mesmo job pode ter múltiplos fills)
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

        return {
          ...position,
          current_price: currentPrice,
          invested_value_usd: investedValueUsd,
          current_value_usd: currentValueUsd,
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_pct: unrealizedPnlPct,
          ...(shouldIncludeFills ? { sell_jobs: sellJobs } : {}),
        };
      });

      // Calcular percentual de PnL não realizado
      const totalUnrealizedPnlPct = totalInvested > 0 
        ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 
        : 0;

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
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Erro ao buscar posições: ${error.message}`);
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
            },
          },
          fills: {
            orderBy: {
              created_at: 'desc',
            },
            include: {
              execution: {
                select: {
                  id: true,
                  exchange_order_id: true,
                  client_order_id: true,
                  status_exchange: true,
                  created_at: true,
                },
              },
            },
          },
        },
      });

      if (!position) {
        throw new NotFoundException('Posição não encontrada');
      }

      // Buscar preço atual e calcular métricas
      let currentPrice: number | null = null;
      let unrealizedPnl: number | null = null;
      let unrealizedPnlPct: number | null = null;
      let investedValueUsd: number | null = null;
      let currentValueUsd: number | null = null;

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
          
          // Valor atual em USD
          currentValueUsd = qtyRemaining * currentPrice;
          
          // PnL não realizado (unrealized PnL)
          unrealizedPnl = (currentPrice - priceOpen) * qtyRemaining;
          unrealizedPnlPct = ((currentPrice - priceOpen) / priceOpen) * 100;
        }
      } catch (error: any) {
        // Se falhar ao buscar preço, continuar sem essas métricas
        // Não é crítico, apenas não teremos PnL não realizado
        console.warn(`[PositionsController] Erro ao buscar preço atual para posição ${id}: ${error.message}`);
      }

      return {
        ...position,
        current_price: currentPrice,
        invested_value_usd: investedValueUsd,
        current_value_usd: currentValueUsd,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
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

      return await this.positionsService.getDomainService().updateSLTP(
        id,
        updateDto.slEnabled,
        updateDto.slPct,
        updateDto.tpEnabled,
        updateDto.tpPct
      );
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
}

