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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CronManagementService } from './cron-management.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import {
  CronJobConfigDto,
  CreateCronJobDto,
  UpdateCronJobDto,
  CronJobHistoryDto,
  ManualExecutionResponseDto,
  CronJobExecutionDto,
} from './dto/cron-management.dto';

@ApiTags('Cron Management')
@ApiBearerAuth()
@Controller('monitoring/cron')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CronManagementController {
  constructor(private readonly cronService: CronManagementService) {}

  @Get('jobs')
  @ApiOperation({
    summary: 'Listar todos os jobs agendados (cron jobs)',
    description: `Retorna lista completa de jobs agendados do sistema com estatísticas e status. Jobs agendados são tarefas que executam periodicamente (ex: monitor SL/TP a cada 30s, sincronização de saldos a cada 5min).

**Jobs padrão do sistema:**
- \`sl-tp-monitor-real\`: Monitor de Stop Loss/Take Profit modo REAL (a cada 30s)
- \`sl-tp-monitor-sim\`: Monitor de Stop Loss/Take Profit modo SIMULAÇÃO (a cada 30s)
- \`limit-orders-monitor-real\`: Monitor de ordens LIMIT modo REAL (a cada 60s)
- \`limit-orders-monitor-sim\`: Monitor de ordens LIMIT modo SIMULAÇÃO (a cada 60s)
- \`balances-sync-real\`: Sincronização de saldos (a cada 5min)
- \`system-monitor\`: Monitor de sistema e alertas (a cada 30s)
- \`positions-sync-missing\`: Sincronização de posições faltantes (a cada 5min)
- \`price-sync\`: Sincronização de preços das exchanges para cache (a cada 22s)
- \`positions-params-fix\`: Correção de parâmetros faltantes em posições recentes (a cada 1min)
- \`dust-positions-monitor\`: Identificação e conversão automática de posições resíduo (a cada 5min)`,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jobs agendados retornada com sucesso',
    type: [CronJobConfigDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'sl-tp-monitor-real' },
          description: { type: 'string', example: 'Monitor SL/TP modo REAL' },
          cron_expression: { type: 'string', example: '*/30 * * * * *', description: 'Expressão cron (segundo minuto hora dia mês dia-semana)' },
          is_active: { type: 'boolean', example: true },
          is_paused: { type: 'boolean', example: false },
          timeout_ms: { type: 'number', example: 30000 },
          last_execution: {
            type: 'object',
            nullable: true,
            properties: {
              timestamp: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
              status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'RUNNING'], example: 'SUCCESS' },
              duration_ms: { type: 'number', example: 1500 },
            },
          },
          next_execution: { type: 'string', nullable: true, format: 'date-time', example: '2025-02-12T10:30:30.000Z' },
          statistics: {
            type: 'object',
            properties: {
              total_runs: { type: 'number', example: 1000 },
              success_count: { type: 'number', example: 995 },
              failure_count: { type: 'number', example: 5 },
              avg_duration_ms: { type: 'number', example: 1200 },
            },
          },
        },
      },
    },
  })
  async getAllJobs(): Promise<any[]> {
    return this.cronService.getAllJobs();
  }

  @Get('jobs/:name')
  @ApiOperation({
    summary: 'Detalhes de um job específico',
    description: 'Retorna informações detalhadas incluindo histórico de execuções',
  })
  @ApiParam({
    name: 'name',
    description: 'Nome do job',
    example: 'sl-tp-monitor-real',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes do job retornados com sucesso',
    type: CronJobHistoryDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado',
  })
  async getJobByName(@Param('name') name: string): Promise<any> {
    return this.cronService.getJobByName(name);
  }

  @Post('jobs')
  @ApiOperation({
    summary: 'Criar novo job agendado',
    description: 'Cria um novo job cron no sistema',
  })
  @ApiResponse({
    status: 201,
    description: 'Job criado com sucesso',
    type: CronJobConfigDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Job já existe ou dados inválidos',
  })
  async createJob(@Body() dto: CreateCronJobDto): Promise<any> {
    return this.cronService.createJob(dto);
  }

  @Put('jobs/:name')
  @ApiOperation({
    summary: 'Atualizar configuração de um job',
    description: 'Permite alterar intervalo, status, timeout e outras configurações',
  })
  @ApiParam({
    name: 'name',
    description: 'Nome do job',
    example: 'sl-tp-monitor-real',
  })
  @ApiResponse({
    status: 200,
    description: 'Job atualizado com sucesso',
    type: CronJobConfigDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado',
  })
  async updateJob(
    @Param('name') name: string,
    @Body() dto: UpdateCronJobDto,
  ): Promise<any> {
    return this.cronService.updateJob(name, dto);
  }

  @Post('jobs/:name/pause')
  @ApiOperation({
    summary: 'Pausar um job',
    description: 'Pausa temporariamente a execução de um job',
  })
  @ApiParam({
    name: 'name',
    description: 'Nome do job',
    example: 'sl-tp-monitor-real',
  })
  @ApiResponse({
    status: 200,
    description: 'Job pausado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado',
  })
  async pauseJob(@Param('name') name: string): Promise<any> {
    return this.cronService.pauseJob(name);
  }

  @Post('jobs/:name/resume')
  @ApiOperation({
    summary: 'Retomar um job pausado',
    description: 'Retoma a execução de um job que estava pausado',
  })
  @ApiParam({
    name: 'name',
    description: 'Nome do job',
    example: 'sl-tp-monitor-real',
  })
  @ApiResponse({
    status: 200,
    description: 'Job retomado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado',
  })
  async resumeJob(@Param('name') name: string): Promise<any> {
    return this.cronService.resumeJob(name);
  }

  @Post('jobs/:name/execute')
  @ApiOperation({
    summary: 'Executar job manualmente',
    description: `Dispara a execução imediata de um job agendado fora do cronograma normal. Útil para testes, debug ou execução sob demanda.

**Nota:** A execução manual não afeta o agendamento normal do job. O próximo agendamento continuará normalmente.`,
  })
  @ApiParam({
    name: 'name',
    description: 'Nome do job a ser executado',
    example: 'sl-tp-monitor-real',
  })
  @ApiResponse({
    status: 200,
    description: 'Job disparado para execução manual com sucesso',
    type: ManualExecutionResponseDto,
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Job disparado para execução manual' },
        job_name: { type: 'string', example: 'sl-tp-monitor-real' },
        execution_id: { type: 'number', example: 123, description: 'ID da execução criada' },
        timestamp: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Job não encontrado',
        error: 'Not Found',
      },
    },
  })
  async executeJobManually(@Param('name') name: string): Promise<any> {
    return this.cronService.executeJobManually(name);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Histórico de execuções de cron jobs',
    description: 'Retorna histórico completo de execuções de jobs agendados, incluindo sucessos, falhas, durações e resultados. Permite análise de performance e debug de problemas.',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Filtrar por nome do job específico',
    example: 'sl-tp-monitor-real',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Limitar quantidade de resultados retornados (padrão: 100, máximo recomendado: 1000)',
    type: Number,
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Histórico de execuções retornado com sucesso',
    type: [CronJobExecutionDto],
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          job_name: { type: 'string', example: 'sl-tp-monitor-real' },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'RUNNING'], example: 'SUCCESS' },
          duration_ms: { type: 'number', example: 1500 },
          error_message: { type: 'string', nullable: true, example: null },
          result_json: { type: 'object', nullable: true, example: { positions_checked: 5 } },
          created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Histórico retornado com sucesso',
    type: [CronJobExecutionDto],
  })
  async getExecutionHistory(
    @Query('name') name?: string,
    @Query('limit') limit?: string,
  ): Promise<any[]> {
    const limitNum = limit ? parseInt(limit) : 100;
    return this.cronService.getExecutionHistory(name, limitNum);
  }

  @Post('initialize')
  @ApiOperation({
    summary: 'Inicializar jobs padrão',
    description: 'Cria as configurações padrão dos jobs no banco de dados',
  })
  @ApiResponse({
    status: 200,
    description: 'Jobs inicializados com sucesso',
  })
  async initializeJobs(): Promise<any> {
    await this.cronService.initializeDefaultJobs();
    return { message: 'Jobs inicializados com sucesso' };
  }
}

