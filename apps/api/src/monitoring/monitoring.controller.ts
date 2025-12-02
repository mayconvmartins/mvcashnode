import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import {
  SystemStatusDto,
  ProcessMetricsDto,
  JobMetricsDto,
  SystemAlertDto,
  MonitoringLogDto,
} from './dto/monitoring-responses.dto';

@ApiTags('Monitoring')
@ApiBearerAuth()
@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // Apenas admins podem acessar monitoramento
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Status geral do sistema',
    description: 'Retorna status de todos os serviços, recursos e métricas do sistema',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do sistema retornado com sucesso',
    type: SystemStatusDto,
  })
  async getStatus() {
    return this.monitoringService.getSystemStatus();
  }

  @Get('processes')
  @ApiOperation({
    summary: 'Métricas de todos os processos',
    description: 'Lista todos os processos do sistema com CPU, memória e status',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de processos retornada com sucesso',
    type: [ProcessMetricsDto],
  })
  async getProcesses() {
    return this.monitoringService.getAllProcessMetrics();
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'Métricas de jobs BullMQ',
    description: 'Lista todos os jobs agendados com estatísticas de execução',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jobs retornada com sucesso',
    type: [JobMetricsDto],
  })
  async getJobs() {
    return this.monitoringService.getJobsMetrics();
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Alertas ativos',
    description: 'Lista todos os alertas não resolvidos ordenados por severidade',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de alertas retornada com sucesso',
    type: [SystemAlertDto],
  })
  async getAlerts(): Promise<any[]> {
    return this.monitoringService.getActiveAlerts();
  }

  @Post('alerts/:id/resolve')
  @ApiOperation({
    summary: 'Resolver um alerta',
    description: 'Marca um alerta como resolvido',
  })
  @ApiParam({
    name: 'id',
    description: 'ID do alerta',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Alerta resolvido com sucesso',
    type: SystemAlertDto,
  })
  async resolveAlert(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.monitoringService.resolveAlert(id);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Histórico de monitoramento',
    description: 'Retorna histórico de logs de monitoramento com filtros opcionais',
  })
  @ApiQuery({
    name: 'service',
    required: false,
    description: 'Filtrar por nome do serviço (API, EXECUTOR, MONITORS)',
    type: String,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Limitar quantidade de resultados (padrão: 100)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Histórico retornado com sucesso',
    type: [MonitoringLogDto],
  })
  async getHistory(
    @Query('service') service?: string,
    @Query('limit') limit?: string
  ): Promise<any[]> {
    const limitNum = limit ? parseInt(limit) : 100;
    return this.monitoringService.getMonitoringHistory(service, limitNum);
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Métricas agregadas',
    description: 'Retorna métricas históricas agrupadas por serviço para gráficos',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Quantidade de horas para buscar (padrão: 24)',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas agregadas retornadas com sucesso',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            cpu: { type: 'number' },
            memory: { type: 'number' },
          },
        },
      },
    },
  })
  async getMetrics(@Query('hours') hours?: string) {
    const hoursNum = hours ? parseInt(hours) : 24;
    return this.monitoringService.getAggregatedMetrics(hoursNum);
  }
}

