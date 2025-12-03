import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TradeJobsService } from './trade-jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Jobs & Executions')
@Controller('operations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OperationsController {
  constructor(
    private tradeJobsService: TradeJobsService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'View combinada de jobs e execuções (Operações)',
    description: `Retorna uma view unificada de trade jobs com suas execuções e posições relacionadas, facilitando a visualização completa do fluxo de operações de trading.

**Estrutura da resposta:**
- \`job\`: Informações do trade job (símbolo, lado, tipo de ordem, status, etc.)
- \`executions\`: Lista de execuções do job (ordens executadas na exchange)
- \`position\`: Posição aberta relacionada (se aplicável)

**Casos de uso:**
- Visualizar histórico completo de operações
- Rastrear execuções de um job específico
- Ver posições criadas a partir de jobs
- Analisar performance de trades`,
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'], 
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    type: String, 
    description: 'Filtrar por status do job (PENDING, EXECUTING, FILLED, FAILED, CANCELED)',
    example: 'FILLED'
  })
  @ApiQuery({ 
    name: 'exchange_account_id', 
    required: false, 
    type: Number, 
    description: 'Filtrar por conta de exchange específica',
    example: 1
  })
  @ApiQuery({ 
    name: 'symbol', 
    required: false, 
    type: String, 
    description: 'Filtrar por símbolo do par de trading',
    example: 'BTCUSDT'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number, 
    description: 'Número da página para paginação',
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
    description: 'Lista de operações (jobs com execuções)',
    schema: {
      example: [
        {
          job: {
            id: 1,
            exchange_account_id: 1,
            trade_mode: 'REAL',
            symbol: 'BTCUSDT',
            side: 'BUY',
            order_type: 'MARKET',
            quote_amount: 100,
            status: 'FILLED',
            created_at: '2025-02-12T10:00:00.000Z',
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
          position: {
            id: 1,
            status: 'OPEN',
            qty_remaining: 0.001,
          },
        },
      ],
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('status') status?: string,
    @Query('exchange_account_id') exchangeAccountId?: number,
    @Query('symbol') symbol?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
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

      if (status) {
        where.status = status;
      }

      if (tradeMode) {
        where.trade_mode = tradeMode;
      }

      if (exchangeAccountId) {
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
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take,
      });

      const total = await this.prisma.tradeJob.count({ where });

      // Formatar resposta combinando job, executions e position
      const operations = jobs.map((job) => ({
        job: {
          id: job.id,
          exchange_account_id: job.exchange_account_id,
          trade_mode: job.trade_mode,
          symbol: job.symbol,
          side: job.side,
          order_type: job.order_type,
          quote_amount: job.quote_amount?.toNumber() || null,
          base_quantity: job.base_quantity?.toNumber() || null,
          limit_price: job.limit_price?.toNumber() || null,
          status: job.status,
          reason_code: job.reason_code,
          reason_message: job.reason_message,
          vault_id: job.vault_id,
          limit_order_expires_at: job.limit_order_expires_at,
          exchange_account: job.exchange_account,
          webhook_event_id: job.webhook_event_id,
          created_at: job.created_at,
          updated_at: job.updated_at,
        },
        executions: job.executions.map((exec) => ({
          id: exec.id,
          exchange_order_id: exec.exchange_order_id,
          client_order_id: exec.client_order_id,
          status_exchange: exec.status_exchange,
          executed_qty: exec.executed_qty.toNumber(),
          cumm_quote_qty: exec.cumm_quote_qty.toNumber(),
          avg_price: exec.avg_price.toNumber(),
          created_at: exec.created_at,
        })),
        position: job.position_open
          ? {
              id: job.position_open.id,
              status: job.position_open.status,
              qty_total: job.position_open.qty_total.toNumber(),
              qty_remaining: job.position_open.qty_remaining.toNumber(),
              price_open: job.position_open.price_open.toNumber(),
            }
          : null,
      }));

      return {
        data: operations,
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
      throw new BadRequestException('Erro ao listar operações');
    }
  }
}

