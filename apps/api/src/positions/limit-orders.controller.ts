import {
  Controller,
  Get,
  Delete,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';
import { ExchangeAccountService } from '@mvcashnode/domain';
import { EncryptionService } from '@mvcashnode/shared';
import { AdapterFactory } from '@mvcashnode/exchange';
import { ExchangeType, TradeJobStatus } from '@mvcashnode/shared';
import { ConfigService } from '@nestjs/config';

@ApiTags('Limit Orders')
@Controller('limit-orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LimitOrdersController {
  constructor(
    private positionsService: PositionsService,
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private configService: ConfigService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar ordens LIMIT',
    description: 'Retorna todas as ordens LIMIT (compra e venda) do usuário, com filtros opcionais.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING_LIMIT', 'FILLED', 'CANCELED', 'EXPIRED'], description: 'Filtrar por status' })
  @ApiQuery({ name: 'side', required: false, enum: ['BUY', 'SELL'], description: 'Filtrar por lado (compra/venda)' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'], description: 'Filtrar por modo de trading' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Filtrar por símbolo' })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number, description: 'Filtrar por conta de exchange' })
  @ApiResponse({
    status: 200,
    description: 'Lista de ordens LIMIT',
    schema: {
      example: [
        {
          id: 1,
          position_id: 1542,
          symbol: 'SOL/USDT',
          side: 'SELL',
          order_type: 'LIMIT',
          limit_price: 220.50,
          base_quantity: 5.0,
          status: 'PENDING_LIMIT',
          exchange_order_id: '12345678',
          current_price: 215.30,
          distance_pct: 2.41,
          created_at: '2025-02-12T10:00:00.000Z',
          expires_at: '2025-02-13T10:00:00.000Z',
        },
      ],
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('side') side?: string,
    @Query('trade_mode') tradeMode?: string,
    @Query('symbol') symbol?: string,
    @Query('exchange_account_id') exchangeAccountId?: number
  ) {
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
        order_type: 'LIMIT',
      };

      if (status) {
        where.status = status;
      } else {
        // Por padrão, mostrar apenas pendentes se não especificado
        where.status = { in: ['PENDING_LIMIT', 'EXECUTING'] };
      }

      if (side) {
        where.side = side;
      }

      if (tradeMode) {
        where.trade_mode = tradeMode;
      }

      if (symbol) {
        where.symbol = symbol;
      }

      if (exchangeAccountId) {
        if (!accountIds.includes(exchangeAccountId)) {
          throw new BadRequestException('Conta de exchange não encontrada ou não pertence ao usuário');
        }
        where.exchange_account_id = exchangeAccountId;
      }

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
          position_open: {
            select: {
              id: true,
              status: true,
            },
          },
          executions: {
            take: 1,
            orderBy: { id: 'desc' },
            select: {
              exchange_order_id: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      // Formatar resposta com informações adicionais
      return jobs.map((job) => {
        const execution = job.executions[0];
        return {
          id: job.id,
          position_id: job.position_open?.id || null,
          symbol: job.symbol,
          side: job.side,
          order_type: job.order_type,
          limit_price: job.limit_price?.toNumber() || null,
          base_quantity: job.base_quantity?.toNumber() || null,
          quote_amount: job.quote_amount?.toNumber() || null,
          status: job.status,
          exchange_order_id: execution?.exchange_order_id || null,
          exchange_account: job.exchange_account,
          limit_order_expires_at: job.limit_order_expires_at,
          created_at: job.created_at,
          updated_at: job.updated_at,
        };
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Erro ao listar ordens LIMIT');
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalhes de ordem LIMIT',
    description: 'Retorna os detalhes completos de uma ordem LIMIT, incluindo status atual na exchange (se REAL) e histórico.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do trade job (ordem LIMIT)', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da ordem LIMIT',
    schema: {
      example: {
        id: 1,
        position_id: 1542,
        symbol: 'SOL/USDT',
        side: 'SELL',
        limit_price: 220.50,
        base_quantity: 5.0,
        status: 'PENDING_LIMIT',
        exchange_order_id: '12345678',
        exchange_status: 'NEW',
        position: {
          id: 1542,
          status: 'OPEN',
        },
        executions: [],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Ordem LIMIT não encontrada' })
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any): Promise<any> {
    try {
      const job = await this.prisma.tradeJob.findFirst({
        where: {
          id,
          order_type: 'LIMIT',
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              user_id: true,
              label: true,
              exchange: true,
              is_simulation: true,
              testnet: true,
            },
          },
          position_open: {
            select: {
              id: true,
              status: true,
              qty_total: true,
              qty_remaining: true,
            },
          },
          executions: {
            orderBy: {
              created_at: 'desc',
            },
          },
        },
      });

      if (!job) {
        throw new NotFoundException('Ordem LIMIT não encontrada');
      }

      // Validar propriedade
      if (job.exchange_account.user_id !== user.userId) {
        throw new NotFoundException('Ordem LIMIT não encontrada');
      }

      let exchangeStatus = null;
      const execution = job.executions[0];

      // Se for REAL e tiver exchange_order_id, buscar status atual
      if (job.trade_mode === 'REAL' && execution?.exchange_order_id && !job.exchange_account.is_simulation) {
        try {
          const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
          const keys = await accountService.decryptApiKeys(job.exchange_account_id);

          if (keys) {
            const adapter = AdapterFactory.createAdapter(
              job.exchange_account.exchange as ExchangeType,
              keys.apiKey,
              keys.apiSecret,
              { testnet: job.exchange_account.testnet }
            );

            const order = await adapter.fetchOrder(execution.exchange_order_id, job.symbol);
            exchangeStatus = order.status;
          }
        } catch (error) {
          // Se falhar ao buscar status, continuar sem ele
          console.warn(`Failed to fetch order status for ${execution.exchange_order_id}:`, error);
        }
      }

      return {
        id: job.id,
        position_id: job.position_open?.id || null,
        symbol: job.symbol,
        side: job.side,
        order_type: job.order_type,
        limit_price: job.limit_price?.toNumber() || null,
        base_quantity: job.base_quantity?.toNumber() || null,
        quote_amount: job.quote_amount?.toNumber() || null,
        status: job.status,
        exchange_order_id: execution?.exchange_order_id || null,
        exchange_status: exchangeStatus,
        exchange_account: job.exchange_account,
        position: job.position_open,
        executions: job.executions.map((exec) => ({
          id: exec.id,
          exchange_order_id: exec.exchange_order_id,
          executed_qty: exec.executed_qty.toNumber(),
          avg_price: exec.avg_price.toNumber(),
          status_exchange: exec.status_exchange,
          created_at: exec.created_at,
        })),
        limit_order_expires_at: job.limit_order_expires_at,
        created_at: job.created_at,
        updated_at: job.updated_at,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao buscar ordem LIMIT');
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Cancelar ordem LIMIT',
    description: 'Cancela uma ordem LIMIT pendente. Para modo REAL, cancela na exchange via CCXT. Para modo SIMULATION, apenas marca como cancelada.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do trade job (ordem LIMIT)', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Ordem cancelada com sucesso',
    schema: {
      example: {
        message: 'Ordem LIMIT cancelada com sucesso',
        order_id: 1,
        exchange_order_id: '12345678',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Ordem não pode ser cancelada (já executada ou cancelada)' })
  @ApiResponse({ status: 404, description: 'Ordem LIMIT não encontrada' })
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    try {
      const job = await this.prisma.tradeJob.findFirst({
        where: {
          id,
          order_type: 'LIMIT',
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              user_id: true,
              exchange: true,
              is_simulation: true,
              testnet: true,
            },
          },
          executions: {
            take: 1,
            orderBy: { id: 'desc' },
            select: {
              id: true,
              exchange_order_id: true,
            },
          },
        },
      });

      if (!job) {
        throw new NotFoundException('Ordem LIMIT não encontrada');
      }

      // Validar propriedade
      if (job.exchange_account.user_id !== user.userId) {
        throw new NotFoundException('Ordem LIMIT não encontrada');
      }

      // Verificar se pode ser cancelada
      if (!['PENDING_LIMIT', 'EXECUTING'].includes(job.status)) {
        throw new BadRequestException(`Ordem não pode ser cancelada. Status atual: ${job.status}`);
      }

      const execution = job.executions[0];

      // Se for REAL e tiver exchange_order_id, cancelar na exchange
      if (job.trade_mode === 'REAL' && execution?.exchange_order_id && !job.exchange_account.is_simulation) {
        try {
          const accountService = new ExchangeAccountService(this.prisma, this.encryptionService);
          const keys = await accountService.decryptApiKeys(job.exchange_account_id);

          if (!keys) {
            throw new BadRequestException('Credenciais da exchange não encontradas');
          }

          const adapter = AdapterFactory.createAdapter(
            job.exchange_account.exchange as ExchangeType,
            keys.apiKey,
            keys.apiSecret,
            { testnet: job.exchange_account.testnet }
          );

          await adapter.cancelOrder(execution.exchange_order_id, job.symbol);
        } catch (error: any) {
          const errorMessage = error?.message || 'Erro ao cancelar ordem na exchange';
          // Se a ordem já foi executada ou cancelada na exchange, apenas atualizar status
          if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
            // Ordem já não existe na exchange, apenas atualizar status
          } else {
            throw new BadRequestException(`Erro ao cancelar ordem na exchange: ${errorMessage}`);
          }
        }
      }

      // Atualizar status do job
      await this.prisma.tradeJob.update({
        where: { id },
        data: {
          status: TradeJobStatus.CANCELED,
          reason_code: 'MANUAL_CANCEL',
          reason_message: 'Cancelada manualmente pelo usuário',
        },
      });

      // Se houver vault, liberar recursos reservados
      if (job.vault_id) {
        // TODO: Implementar liberação de recursos do vault se necessário
      }

      return {
        message: 'Ordem LIMIT cancelada com sucesso',
        order_id: id,
        exchange_order_id: execution?.exchange_order_id || null,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      const errorMessage = error?.message || 'Erro ao cancelar ordem';
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrada')) {
        throw new NotFoundException('Ordem LIMIT não encontrada');
      }

      throw new BadRequestException('Erro ao cancelar ordem LIMIT');
    }
  }

  @Get('history')
  @ApiOperation({
    summary: 'Histórico de ordens LIMIT',
    description: 'Retorna o histórico completo de ordens LIMIT (executadas, canceladas e expiradas) do usuário.',
  })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Data inicial (ISO 8601)', example: '2025-02-01T00:00:00Z' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Data final (ISO 8601)', example: '2025-02-12T23:59:59Z' })
  @ApiQuery({ name: 'symbol', required: false, type: String, description: 'Filtrar por símbolo' })
  @ApiQuery({ name: 'status', required: false, enum: ['FILLED', 'CANCELED', 'EXPIRED'], description: 'Filtrar por status final' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'], description: 'Filtrar por modo de trading' })
  @ApiResponse({
    status: 200,
    description: 'Histórico de ordens LIMIT',
    schema: {
      example: [
        {
          id: 1,
          symbol: 'SOL/USDT',
          side: 'SELL',
          limit_price: 220.50,
          base_quantity: 5.0,
          status: 'FILLED',
          filled_at: '2025-02-12T11:00:00.000Z',
          created_at: '2025-02-12T10:00:00.000Z',
        },
      ],
    },
  })
  async history(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('symbol') symbol?: string,
    @Query('status') status?: string,
    @Query('trade_mode') tradeMode?: string
  ) {
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
        order_type: 'LIMIT',
        status: { in: ['FILLED', 'CANCELED'] },
      };

      if (status) {
        where.status = status;
      }

      if (tradeMode) {
        where.trade_mode = tradeMode;
      }

      if (symbol) {
        where.symbol = symbol;
      }

      if (from || to) {
        where.created_at = {};
        if (from) {
          where.created_at.gte = new Date(from);
        }
        if (to) {
          where.created_at.lte = new Date(to);
        }
      }

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
            take: 1,
            orderBy: { id: 'desc' },
            select: {
              exchange_order_id: true,
              created_at: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      return jobs.map((job) => {
        const execution = job.executions[0];
        return {
          id: job.id,
          symbol: job.symbol,
          side: job.side,
          limit_price: job.limit_price?.toNumber() || null,
          base_quantity: job.base_quantity?.toNumber() || null,
          status: job.status,
          reason_code: job.reason_code,
          exchange_order_id: execution?.exchange_order_id || null,
          exchange_account: job.exchange_account,
          filled_at: execution?.created_at || null,
          created_at: job.created_at,
        };
      });
    } catch (error: any) {
      throw new BadRequestException('Erro ao buscar histórico de ordens LIMIT');
    }
  }
}

