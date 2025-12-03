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
import { OrderType } from '@mvcashnode/shared';

@ApiTags('Positions')
@Controller('positions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PositionsController {
  constructor(
    private positionsService: PositionsService,
    private tradeJobQueueService: TradeJobQueueService,
    private prisma: PrismaService
  ) {}

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
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de posições retornada com sucesso',
    schema: {
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
          created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
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
    @Query('limit') limit?: number
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
          fills: {
            orderBy: {
              created_at: 'desc',
            },
            take: 10, // Limitar fills retornados
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limitNum,
      });

      // Contar total
      const total = await this.prisma.tradePosition.count({ where });

      return {
        data: positions,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_items: total,
          total_pages: Math.ceil(total / limitNum),
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
  async getOne(@Param('id', ParseIntPipe) id: number) {
    // Implementation would get position by ID with fills
    return {};
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
    @Body() updateDto: UpdateSLTPDto
  ) {
    try {
      return await this.positionsService.getDomainService().updateSLTP(
        id,
        updateDto.slEnabled,
        updateDto.slPct,
        updateDto.tpEnabled,
        updateDto.tpPct
      );
    } catch (error: any) {
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
    @Body() body: { lock_sell_by_webhook: boolean }
  ) {
    try {
      return await this.positionsService
        .getDomainService()
        .lockSellByWebhook(id, body.lock_sell_by_webhook);
    } catch (error: any) {
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

