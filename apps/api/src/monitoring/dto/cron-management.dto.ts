import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsBoolean, IsOptional, IsEnum, Min } from 'class-validator';

export enum CronJobStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
}

export enum CronExecutionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  RUNNING = 'RUNNING',
}

export class CronJobConfigDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'sl-tp-monitor-real' })
  name: string;

  @ApiProperty({ example: 'Monitor de SL/TP para modo REAL' })
  description: string;

  @ApiProperty({ example: 'sl-tp-monitor-real' })
  queue_name: string;

  @ApiProperty({ example: 'sl-tp-monitor-real-repeat' })
  job_id: string;

  @ApiProperty({ example: 30000, description: 'Intervalo em milissegundos' })
  interval_ms: number;

  @ApiProperty({ enum: CronJobStatus, example: CronJobStatus.ACTIVE })
  status: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiPropertyOptional({ example: 60000, description: 'Timeout em milissegundos' })
  timeout_ms?: number;

  @ApiProperty({ example: 3 })
  max_retries: number;

  @ApiPropertyOptional({ example: {} })
  config_json?: any;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiPropertyOptional({ example: 1 })
  updated_by?: number;

  @ApiPropertyOptional({ description: 'Estatísticas de execução' })
  statistics?: {
    total_runs: number;
    success_count: number;
    failure_count: number;
    avg_duration_ms: number;
  };

  @ApiPropertyOptional({ description: 'Última execução' })
  last_execution?: {
    started_at: Date;
    duration_ms: number;
    status: string;
    result_json?: any;
  };

  @ApiPropertyOptional({ description: 'Próxima execução estimada' })
  next_execution?: Date;
}

export class CreateCronJobDto {
  @ApiProperty({ example: 'custom-monitor' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Monitor personalizado' })
  @IsString()
  description: string;

  @ApiProperty({ example: 'custom-monitor' })
  @IsString()
  queue_name: string;

  @ApiProperty({ example: 'custom-monitor-repeat' })
  @IsString()
  job_id: string;

  @ApiProperty({ example: 60000 })
  @IsInt()
  @Min(1000)
  interval_ms: number;

  @ApiPropertyOptional({ example: 60000 })
  @IsOptional()
  @IsInt()
  timeout_ms?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  max_retries?: number;

  @ApiPropertyOptional({ example: {} })
  @IsOptional()
  config_json?: any;
}

export class UpdateCronJobDto {
  @ApiPropertyOptional({ example: 'Monitor personalizado atualizado' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  interval_ms?: number;

  @ApiPropertyOptional({ enum: CronJobStatus })
  @IsOptional()
  @IsEnum(CronJobStatus)
  status?: CronJobStatus;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 60000 })
  @IsOptional()
  @IsInt()
  timeout_ms?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  max_retries?: number;

  @ApiPropertyOptional({ example: {} })
  @IsOptional()
  config_json?: any;
}

export class CronJobExecutionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  job_config_id: number;

  @ApiProperty()
  started_at: Date;

  @ApiPropertyOptional()
  finished_at?: Date;

  @ApiPropertyOptional({ example: 1250 })
  duration_ms?: number;

  @ApiProperty({ enum: CronExecutionStatus })
  status: string;

  @ApiPropertyOptional({ example: { positions_checked: 45 } })
  result_json?: any;

  @ApiPropertyOptional()
  error_message?: string;

  @ApiProperty({ example: 'SCHEDULED' })
  triggered_by: string;
}

export class CronJobHistoryDto {
  @ApiProperty()
  job: CronJobConfigDto;

  @ApiProperty({ type: [CronJobExecutionDto] })
  executions: CronJobExecutionDto[];

  @ApiProperty()
  statistics: {
    total_runs: number;
    success_count: number;
    failure_count: number;
    avg_duration_ms: number;
    success_rate: number;
  };
}

export class ManualExecutionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Job executado manualmente com sucesso' })
  message: string;

  @ApiProperty()
  execution: CronJobExecutionDto;
}

