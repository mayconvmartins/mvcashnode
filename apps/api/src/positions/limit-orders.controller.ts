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
import { LimitOrdersHistoryQueryDto } from './dto/limit-orders-history-query.dto';

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
    description: 'Retorna todas as ordens LIMIT (compra e venda) do usuário autenticado, com filtros opcionais. Por padrão, retorna apenas ordens pendentes (PENDING_LIMIT e EXECUTING). Ordens LIMIT são ordens que aguardam um preço específico antes de serem executadas.',
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: ['PENDING_LIMIT', 'FILLED', 'CANCELED', 'EXPIRED', 'EXECUTING'], 
    description: 'Filtrar por status da ordem. Se não especificado, retorna apenas pendentes.',
    example: 'PENDING_LIMIT'
  })
  @ApiQuery({ 
    name: 'side', 
    required: false, 
    enum: ['BUY', 'SELL'], 
    description: 'Filtrar por lado da ordem (compra ou venda)',
    example: 'SELL'
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'], 
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'symbol', 
    required: false, 
    type: String, 
    description: 'Filtrar por símbolo do par de trading',
    example: 'SOLUSDT'
  })
  @ApiQuery({ 
    name: 'exchange_account_id', 
    required: false, 
    type: Number, 
    description: 'Filtrar por conta de exchange específica',
    example: 1
  })
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
    @Query('exchange_account_id') exchangeAccountId?: string
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
        // Incluir PENDING também para ordens que ainda não foram processadas
        where.status = { in: ['PENDING', 'PENDING_LIMIT', 'EXECUTING'] };
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
        // ✅ BUG-CRIT-001 FIX: Validar e converter exchangeAccountId de string para number
        const accountIdNum = parseInt(exchangeAccountId, 10);
        if (isNaN(accountIdNum)) {
          throw new BadRequestException('exchange_account_id deve ser um número válido');
        }
        if (!accountIds.includes(accountIdNum)) {
          throw new BadRequestException('Conta de exchange não encontrada ou não pertence ao usuário');
        }
        where.exchange_account_id = accountIdNum;
      }

      const jobs = await this.prisma.tradeJob.findMany({
        where,
        select: {
          id: true,
          exchange_account_id: true,
          trade_mode: true,
          symbol: true,
          side: true,
          order_type: true,
          quote_amount: true,
          base_quantity: true,
          limit_price: true,
          status: true,
          position_id_to_close: true,
          limit_order_expires_at: true,
          created_at: true,
          updated_at: true,
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
              status_exchange: true,
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
          position_id_to_close: job.position_id_to_close || null,
          symbol: job.symbol,
          side: job.side,
          order_type: job.order_type,
          limit_price: job.limit_price?.toNumber() || null,
          base_quantity: job.base_quantity?.toNumber() || null,
          quote_amount: job.quote_amount?.toNumber() || null,
          status: job.status,
          status_exchange: execution?.status_exchange || null,
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

  @Get('history')
  @ApiOperation({
    summary: 'Histórico de ordens LIMIT',
    description: 'Retorna o histórico completo de ordens LIMIT finalizadas (executadas, canceladas e expiradas) do usuário. Útil para análise de performance e auditoria.',
  })
  @ApiResponse({
    status: 200,
    description: 'Histórico de ordens LIMIT retornado com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          symbol: { type: 'string', example: 'SOLUSDT' },
          side: { type: 'string', enum: ['BUY', 'SELL'], example: 'SELL' },
          limit_price: { type: 'number', example: 220.50 },
          base_quantity: { type: 'number', example: 5.0 },
          status: { type: 'string', enum: ['FILLED', 'CANCELED', 'EXPIRED'], example: 'FILLED' },
          reason_code: { type: 'string', nullable: true, example: null, description: 'Código do motivo (se cancelada ou expirada)' },
          exchange_order_id: { type: 'string', nullable: true, example: '12345678' },
          exchange_account: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              label: { type: 'string', example: 'Binance Spot Real' },
              exchange: { type: 'string', example: 'BINANCE_SPOT' },
            },
          },
          filled_at: { type: 'string', nullable: true, format: 'date-time', example: '2025-02-12T11:00:00.000Z', description: 'Data de execução (se FILLED)' },
          created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
        },
      },
    },
  })
  async history(
    @CurrentUser() user: any,
    @Query() query: LimitOrdersHistoryQueryDto
  ): Promise<any[]> {
    const { from, to, symbol, status, trade_mode: tradeMode } = query;
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
        status: { in: ['FILLED', 'CANCELED', 'EXPIRED'] },
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

  @Get(':id')
  @ApiOperation({
    summary: 'Detalhes de ordem LIMIT',
    description: 'Retorna os detalhes completos de uma ordem LIMIT específica. Para ordens em modo REAL, busca o status atual na exchange via API. Inclui histórico de execuções e informações da posição relacionada (se aplicável).',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number', 
    description: 'ID do trade job (ordem LIMIT)',
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da ordem LIMIT retornados com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        position_id: { type: 'number', nullable: true, example: 1542, description: 'ID da posição relacionada (se ordem de venda)' },
        symbol: { type: 'string', example: 'SOLUSDT' },
        side: { type: 'string', enum: ['BUY', 'SELL'], example: 'SELL' },
        order_type: { type: 'string', example: 'LIMIT' },
        limit_price: { type: 'number', example: 220.50, description: 'Preço limite da ordem' },
        base_quantity: { type: 'number', example: 5.0, description: 'Quantidade em base asset' },
        quote_amount: { type: 'number', nullable: true, example: 1102.50, description: 'Valor total em quote asset' },
        status: { type: 'string', enum: ['PENDING_LIMIT', 'EXECUTING', 'FILLED', 'CANCELED', 'EXPIRED'], example: 'PENDING_LIMIT' },
        exchange_order_id: { type: 'string', nullable: true, example: '12345678', description: 'ID da ordem na exchange (modo REAL)' },
        exchange_status: { type: 'string', nullable: true, example: 'NEW', description: 'Status atual na exchange (modo REAL)' },
        exchange_account: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            label: { type: 'string', example: 'Binance Spot Real' },
            exchange: { type: 'string', example: 'BINANCE_SPOT' },
          },
        },
        position: {
          type: 'object',
          nullable: true,
          properties: {
            id: { type: 'number', example: 1542 },
            status: { type: 'string', example: 'OPEN' },
            qty_total: { type: 'number', example: 5.0 },
            qty_remaining: { type: 'number', example: 5.0 },
          },
        },
        executions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              exchange_order_id: { type: 'string', example: '12345678' },
              executed_qty: { type: 'number', example: 2.5 },
              avg_price: { type: 'number', example: 220.50 },
              status_exchange: { type: 'string', example: 'FILLED' },
              created_at: { type: 'string', format: 'date-time', example: '2025-02-12T11:00:00.000Z' },
            },
          },
        },
        limit_order_expires_at: { type: 'string', nullable: true, format: 'date-time', example: '2025-02-13T10:00:00.000Z' },
        created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Ordem LIMIT não encontrada ou não pertence ao usuário',
    schema: {
      example: {
        statusCode: 404,
        message: 'Ordem LIMIT não encontrada',
        error: 'Not Found',
      },
    },
  })
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
    description: 'Cancela uma ordem LIMIT pendente. Para modo REAL, cancela a ordem na exchange via API CCXT e atualiza o status. Para modo SIMULATION, apenas marca como cancelada no banco de dados. Apenas ordens com status PENDING_LIMIT ou EXECUTING podem ser canceladas.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number', 
    description: 'ID do trade job (ordem LIMIT)',
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Ordem cancelada com sucesso',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Ordem LIMIT cancelada com sucesso' },
        order_id: { type: 'number', example: 1 },
        exchange_order_id: { type: 'string', nullable: true, example: '12345678', description: 'ID da ordem na exchange (modo REAL)' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Ordem não pode ser cancelada (já executada, cancelada ou expirada)',
    schema: {
      example: {
        statusCode: 400,
        message: 'Ordem não pode ser cancelada. Status atual: FILLED',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Ordem LIMIT não encontrada ou não pertence ao usuário',
  })
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
}

