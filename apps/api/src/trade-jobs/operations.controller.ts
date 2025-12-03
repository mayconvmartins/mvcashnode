import {
  Controller,
  Get,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
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
    @Query('exchange_account_id') exchangeAccountId?: string,
    @Query('symbol') symbol?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
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
        // Validar que trade_mode é válido
        if (tradeMode !== 'REAL' && tradeMode !== 'SIMULATION') {
          throw new BadRequestException(`trade_mode inválido: ${tradeMode}. Valores aceitos: REAL, SIMULATION`);
        }
        where.trade_mode = tradeMode;
      }

      // Converter exchangeAccountId para número se fornecido
      const exchangeAccountIdNum = exchangeAccountId ? parseInt(exchangeAccountId, 10) : undefined;
      if (exchangeAccountIdNum) {
        if (isNaN(exchangeAccountIdNum)) {
          throw new BadRequestException('exchange_account_id deve ser um número válido');
        }
        if (!accountIds.includes(exchangeAccountIdNum)) {
          throw new BadRequestException('Conta de exchange não encontrada ou não pertence ao usuário');
        }
        where.exchange_account_id = exchangeAccountIdNum;
      }

      if (symbol) {
        where.symbol = symbol;
      }

      // Converter page e limit para números
      const pageNum = page ? parseInt(page, 10) : undefined;
      const limitNum = limit ? parseInt(limit, 10) : undefined;
      
      if (page && isNaN(pageNum!)) {
        throw new BadRequestException('page deve ser um número válido');
      }
      if (limit && isNaN(limitNum!)) {
        throw new BadRequestException('limit deve ser um número válido');
      }

      const skip = pageNum && limitNum ? (pageNum - 1) * limitNum : undefined;
      const take = limitNum;

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
          exchange_account: jobWithRelations.exchange_account,
          webhook_event_id: job.webhook_event_id,
          created_at: job.created_at,
          updated_at: job.updated_at,
        },
        executions: jobWithRelations.executions.map((exec) => ({
          id: exec.id,
          exchange_order_id: exec.exchange_order_id,
          client_order_id: exec.client_order_id,
          status_exchange: exec.status_exchange,
          executed_qty: exec.executed_qty?.toNumber() || 0,
          cumm_quote_qty: exec.cumm_quote_qty?.toNumber() || 0,
          avg_price: exec.avg_price?.toNumber() || 0,
          created_at: exec.created_at,
        })),
        position: job.position_open
          ? {
              id: job.position_open.id,
              status: job.position_open.status,
              qty_total: job.position_open.qty_total?.toNumber() || 0,
              qty_remaining: job.position_open.qty_remaining?.toNumber() || 0,
              price_open: job.position_open.price_open?.toNumber() || 0,
            }
          : null,
      }));

      return {
        data: operations,
        pagination: {
          current_page: pageNum || 1,
          per_page: limitNum || 20,
          total_items: total,
          total_pages: limitNum ? Math.ceil(total / limitNum) : 1,
        },
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Log do erro real para debug
      console.error('[OperationsController] Erro ao listar operações:', error);
      console.error('[OperationsController] Stack:', error.stack);
      throw new BadRequestException(`Erro ao listar operações: ${error.message || 'Erro desconhecido'}`);
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter detalhes completos de uma operação',
    description: `Retorna informações detalhadas de uma operação específica, incluindo:
- Job completo com todos os campos
- Todas as execuções relacionadas
- Posição aberta/fechada relacionada (se aplicável)
- Fills da posição (se houver)
- Webhook event que originou o job (se aplicável)
- Timeline de eventos (criação, execução, fechamento)`,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID do trade job',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes completos da operação',
  })
  @ApiResponse({
    status: 404,
    description: 'Operação não encontrada',
  })
  async getOne(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number
  ) {
    try {
      // Buscar IDs das exchange accounts do usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });

      const accountIds = userAccounts.map((acc) => acc.id);

      if (accountIds.length === 0) {
        throw new NotFoundException('Operação não encontrada');
      }

      // Buscar job com todas as relações
      const job = await this.prisma.tradeJob.findFirst({
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
          executions: {
            orderBy: {
              created_at: 'asc',
            },
            include: {
              position_fills: {
                include: {
                  position: {
                    select: {
                      id: true,
                      status: true,
                      symbol: true,
                    },
                  },
                },
              },
            },
          },
          position_open: {
            include: {
              fills: {
                orderBy: {
                  created_at: 'asc',
                },
                include: {
                  execution: {
                    include: {
                      trade_job: {
                        select: {
                          id: true,
                          side: true,
                          order_type: true,
                          status: true,
                          created_at: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Buscar webhook event separadamente se houver webhook_event_id
      let webhookEvent = null;
      if (job?.webhook_event_id) {
        webhookEvent = await this.prisma.webhookEvent.findUnique({
          where: { id: job.webhook_event_id },
          select: {
            id: true,
            event_uid: true,
            action: true,
            symbol_normalized: true,
            price_reference: true,
            created_at: true,
          },
        });
      }

      if (!job) {
        throw new NotFoundException('Operação não encontrada');
      }

      // Type assertion para incluir as relações
      const jobWithRelations = job as typeof job & {
        exchange_account: typeof job.exchange_account;
        executions: typeof job.executions;
        position_open: typeof job.position_open;
      };

      // Buscar jobs de venda relacionados (via fills de SELL da posição)
      let sellJobs: any[] = [];
      if (jobWithRelations.position_open) {
        const sellFills = jobWithRelations.position_open.fills.filter((fill) => fill.side === 'SELL');
        const uniqueJobIds = new Set<number>();
        
        for (const fill of sellFills) {
          if (fill.execution?.trade_job) {
            const jobId = fill.execution.trade_job.id;
            if (!uniqueJobIds.has(jobId)) {
              uniqueJobIds.add(jobId);
              sellJobs.push({
                ...fill.execution.trade_job,
              });
            }
          }
        }
      }

      // Construir timeline de eventos
      const timeline: any[] = [];
      
      // Evento de criação do job
      timeline.push({
        type: 'JOB_CREATED',
        timestamp: jobWithRelations.created_at,
        description: `Job ${jobWithRelations.side} criado para ${jobWithRelations.symbol}`,
        data: {
          order_type: jobWithRelations.order_type,
          status: jobWithRelations.status,
        },
      });

      // Eventos de execução
      jobWithRelations.executions.forEach((exec, index) => {
        timeline.push({
          type: 'EXECUTION',
          timestamp: exec.created_at,
          description: `Execução ${index + 1}: ${exec.executed_qty.toNumber()} ${jobWithRelations.symbol.split('/')[0]} a ${exec.avg_price.toNumber()}`,
          data: {
            execution_id: exec.id,
            exchange_order_id: exec.exchange_order_id,
            status: exec.status_exchange,
          },
        });
      });

      // Evento de abertura de posição (se aplicável)
      if (jobWithRelations.position_open) {
        timeline.push({
          type: 'POSITION_OPENED',
          timestamp: jobWithRelations.position_open.created_at,
          description: `Posição aberta: ${jobWithRelations.position_open.qty_total.toNumber()} ${jobWithRelations.symbol.split('/')[0]}`,
          data: {
            position_id: jobWithRelations.position_open.id,
            price_open: jobWithRelations.position_open.price_open.toNumber(),
          },
        });

        // Eventos de vendas parciais/totais
        const sellFills = jobWithRelations.position_open.fills.filter((fill) => fill.side === 'SELL');
        sellFills.forEach((fill) => {
          timeline.push({
            type: 'SELL_FILL',
            timestamp: fill.created_at,
            description: `Venda: ${fill.qty.toNumber()} ${job.symbol.split('/')[0]} a ${fill.price.toNumber()}`,
            data: {
              fill_id: fill.id,
              execution_id: fill.trade_execution_id,
            },
          });
        });

        // Evento de fechamento (se aplicável)
        if (jobWithRelations.position_open.status === 'CLOSED' && jobWithRelations.position_open.closed_at) {
          timeline.push({
            type: 'POSITION_CLOSED',
            timestamp: jobWithRelations.position_open.closed_at,
            description: `Posição fechada: ${jobWithRelations.position_open.close_reason || 'MANUAL'}`,
            data: {
              position_id: jobWithRelations.position_open.id,
              close_reason: jobWithRelations.position_open.close_reason,
            },
          });
        }
      }

      // Ordenar timeline por timestamp
      timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Formatar resposta
      return {
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
          exchange_account: jobWithRelations.exchange_account,
          webhook_event_id: job.webhook_event_id,
          created_at: job.created_at,
          updated_at: job.updated_at,
        },
        executions: jobWithRelations.executions.map((exec) => ({
          id: exec.id,
          exchange_order_id: exec.exchange_order_id,
          client_order_id: exec.client_order_id,
          status_exchange: exec.status_exchange,
          executed_qty: exec.executed_qty?.toNumber() || 0,
          cumm_quote_qty: exec.cumm_quote_qty?.toNumber() || 0,
          avg_price: exec.avg_price?.toNumber() || 0,
          created_at: exec.created_at,
          position_fills: exec.position_fills.map((fill) => ({
            id: fill.id,
            side: fill.side,
            qty: fill.qty?.toNumber() || 0,
            price: fill.price?.toNumber() || 0,
            position_id: fill.position_id,
          })),
        })),
        position: jobWithRelations.position_open
          ? {
              id: jobWithRelations.position_open.id,
              status: jobWithRelations.position_open.status,
              qty_total: jobWithRelations.position_open.qty_total?.toNumber() || 0,
              qty_remaining: jobWithRelations.position_open.qty_remaining?.toNumber() || 0,
              price_open: jobWithRelations.position_open.price_open?.toNumber() || 0,
              fills: jobWithRelations.position_open.fills.map((fill) => ({
                id: fill.id,
                side: fill.side,
                qty: fill.qty?.toNumber() || 0,
                price: fill.price?.toNumber() || 0,
                created_at: fill.created_at,
                execution: fill.execution
                  ? {
                      id: fill.execution.id,
                      trade_job_id: fill.execution.trade_job_id,
                    }
                  : null,
              })),
            }
          : null,
        sell_jobs: sellJobs.map((sellJob) => ({
          id: sellJob.id,
          side: sellJob.side,
          order_type: sellJob.order_type,
          status: sellJob.status,
          created_at: sellJob.created_at,
        })),
        webhook_event: webhookEvent
          ? {
              id: webhookEvent.id,
              event_uid: webhookEvent.event_uid,
              action: webhookEvent.action,
              symbol_normalized: webhookEvent.symbol_normalized,
              price_reference: webhookEvent.price_reference?.toNumber() || null,
              created_at: webhookEvent.created_at,
            }
          : null,
        timeline,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('[OperationsController] Erro ao buscar operação:', error);
      console.error('[OperationsController] Stack:', error.stack);
      throw new BadRequestException(`Erro ao buscar operação: ${error.message || 'Erro desconhecido'}`);
    }
  }
}

