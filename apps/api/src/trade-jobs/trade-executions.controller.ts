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
@Controller('trade-executions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TradeExecutionsController {
  constructor(
    private tradeJobsService: TradeJobsService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar execuções',
    description: 'Retorna todas as execuções de trades do usuário autenticado, com filtros opcionais.',
  })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'], description: 'Filtrar por modo de trading' })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number, description: 'Filtrar por conta de exchange' })
  @ApiQuery({ name: 'trade_job_id', required: false, type: Number, description: 'Filtrar por trade job' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número da página', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Lista de execuções',
    schema: {
      example: [
        {
          id: 1,
          trade_job_id: 1,
          exchange_account_id: 1,
          trade_mode: 'REAL',
          exchange: 'BINANCE_SPOT',
          exchange_order_id: '12345',
          executed_qty: 0.001,
          avg_price: 50000,
          status_exchange: 'FILLED',
          trade_job: {
            id: 1,
            symbol: 'BTCUSDT',
            side: 'BUY',
          },
          created_at: '2025-02-12T10:00:00.000Z',
        },
      ],
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('exchange_account_id') exchangeAccountId?: number,
    @Query('trade_job_id') tradeJobId?: number,
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
        return { data: [], pagination: { current_page: 1, per_page: 20, total_items: 0, total_pages: 0 } };
      }

      const where: any = {
        exchange_account_id: { in: accountIds },
      };

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

      if (tradeJobId) {
        where.trade_job_id = tradeJobId;
      }

      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;

      const executions = await this.prisma.tradeExecution.findMany({
        where,
        include: {
          trade_job: {
            select: {
              id: true,
              symbol: true,
              side: true,
              order_type: true,
              status: true,
            },
          },
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
            },
          },
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
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take,
      });

      const total = await this.prisma.tradeExecution.count({ where });

      return {
        data: executions,
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
      throw new BadRequestException('Erro ao listar execuções');
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter execução por ID',
    description: 'Retorna os detalhes completos de uma execução específica, incluindo trade job e position fills relacionados.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da execução', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Execução encontrada',
    schema: {
      example: {
        id: 1,
        trade_job_id: 1,
        exchange_account_id: 1,
        trade_mode: 'REAL',
        exchange: 'BINANCE_SPOT',
        exchange_order_id: '12345',
        client_order_id: 'client-1',
        status_exchange: 'FILLED',
        executed_qty: 0.001,
        cumm_quote_qty: 50,
        avg_price: 50000,
        trade_job: {
          id: 1,
          symbol: 'BTCUSDT',
          side: 'BUY',
        },
        position_fills: [
          {
            id: 1,
            position: {
              id: 1,
              status: 'OPEN',
            },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Execução não encontrada' })
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any): Promise<any> {
    try {
      // Buscar execução e validar propriedade via exchange_account
      const execution = await this.prisma.tradeExecution.findFirst({
        where: { id },
        include: {
          trade_job: {
            select: {
              id: true,
              symbol: true,
              side: true,
              order_type: true,
              status: true,
              quote_amount: true,
            },
          },
          exchange_account: {
            select: {
              id: true,
              user_id: true,
              label: true,
              exchange: true,
            },
          },
          position_fills: {
            include: {
              position: {
                select: {
                  id: true,
                  status: true,
                  qty_total: true,
                  qty_remaining: true,
                  price_open: true,
                },
              },
            },
          },
        },
      });

      if (!execution) {
        throw new NotFoundException('Execução não encontrada');
      }

      // Validar que a exchange account pertence ao usuário
      if (execution.exchange_account.user_id !== user.userId) {
        throw new NotFoundException('Execução não encontrada');
      }

      return execution;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao buscar execução');
    }
  }
}

