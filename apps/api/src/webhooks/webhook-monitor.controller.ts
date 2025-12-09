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
  @ApiOperation({ summary: 'Listar alertas ativos de monitoramento' })
  @ApiResponse({ status: 200, description: 'Lista de alertas ativos' })
  async listActiveAlerts(@CurrentUser() user: any) {
    const alerts = await this.monitorService.listActiveAlerts(user.userId);
    // Converter Decimal para número
    return alerts.map((alert: any) => ({
      ...alert,
      price_alert: alert.price_alert?.toNumber ? alert.price_alert.toNumber() : Number(alert.price_alert),
      price_minimum: alert.price_minimum?.toNumber ? alert.price_minimum.toNumber() : Number(alert.price_minimum),
      current_price: alert.current_price?.toNumber ? alert.current_price.toNumber() : (alert.current_price ? Number(alert.current_price) : null),
    }));
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
      },
    });

    if (!alert) {
      throw new NotFoundException('Alerta não encontrado');
    }

    // Verificar se o usuário tem acesso a este alerta
    if (alert.exchange_account.user_id !== user.userId && !user.roles?.some((r: any) => r.role === 'admin')) {
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
  @ApiOperation({ summary: 'Listar histórico de alertas' })
  @ApiQuery({ name: 'symbol', required: false, description: 'Filtrar por símbolo' })
  @ApiQuery({ name: 'state', required: false, description: 'Filtrar por estado (EXECUTED, CANCELLED)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Data inicial (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Data final (ISO string)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limite de resultados', type: Number })
  @ApiResponse({ status: 200, description: 'Histórico de alertas' })
  async getHistory(
    @Query('symbol') symbol?: string,
    @Query('state') state?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any
  ) {
    const filters: any = {
      userId: user?.userId,
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

    if (limit) {
      filters.limit = parseInt(limit, 10);
    }

    const history = await this.monitorService.listHistory(filters);
    // Converter Decimal para número
    return history.map((alert: any) => ({
      ...alert,
      price_alert: alert.price_alert?.toNumber ? alert.price_alert.toNumber() : Number(alert.price_alert),
      price_minimum: alert.price_minimum?.toNumber ? alert.price_minimum.toNumber() : Number(alert.price_minimum),
      current_price: alert.current_price?.toNumber ? alert.current_price.toNumber() : (alert.current_price ? Number(alert.current_price) : null),
    }));
  }

  @Get('config')
  @ApiOperation({ summary: 'Obter configurações de monitoramento' })
  @ApiResponse({ status: 200, description: 'Configurações de monitoramento' })
  async getConfig(@CurrentUser() user: any) {
    const config = await this.monitorService.getConfig(user.userId);
    return config;
  }

  @Put('config')
  @ApiOperation({ summary: 'Atualizar configurações de monitoramento' })
  @ApiResponse({ status: 200, description: 'Configurações atualizadas' })
  async updateConfig(
    @Body() body: {
      monitor_enabled?: boolean;
      check_interval_sec?: number;
      lateral_tolerance_pct?: number;
      lateral_cycles_min?: number;
      rise_trigger_pct?: number;
      rise_cycles_min?: number;
      max_fall_pct?: number;
      max_monitoring_time_min?: number;
      cooldown_after_execution_min?: number;
    },
    @CurrentUser() user: any
  ) {
    console.log('[WEBHOOK-MONITOR] Atualizando configurações:', JSON.stringify(body, null, 2));
    // Buscar ou criar configuração do usuário
    let config = await this.prisma.webhookMonitorConfig.findUnique({
      where: { user_id: user.userId },
    });

    if (!config) {
      // Criar configuração do usuário
      // Buscar configuração global para usar como base
      const globalConfig = await this.prisma.webhookMonitorConfig.findFirst({
        where: { user_id: null },
      });
      
      config = await this.prisma.webhookMonitorConfig.create({
        data: {
          user_id: user.userId,
          monitor_enabled: body.monitor_enabled ?? globalConfig?.monitor_enabled ?? true,
          check_interval_sec: body.check_interval_sec ?? globalConfig?.check_interval_sec ?? 30,
          lateral_tolerance_pct: body.lateral_tolerance_pct ?? globalConfig?.lateral_tolerance_pct ?? 0.3,
          lateral_cycles_min: body.lateral_cycles_min ?? globalConfig?.lateral_cycles_min ?? 4,
          rise_trigger_pct: body.rise_trigger_pct ?? globalConfig?.rise_trigger_pct ?? 0.75,
          rise_cycles_min: body.rise_cycles_min ?? globalConfig?.rise_cycles_min ?? 2,
          max_fall_pct: body.max_fall_pct ?? globalConfig?.max_fall_pct ?? 6.0,
          max_monitoring_time_min: body.max_monitoring_time_min ?? globalConfig?.max_monitoring_time_min ?? 60,
          cooldown_after_execution_min: body.cooldown_after_execution_min ?? globalConfig?.cooldown_after_execution_min ?? 30,
        },
      });
    } else {
      // Atualizar configuração existente
      // Construir objeto de atualização apenas com campos que foram enviados
      const updateData: any = {};
      
      if (body.monitor_enabled !== undefined) updateData.monitor_enabled = body.monitor_enabled;
      if (body.check_interval_sec !== undefined) updateData.check_interval_sec = body.check_interval_sec;
      if (body.lateral_tolerance_pct !== undefined) updateData.lateral_tolerance_pct = body.lateral_tolerance_pct;
      if (body.lateral_cycles_min !== undefined) updateData.lateral_cycles_min = body.lateral_cycles_min;
      if (body.rise_trigger_pct !== undefined) updateData.rise_trigger_pct = body.rise_trigger_pct;
      if (body.rise_cycles_min !== undefined) updateData.rise_cycles_min = body.rise_cycles_min;
      if (body.max_fall_pct !== undefined) updateData.max_fall_pct = body.max_fall_pct;
      if (body.max_monitoring_time_min !== undefined) updateData.max_monitoring_time_min = body.max_monitoring_time_min;
      if (body.cooldown_after_execution_min !== undefined) updateData.cooldown_after_execution_min = body.cooldown_after_execution_min;
      
      config = await this.prisma.webhookMonitorConfig.update({
        where: { user_id: user.userId },
        data: updateData,
      });
    }

    return {
      monitor_enabled: config.monitor_enabled,
      check_interval_sec: config.check_interval_sec,
      lateral_tolerance_pct: config.lateral_tolerance_pct.toNumber(),
      lateral_cycles_min: config.lateral_cycles_min,
      rise_trigger_pct: config.rise_trigger_pct.toNumber(),
      rise_cycles_min: config.rise_cycles_min,
      max_fall_pct: config.max_fall_pct.toNumber(),
      max_monitoring_time_min: config.max_monitoring_time_min,
      cooldown_after_execution_min: config.cooldown_after_execution_min,
    };
  }
}

