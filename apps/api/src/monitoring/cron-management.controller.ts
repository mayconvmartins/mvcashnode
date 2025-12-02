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
    summary: 'Listar todos os jobs agendados',
    description: 'Retorna lista completa de jobs com estatísticas e status',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jobs retornada com sucesso',
    type: [CronJobConfigDto],
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
    description: 'Dispara a execução imediata de um job fora do agendamento',
  })
  @ApiParam({
    name: 'name',
    description: 'Nome do job',
    example: 'sl-tp-monitor-real',
  })
  @ApiResponse({
    status: 200,
    description: 'Job disparado para execução manual',
    type: ManualExecutionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado',
  })
  async executeJobManually(@Param('name') name: string): Promise<any> {
    return this.cronService.executeJobManually(name);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Histórico de execuções',
    description: 'Retorna histórico de execuções de todos os jobs ou de um job específico',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Filtrar por nome do job',
    example: 'sl-tp-monitor-real',
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

