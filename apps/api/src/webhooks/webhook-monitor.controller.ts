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
    // Converter Decimal para número e garantir que todos os campos sejam retornados
    return alerts.map((alert: any) => ({
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

    // ✅ BUG-ALTO-010 FIX: Validação de limites min/max para limit
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        filters.limit = Math.min(1000, Math.max(1, limitNum));
      }
    }

    try {
      const history = await this.monitorService.listHistory(filters);
      // Converter Decimal para número e incluir campos de métricas se existirem
      return history.map((alert: any) => ({
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
    @Body() body: any,
    @CurrentUser() user: any
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
    
    console.log('[WEBHOOK-MONITOR] Atualizando configurações:', JSON.stringify(parsedBody, null, 2));
    // Buscar ou criar configuração do usuário
    let config = await this.prisma.webhookMonitorConfig.findUnique({
      where: { user_id: user.userId },
    });

    // Usar parsedBody em vez de body
    const configData = parsedBody;
    
    if (!config) {
      // Criar configuração do usuário
      // Buscar configuração global para usar como base
      const globalConfig = await this.prisma.webhookMonitorConfig.findFirst({
        where: { user_id: null },
      });
      
      config = await this.prisma.webhookMonitorConfig.create({
        data: {
          user_id: user.userId,
          monitor_enabled: configData.monitor_enabled ?? globalConfig?.monitor_enabled ?? true,
          check_interval_sec: configData.check_interval_sec ?? globalConfig?.check_interval_sec ?? 30,
          // BUY
          lateral_tolerance_pct: configData.lateral_tolerance_pct ?? globalConfig?.lateral_tolerance_pct ?? 0.3,
          lateral_cycles_min: configData.lateral_cycles_min ?? globalConfig?.lateral_cycles_min ?? 4,
          rise_trigger_pct: configData.rise_trigger_pct ?? globalConfig?.rise_trigger_pct ?? 0.75,
          rise_cycles_min: configData.rise_cycles_min ?? globalConfig?.rise_cycles_min ?? 2,
          max_fall_pct: configData.max_fall_pct ?? globalConfig?.max_fall_pct ?? 6.0,
          max_monitoring_time_min: configData.max_monitoring_time_min ?? globalConfig?.max_monitoring_time_min ?? 60,
          cooldown_after_execution_min: configData.cooldown_after_execution_min ?? globalConfig?.cooldown_after_execution_min ?? 30,
          // SELL
          sell_lateral_tolerance_pct: configData.sell_lateral_tolerance_pct ?? (globalConfig as any)?.sell_lateral_tolerance_pct ?? 0.3,
          sell_lateral_cycles_min: configData.sell_lateral_cycles_min ?? (globalConfig as any)?.sell_lateral_cycles_min ?? 4,
          sell_fall_trigger_pct: configData.sell_fall_trigger_pct ?? (globalConfig as any)?.sell_fall_trigger_pct ?? 0.5,
          sell_fall_cycles_min: configData.sell_fall_cycles_min ?? (globalConfig as any)?.sell_fall_cycles_min ?? 2,
          sell_max_rise_pct: configData.sell_max_rise_pct ?? (globalConfig as any)?.sell_max_rise_pct ?? 6.0,
          sell_max_monitoring_time_min: configData.sell_max_monitoring_time_min ?? (globalConfig as any)?.sell_max_monitoring_time_min ?? 60,
          sell_cooldown_after_execution_min: configData.sell_cooldown_after_execution_min ?? (globalConfig as any)?.sell_cooldown_after_execution_min ?? 30,
        },
      });
    } else {
      // Atualizar configuração existente
      // Construir objeto de atualização apenas com campos que foram enviados
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
      
      console.log('[WEBHOOK-MONITOR] Dados que serão atualizados:', JSON.stringify(updateData, null, 2));
      
      if (Object.keys(updateData).length === 0) {
        console.log('[WEBHOOK-MONITOR] Nenhum campo para atualizar!');
        // Buscar config atual para retornar
        config = await this.prisma.webhookMonitorConfig.findUnique({
          where: { user_id: user.userId },
        });
        if (!config) {
          throw new BadRequestException('Configuração não encontrada');
        }
      } else {
        config = await this.prisma.webhookMonitorConfig.update({
          where: { user_id: user.userId },
          data: updateData,
        });
        console.log('[WEBHOOK-MONITOR] Configuração atualizada com sucesso');
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
      sell_max_rise_pct: (config as any).sell_max_rise_pct?.toNumber() || 6.0,
      sell_max_monitoring_time_min: (config as any).sell_max_monitoring_time_min || 60,
      sell_cooldown_after_execution_min: (config as any).sell_cooldown_after_execution_min || 30,
    };
  }
}

