import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TradeJobsService } from './trade-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Jobs & Executions')
@Controller('trade-jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TradeJobsController {
  constructor(
    private tradeJobsService: TradeJobsService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar trade jobs',
    description: 'Retorna todos os trade jobs do usuário autenticado, com filtros opcionais por status, trade_mode e exchange_account_id.',
  })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filtrar por status (PENDING, EXECUTING, FILLED, etc.)' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'], description: 'Filtrar por modo de trading' })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number, description: 'Filtrar por conta de exchange' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Filtrar por símbolo' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número da página', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Lista de trade jobs',
    schema: {
      example: [
        {
          id: 1,
          exchange_account_id: 1,
          trade_mode: 'REAL',
          symbol: 'BTCUSDT',
          side: 'BUY',
          order_type: 'MARKET',
          quote_amount: 100,
          status: 'FILLED',
          executions: [
            {
              id: 1,
              exchange_order_id: '12345',
              executed_qty: 0.001,
              avg_price: 50000,
            },
          ],
          created_at: '2025-02-12T10:00:00.000Z',
        },
      ],
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('trade_mode') tradeMode?: string,
    @Query('exchange_account_id') exchangeAccountId?: number,
    @Query('symbol') symbol?: string,
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
        return [];
      }

      const where: any = {
        exchange_account_id: { in: accountIds },
      };

      if (status) {
        where.status = status;
      }

      if (tradeMode) {
        where.trade_mode = tradeMode;
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

      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;

      const jobs = await this.prisma.tradeJob.findMany({
        where,
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
            },
          },
          executions: {
            orderBy: {
              created_at: 'desc',
            },
            take: 10, // Limitar execuções retornadas
          },
          position_open: {
            select: {
              id: true,
              status: true,
              qty_remaining: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take,
      });

      const total = await this.prisma.tradeJob.count({ where });

      return {
        data: jobs,
        pagination: {
          current_page: page || 1,
          per_page: limit || 20,
          total_items: total,
          total_pages: limit ? Math.ceil(total / limit) : 1,
        },
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao listar trade jobs');
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter trade job por ID',
    description: 'Retorna os detalhes completos de um trade job específico, incluindo execuções e posição relacionada.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do trade job', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Trade job encontrado',
    schema: {
      example: {
        id: 1,
        exchange_account_id: 1,
        trade_mode: 'REAL',
        symbol: 'BTCUSDT',
        side: 'BUY',
        order_type: 'MARKET',
        quote_amount: 100,
        status: 'FILLED',
        exchange_account: {
          id: 1,
          label: 'Binance Spot Real',
        },
        executions: [
          {
            id: 1,
            exchange_order_id: '12345',
            executed_qty: 0.001,
            avg_price: 50000,
            status_exchange: 'FILLED',
          },
        ],
        position_open: {
          id: 1,
          status: 'OPEN',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Trade job não encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any): Promise<any> {
    try {
      // Buscar job e validar propriedade via exchange_account
      const job = await this.prisma.tradeJob.findFirst({
        where: { id },
        include: {
          exchange_account: {
            select: {
              id: true,
              user_id: true,
              label: true,
              exchange: true,
            },
          },
          executions: {
            orderBy: {
              created_at: 'desc',
            },
            include: {
              position_fills: {
                include: {
                  position: {
                    select: {
                      id: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
          position_open: {
            select: {
              id: true,
              status: true,
              qty_total: true,
              qty_remaining: true,
              price_open: true,
            },
          },
        },
      });

      if (!job) {
        throw new NotFoundException('Trade job não encontrado');
      }

      // Buscar webhook event se existir
      let webhookEvent = null;
      if (job.webhook_event_id) {
        webhookEvent = await this.prisma.webhookEvent.findFirst({
          where: { id: job.webhook_event_id },
          include: {
            webhook_source: {
              select: {
                id: true,
                label: true,
                webhook_code: true,
              },
            },
          },
        });
      }

      // Validar que a exchange account pertence ao usuário
      if (job.exchange_account.user_id !== user.userId) {
        throw new NotFoundException('Trade job não encontrado');
      }

      return {
        ...job,
        webhook_event: webhookEvent ? {
          id: webhookEvent.id,
          event_uid: webhookEvent.event_uid,
          symbol_raw: webhookEvent.symbol_raw,
          symbol_normalized: webhookEvent.symbol_normalized,
          action: webhookEvent.action,
          raw_text: webhookEvent.raw_text,
          webhook_source: webhookEvent.webhook_source,
        } : null,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao buscar trade job');
    }
  }
}

