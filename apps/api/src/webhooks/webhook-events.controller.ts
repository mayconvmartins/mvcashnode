import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
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
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Webhooks')
@Controller('webhook-events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookEventsController {
  constructor(
    private webhooksService: WebhooksService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar webhook events',
    description: 'Retorna todos os eventos de webhook recebidos, com filtros opcionais por webhook source, status e trade_mode.',
  })
  @ApiQuery({ name: 'webhookSourceId', required: false, type: Number, description: 'Filtrar por webhook source' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filtrar por status (RECEIVED, JOB_CREATED, SKIPPED, FAILED)' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'], description: 'Filtrar por modo de trading' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número da página', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Lista de webhook events',
    schema: {
      example: [
        {
          id: 1,
          webhook_source_id: 1,
          target_account_id: 1,
          trade_mode: 'REAL',
          event_uid: 'evt_1234567890_abc123',
          symbol_raw: 'SOLUSDT.P',
          symbol_normalized: 'SOLUSDT',
          action: 'BUY_SIGNAL',
          status: 'JOB_CREATED',
          created_at: '2025-02-12T10:00:00.000Z',
          processed_at: '2025-02-12T10:00:01.000Z',
        },
      ],
    },
  })
  async list(
    @CurrentUser() user: any,
    @Query('webhookSourceId') webhookSourceId?: number,
    @Query('status') status?: string,
    @Query('trade_mode') tradeMode?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<any> {
    try {
      // Buscar IDs dos webhook sources do usuário
      const userSources = await this.prisma.webhookSource.findMany({
        where: { owner_user_id: user.userId },
        select: { id: true },
      });

      const sourceIds = userSources.map((src) => src.id);

      if (sourceIds.length === 0) {
        return { data: [], pagination: { current_page: 1, per_page: 20, total_items: 0, total_pages: 0 } };
      }

      const where: any = {
        webhook_source_id: { in: sourceIds },
      };

      if (webhookSourceId) {
        // Validar que o source pertence ao usuário
        if (!sourceIds.includes(webhookSourceId)) {
          throw new BadRequestException('Webhook source não encontrado ou não pertence ao usuário');
        }
        where.webhook_source_id = webhookSourceId;
      }

      if (status) {
        where.status = status;
      }

      if (tradeMode) {
        where.trade_mode = tradeMode;
      }

      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;

      const events = await this.prisma.webhookEvent.findMany({
        where,
        include: {
          webhook_source: {
            select: {
              id: true,
              label: true,
              webhook_code: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take,
      });

      const total = await this.prisma.webhookEvent.count({ where });

      return {
        data: events,
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
      throw new BadRequestException('Erro ao listar webhook events');
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obter webhook event por ID',
    description: 'Retorna os detalhes completos de um evento de webhook, incluindo jobs criados e execuções relacionadas.',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do webhook event', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Webhook event encontrado',
    schema: {
      example: {
        id: 1,
        webhook_source_id: 1,
        target_account_id: 1,
        trade_mode: 'REAL',
        event_uid: 'evt_1234567890_abc123',
        symbol_raw: 'SOLUSDT.P',
        symbol_normalized: 'SOLUSDT',
        action: 'BUY_SIGNAL',
        timeframe: 'H1',
        price_reference: 213.09,
        status: 'JOB_CREATED',
        raw_payload_json: { text: 'SOLUSDT.P Caça Fundo 🟢 (H1) Preço (213.09)' },
        webhook_source: {
          id: 1,
          label: 'TradingView Alerts',
        },
        jobs_created: [
          {
            id: 1,
            status: 'FILLED',
          },
        ],
        created_at: '2025-02-12T10:00:00.000Z',
        processed_at: '2025-02-12T10:00:01.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Webhook event não encontrado' })
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any): Promise<any> {
    try {
      const event = await this.prisma.webhookEvent.findFirst({
        where: { id },
        include: {
          webhook_source: {
            select: {
              id: true,
              owner_user_id: true,
              label: true,
              webhook_code: true,
            },
          },
        },
      });

      if (!event) {
        throw new NotFoundException('Webhook event não encontrado');
      }

      // Validar propriedade via webhook_source
      if (event.webhook_source.owner_user_id !== user.userId) {
        throw new NotFoundException('Webhook event não encontrado');
      }

      // Buscar jobs criados a partir deste evento
      const jobs = await this.prisma.tradeJob.findMany({
        where: {
          webhook_event_id: id,
        },
        include: {
          executions: {
            take: 5,
            orderBy: { id: 'desc' },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      return {
        ...event,
        webhook_source: {
          id: event.webhook_source.id,
          label: event.webhook_source.label,
          webhook_code: event.webhook_source.webhook_code,
        },
        jobs_created: jobs.map((job) => ({
          id: job.id,
          symbol: job.symbol,
          side: job.side,
          status: job.status,
          executions_count: job.executions.length,
        })),
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao buscar webhook event');
    }
  }
}

