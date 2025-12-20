import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
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
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';
import { WebhookMonitorService } from '@mvcashnode/domain';
import { TradeJobService } from '@mvcashnode/domain';
import { BlockSubscribersGuard } from '../subscriptions/guards/block-subscribers.guard';

@ApiTags('Webhooks')
@Controller('webhooks/monitor')
@UseGuards(JwtAuthGuard, BlockSubscribersGuard)
@ApiBearerAuth()
export class WebhookMonitorController {
  private monitorService: WebhookMonitorService;

  constructor(
    private webhooksService: WebhooksService,
    private prisma: PrismaService
  ) {
    const tradeJobService = new TradeJobService(prisma);
    this.monitorService = new WebhookMonitorService(prisma, tradeJobService);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Listar alertas ativos de monitoramento (paginado)' })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number, 
    description: 'Número da página (padrão: 1, mínimo: 1)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Itens por página (padrão: 100, mínimo: 1, máximo: 200)',
    example: 100
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de alertas ativos (paginada)',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        pagination: {
          type: 'object',
          properties: {
            current_page: { type: 'number', example: 1 },
            per_page: { type: 'number', example: 100 },
            total_items: { type: 'number', example: 250 },
            total_pages: { type: 'number', example: 3 },
          },
        },
      },
    },
  })
  async listActiveAlerts(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    // ✅ BUG-CRIT-003 FIX: Validar limites min/max para paginação
    const finalPage = Math.max(1, page ? Math.min(1000, Math.max(1, parseInt(page, 10) || 1)) : 1);
    const finalLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 100), 200);
    const skip = (finalPage - 1) * finalLimit;

    const where: any = {
      state: 'MONITORING',
      webhook_source: {
        OR: [
          { owner_user_id: user.userId },
          {
            bindings: {
              some: {
                is_active: true,
                exchange_account: {
                  user_id: user.userId,
                },
              },
            },
          },
        ],
      },
    };

    // Executar count e findMany em paralelo
    const [totalItems, alerts] = await Promise.all([
      this.prisma.webhookMonitorAlert.count({ where }),
      this.prisma.webhookMonitorAlert.findMany({
        where,
        select: {
          id: true,
          webhook_source_id: true,
          exchange_account_id: true,
          symbol: true,
          trade_mode: true,
          side: true,
          price_alert: true,
          price_minimum: true,
          price_maximum: true,
          current_price: true,
          execution_price: true,
          cycles_without_new_low: true,
          cycles_without_new_high: true,
          monitoring_status: true,
          exit_reason: true,
          exit_details: true,
          executed_trade_job_ids_json: true,
          state: true,
          created_at: true,
          updated_at: true,
          webhook_source: {
            select: {
              id: true,
              label: true,
              webhook_code: true,
            },
          },
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
            },
          },
          webhook_event: {
            select: {
              id: true,
              action: true,
              created_at: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: finalLimit,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / finalLimit);

    // Converter Decimal para número e garantir que todos os campos sejam retornados
    const data = alerts.map((alert: any) => ({
      ...alert,
      price_alert: alert.price_alert?.toNumber ? alert.price_alert.toNumber() : Number(alert.price_alert),
      price_minimum: alert.price_minimum?.toNumber ? alert.price_minimum.toNumber() : (alert.price_minimum ? Number(alert.price_minimum) : null),
      price_maximum: alert.price_maximum?.toNumber ? alert.price_maximum.toNumber() : (alert.price_maximum ? Number(alert.price_maximum) : null),
      current_price: alert.current_price?.toNumber ? alert.current_price.toNumber() : (alert.current_price ? Number(alert.current_price) : null),
      execution_price: alert.execution_price?.toNumber ? alert.execution_price.toNumber() : (alert.execution_price ? Number(alert.execution_price) : null),
      cycles_without_new_low: alert.cycles_without_new_low || 0,
      cycles_without_new_high: alert.cycles_without_new_high || 0,
      monitoring_status: alert.monitoring_status || null,
      exit_reason: alert.exit_reason || null,
      exit_details: alert.exit_details || null,
      side: alert.side || 'BUY',
      executed_trade_job_ids_json: alert.executed_trade_job_ids_json || null,
    }));

    return {
      data,
      pagination: {
        current_page: finalPage,
        per_page: finalLimit,
        total_items: totalItems,
        total_pages: totalPages,
      },
    };
  }

  @Get('alerts/:id')
  @ApiOperation({ summary: 'Obter detalhes de um alerta' })
  @ApiParam({ name: 'id', description: 'ID do alerta' })
  @ApiResponse({ status: 200, description: 'Detalhes do alerta' })
  @ApiResponse({ status: 404, description: 'Alerta não encontrado' })
  async getAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ): Promise<Record<string, any>> {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id },
      include: {
        webhook_source: {
          select: {
            id: true,
            label: true,
            webhook_code: true,
          },
        },
        exchange_account: {
          select: {
            id: true,
            label: true,
            exchange: true,
            user_id: true,
          },
        },
        webhook_event: {
          select: {
            id: true,
            action: true,
            created_at: true,
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Alerta não encontrado');
    }

    // Verificar se o usuário tem acesso a este alerta
    if (alert.exchange_account.user_id !== user.userId && !user.roles?.some((r: any) => r.role === 'admin')) {
      throw new NotFoundException('Alerta não encontrado');
    }

    // Converter Decimal para número
    return {
      ...alert,
      price_alert: alert.price_alert?.toNumber ? alert.price_alert.toNumber() : Number(alert.price_alert),
      price_minimum: alert.price_minimum?.toNumber ? alert.price_minimum.toNumber() : Number(alert.price_minimum),
      current_price: alert.current_price?.toNumber ? alert.current_price.toNumber() : (alert.current_price ? Number(alert.current_price) : null),
    } as Record<string, any>;
  }

  @Post('alerts/:id/cancel')
  @ApiOperation({ summary: 'Cancelar alerta manualmente' })
  @ApiParam({ name: 'id', description: 'ID do alerta' })
  @ApiResponse({ status: 200, description: 'Alerta cancelado com sucesso' })
  @ApiResponse({ status: 404, description: 'Alerta não encontrado' })
  async cancelAlert(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @CurrentUser() user: any
  ) {
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id },
      include: {
        exchange_account: {
          select: {
            user_id: true,
          },
        },
        webhook_source: {
          select: {
            owner_user_id: true,
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Alerta não encontrado');
    }

    // Verificar se o usuário tem acesso a este alerta
    // Verificar via webhook_source (obrigatório) ou exchange_account (opcional)
    const isAdmin = user.roles?.some((r: any) => r.role === 'admin');
    const ownsWebhook = alert.webhook_source?.owner_user_id === user.userId;
    const ownsAccount = alert.exchange_account?.user_id === user.userId;
    
    if (!isAdmin && !ownsWebhook && !ownsAccount) {
      throw new NotFoundException('Alerta não encontrado');
    }

    if (alert.state !== 'MONITORING') {
      throw new BadRequestException('Apenas alertas em MONITORING podem ser cancelados');
    }

    const reason = body.reason || 'Cancelado manualmente pelo usuário';
    await this.monitorService.cancelAlert(id, reason);

    return { message: 'Alerta cancelado com sucesso' };
  }

  @Get('history')
  @ApiOperation({ summary: 'Listar histórico de alertas (paginado)' })
  @ApiQuery({ name: 'symbol', required: false, description: 'Filtrar por símbolo' })
  @ApiQuery({ name: 'state', required: false, description: 'Filtrar por estado (EXECUTED, CANCELLED)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Data inicial (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Data final (ISO string)' })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number, 
    description: 'Número da página (padrão: 1, mínimo: 1)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Itens por página (padrão: 50, mínimo: 1, máximo: 200)',
    example: 50
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Histórico de alertas (paginado)',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
        },
        pagination: {
          type: 'object',
          properties: {
            current_page: { type: 'number', example: 1 },
            per_page: { type: 'number', example: 50 },
            total_items: { type: 'number', example: 150 },
            total_pages: { type: 'number', example: 3 },
          },
        },
      },
    },
  })
  async getHistory(
    @Query('symbol') symbol?: string,
    @Query('state') state?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any
  ) {
    // Processar parâmetros de paginação
    const finalPage = Math.max(1, page ? parseInt(page, 10) : 1);
    const finalLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 50), 200);
    const skip = (finalPage - 1) * finalLimit;

    const filters: any = {
      userId: user?.userId,
      page: finalPage,
      limit: finalLimit,
      skip,
    };

    if (symbol) {
      filters.symbol = symbol;
    }

    if (state && ['EXECUTED', 'CANCELLED'].includes(state)) {
      filters.state = state as any;
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    try {
      const result = await this.monitorService.listHistory(filters);
      const { data: history, total: totalItems } = result;
      
      // Converter Decimal para número e incluir campos de métricas se existirem
      const data = history.map((alert: any) => ({
        ...alert,
        price_alert: alert.price_alert?.toNumber ? alert.price_alert.toNumber() : Number(alert.price_alert),
        price_minimum: alert.price_minimum?.toNumber ? alert.price_minimum.toNumber() : (alert.price_minimum ? Number(alert.price_minimum) : null),
        price_maximum: alert.price_maximum?.toNumber ? alert.price_maximum.toNumber() : (alert.price_maximum ? Number(alert.price_maximum) : null),
        current_price: alert.current_price?.toNumber ? alert.current_price.toNumber() : (alert.current_price ? Number(alert.current_price) : null),
        execution_price: alert.execution_price?.toNumber ? alert.execution_price.toNumber() : (alert.execution_price ? Number(alert.execution_price) : null),
        savings_pct: alert.savings_pct?.toNumber ? alert.savings_pct.toNumber() : (alert.savings_pct ? Number(alert.savings_pct) : null),
        efficiency_pct: alert.efficiency_pct?.toNumber ? alert.efficiency_pct.toNumber() : (alert.efficiency_pct ? Number(alert.efficiency_pct) : null),
        monitoring_duration_minutes: alert.monitoring_duration_minutes || null,
      }));

      const totalPages = Math.ceil(totalItems / finalLimit);

      return {
        data,
        pagination: {
          current_page: finalPage,
          per_page: finalLimit,
          total_items: totalItems,
          total_pages: totalPages,
        },
      };
    } catch (error: any) {
      console.error('[WEBHOOK-MONITOR] Erro ao obter histórico:', error);
      throw new BadRequestException(`Erro ao obter histórico: ${error.message}`);
    }
  }

  @Get('summary')
  @ApiOperation({ summary: 'Obter resumo de métricas do monitor' })
  @ApiResponse({ status: 200, description: 'Resumo de métricas' })
  async getSummary(@CurrentUser() user: any) {
    try {
      return await this.monitorService.getSummary();
    } catch (error: any) {
      console.error('[WEBHOOK-MONITOR] Erro ao obter summary:', error);
      throw new BadRequestException(`Erro ao obter resumo: ${error.message}`);
    }
  }

  @Post('calculate-metrics')
  @ApiOperation({ summary: 'Calcular métricas retroativamente para alertas já executados' })
  @ApiResponse({ status: 200, description: 'Métricas calculadas' })
  async calculateMetrics(@CurrentUser() user: any) {
    try {
      const result = await this.monitorService.calculateMetricsForExecutedAlerts();
      return {
        message: `Métricas calculadas para ${result.processed} alertas`,
        processed: result.processed,
        errors: result.errors,
      };
    } catch (error: any) {
      console.error('[WEBHOOK-MONITOR] Erro ao calcular métricas:', error);
      throw new BadRequestException(`Erro ao calcular métricas: ${error.message}`);
    }
  }

  @Get('config')
  @ApiOperation({ summary: 'Obter configurações globais de monitoramento' })
  @ApiResponse({ status: 200, description: 'Configurações globais de monitoramento' })
  async getConfig(@CurrentUser() _user: any) {
    // Sempre retornar configuração global (user_id = null)
    const config = await this.monitorService.getConfig();
    return config;
  }

  @Put('config')
  @ApiOperation({ summary: 'Atualizar configurações globais de monitoramento' })
  @ApiResponse({ status: 200, description: 'Configurações globais atualizadas' })
  async updateConfig(
    @Body() body: any,
    @CurrentUser() _user: any
  ) {
    // Se body é um Buffer, fazer parse manual
    let parsedBody: any = body;
    if (body && typeof body === 'object' && body.type === 'Buffer' && Array.isArray(body.data)) {
      try {
        const buffer = Buffer.from(body.data);
        parsedBody = JSON.parse(buffer.toString('utf8'));
        console.log('[WEBHOOK-MONITOR] Body parseado de Buffer:', parsedBody);
      } catch (error) {
        console.error('[WEBHOOK-MONITOR] Erro ao fazer parse do Buffer:', error);
        throw new BadRequestException('Erro ao processar dados da requisição');
      }
    }
    
    console.log('[WEBHOOK-MONITOR] Atualizando configuração global:', JSON.stringify(parsedBody, null, 2));
    
    // Sempre trabalhar com configuração global (user_id = null)
    let config = await this.prisma.webhookMonitorConfig.findFirst({
      where: { user_id: null },
    });

    const configData = parsedBody;
    
    if (!config) {
      // Criar configuração global se não existir
      config = await this.prisma.webhookMonitorConfig.create({
        data: {
          user_id: null, // Configuração global
          monitor_enabled: configData.monitor_enabled ?? true,
          check_interval_sec: configData.check_interval_sec ?? 30,
          // BUY
          lateral_tolerance_pct: configData.lateral_tolerance_pct ?? 0.3,
          lateral_cycles_min: configData.lateral_cycles_min ?? 4,
          rise_trigger_pct: configData.rise_trigger_pct ?? 0.75,
          rise_cycles_min: configData.rise_cycles_min ?? 2,
          max_fall_pct: configData.max_fall_pct ?? 6.0,
          max_monitoring_time_min: configData.max_monitoring_time_min ?? 60,
          cooldown_after_execution_min: configData.cooldown_after_execution_min ?? 30,
          // SELL
          sell_lateral_tolerance_pct: configData.sell_lateral_tolerance_pct ?? 0.3,
          sell_lateral_cycles_min: configData.sell_lateral_cycles_min ?? 4,
          sell_fall_trigger_pct: configData.sell_fall_trigger_pct ?? 0.5,
          sell_fall_cycles_min: configData.sell_fall_cycles_min ?? 2,
          sell_max_monitoring_time_min: configData.sell_max_monitoring_time_min ?? 60,
          sell_cooldown_after_execution_min: configData.sell_cooldown_after_execution_min ?? 30,
        },
      });
      console.log('[WEBHOOK-MONITOR] Configuração global criada com sucesso');
    } else {
      // Atualizar configuração global existente
      const updateData: any = {};
      
      if (configData.monitor_enabled !== undefined) updateData.monitor_enabled = configData.monitor_enabled;
      if (configData.check_interval_sec !== undefined) updateData.check_interval_sec = configData.check_interval_sec;
      if (configData.lateral_tolerance_pct !== undefined) updateData.lateral_tolerance_pct = configData.lateral_tolerance_pct;
      if (configData.lateral_cycles_min !== undefined) updateData.lateral_cycles_min = configData.lateral_cycles_min;
      if (configData.rise_trigger_pct !== undefined) updateData.rise_trigger_pct = configData.rise_trigger_pct;
      if (configData.rise_cycles_min !== undefined) updateData.rise_cycles_min = configData.rise_cycles_min;
      if (configData.max_fall_pct !== undefined) updateData.max_fall_pct = configData.max_fall_pct;
      if (configData.max_monitoring_time_min !== undefined) updateData.max_monitoring_time_min = configData.max_monitoring_time_min;
      if (configData.cooldown_after_execution_min !== undefined) updateData.cooldown_after_execution_min = configData.cooldown_after_execution_min;
      // SELL
      if (configData.sell_lateral_tolerance_pct !== undefined) updateData.sell_lateral_tolerance_pct = configData.sell_lateral_tolerance_pct;
      if (configData.sell_lateral_cycles_min !== undefined) updateData.sell_lateral_cycles_min = configData.sell_lateral_cycles_min;
      if (configData.sell_fall_trigger_pct !== undefined) updateData.sell_fall_trigger_pct = configData.sell_fall_trigger_pct;
      if (configData.sell_fall_cycles_min !== undefined) updateData.sell_fall_cycles_min = configData.sell_fall_cycles_min;
      if (configData.sell_max_monitoring_time_min !== undefined) updateData.sell_max_monitoring_time_min = configData.sell_max_monitoring_time_min;
      if (configData.sell_cooldown_after_execution_min !== undefined) updateData.sell_cooldown_after_execution_min = configData.sell_cooldown_after_execution_min;
      
      console.log('[WEBHOOK-MONITOR] Dados que serão atualizados:', JSON.stringify(updateData, null, 2));
      
      if (Object.keys(updateData).length === 0) {
        console.log('[WEBHOOK-MONITOR] Nenhum campo para atualizar!');
      } else {
        config = await this.prisma.webhookMonitorConfig.update({
          where: { id: config.id },
          data: updateData,
        });
        console.log('[WEBHOOK-MONITOR] Configuração global atualizada com sucesso');
      }
    }

    return {
      monitor_enabled: config.monitor_enabled,
      check_interval_sec: config.check_interval_sec,
      // BUY
      lateral_tolerance_pct: config.lateral_tolerance_pct.toNumber(),
      lateral_cycles_min: config.lateral_cycles_min,
      rise_trigger_pct: config.rise_trigger_pct.toNumber(),
      rise_cycles_min: config.rise_cycles_min,
      max_fall_pct: config.max_fall_pct.toNumber(),
      max_monitoring_time_min: config.max_monitoring_time_min,
      cooldown_after_execution_min: config.cooldown_after_execution_min,
      // SELL
      sell_lateral_tolerance_pct: (config as any).sell_lateral_tolerance_pct?.toNumber() || 0.3,
      sell_lateral_cycles_min: (config as any).sell_lateral_cycles_min || 4,
      sell_fall_trigger_pct: (config as any).sell_fall_trigger_pct?.toNumber() || 0.5,
      sell_fall_cycles_min: (config as any).sell_fall_cycles_min || 2,
      sell_max_monitoring_time_min: (config as any).sell_max_monitoring_time_min || 60,
      sell_cooldown_after_execution_min: (config as any).sell_cooldown_after_execution_min || 30,
    };
  }

  @Get('alerts/:id/timeline')
  @ApiOperation({ summary: 'Obter timeline detalhada de um alerta de monitoramento' })
  @ApiParam({ name: 'id', description: 'ID do alerta', type: Number })
  @ApiResponse({ 
    status: 200, 
    description: 'Timeline completa do alerta com snapshots e resumo',
    schema: {
      type: 'object',
      properties: {
        alert: { type: 'object', description: 'Dados do alerta' },
        snapshots: { 
          type: 'array', 
          items: { type: 'object' },
          description: 'Lista de snapshots ordenados por data'
        },
        summary: {
          type: 'object',
          properties: {
            totalDuration: { type: 'number', description: 'Duração total em minutos' },
            cyclesByStatus: {
              type: 'object',
              properties: {
                FALLING: { type: 'number' },
                LATERAL: { type: 'number' },
                RISING: { type: 'number' },
              },
            },
            priceRange: {
              type: 'object',
              properties: {
                min: { type: 'number' },
                max: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  async getAlertTimeline(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number
  ) {
    // Verificar se o alerta pertence ao usuário
    const alert = await this.prisma.webhookMonitorAlert.findUnique({
      where: { id },
      include: { webhook_source: true },
    });

    if (!alert) {
      throw new NotFoundException(`Alerta ${id} não encontrado`);
    }

    // Verificar permissão
    if (alert.webhook_source.owner_user_id !== user.userId) {
      // Se não é o owner, verificar se tem acesso via binding
      const hasAccess = await this.prisma.accountWebhookBinding.findFirst({
        where: {
          webhook_source_id: alert.webhook_source_id,
          exchange_account: {
            user_id: user.userId,
          },
        },
      });

      if (!hasAccess) {
        throw new NotFoundException(`Alerta ${id} não encontrado`);
      }
    }

    return this.monitorService.getAlertTimeline(id);
  }
}

