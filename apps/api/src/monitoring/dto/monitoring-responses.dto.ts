import { ApiProperty } from '@nestjs/swagger';

export class ProcessMetricsDto {
  @ApiProperty({ example: 12345 })
  pid: number;

  @ApiProperty({ example: 'API' })
  name: string;

  @ApiProperty({ example: 25.5 })
  cpu: number;

  @ApiProperty({ example: 524288000 })
  memory: number;

  @ApiProperty({ example: 3600 })
  uptime: number;

  @ApiProperty({ enum: ['running', 'stopped', 'error'] })
  status: string;

  @ApiProperty()
  lastUpdate: Date;
}

export class SystemCpuDto {
  @ApiProperty({ example: 45.2 })
  usage: number;

  @ApiProperty({ example: 8 })
  cores: number;

  @ApiProperty({ example: 2.4 })
  speed: number;
}

export class SystemMemoryDto {
  @ApiProperty({ example: 17179869184 })
  total: number;

  @ApiProperty({ example: 8589934592 })
  used: number;

  @ApiProperty({ example: 8589934592 })
  free: number;

  @ApiProperty({ example: 50.0 })
  usagePercent: number;
}

export class SystemDiskDto {
  @ApiProperty({ example: 1000000000000 })
  total: number;

  @ApiProperty({ example: 500000000000 })
  used: number;

  @ApiProperty({ example: 500000000000 })
  free: number;

  @ApiProperty({ example: 50.0 })
  usagePercent: number;
}

export class SystemMetricsDto {
  @ApiProperty({ type: SystemCpuDto })
  cpu: SystemCpuDto;

  @ApiProperty({ type: SystemMemoryDto })
  memory: SystemMemoryDto;

  @ApiProperty({ type: SystemDiskDto })
  disk: SystemDiskDto;

  @ApiProperty({ example: 86400 })
  uptime: number;

  @ApiProperty()
  timestamp: Date;
}

export class ResourceHealthDto {
  @ApiProperty({ example: 'healthy' })
  status: string;

  @ApiProperty({ example: 10, required: false })
  responseTime?: number;
}

export class AlertCountsDto {
  @ApiProperty({ example: 2 })
  critical: number;

  @ApiProperty({ example: 5 })
  high: number;

  @ApiProperty({ example: 3 })
  medium: number;

  @ApiProperty({ example: 1 })
  low: number;
}

export class SystemStatusDto {
  @ApiProperty({
    description: 'Status dos serviços',
    type: 'object',
    properties: {
      api: { type: 'object', $ref: '#/components/schemas/ProcessMetricsDto' },
    },
  })
  services: {
    api: ProcessMetricsDto;
    executor?: ProcessMetricsDto;
    monitors?: ProcessMetricsDto;
  };

  @ApiProperty({
    description: 'Status dos recursos',
    type: 'object',
    properties: {
      database: { type: 'object', $ref: '#/components/schemas/ResourceHealthDto' },
      redis: { type: 'object', $ref: '#/components/schemas/ResourceHealthDto' },
    },
  })
  resources: {
    database: ResourceHealthDto;
    redis: ResourceHealthDto;
  };

  @ApiProperty({ type: SystemMetricsDto })
  system: SystemMetricsDto;

  @ApiProperty({ type: AlertCountsDto })
  alerts: AlertCountsDto;
}

export class JobStatisticsDto {
  @ApiProperty({ example: 1000 })
  totalRuns: number;

  @ApiProperty({ example: 950 })
  successCount: number;

  @ApiProperty({ example: 50 })
  failureCount: number;

  @ApiProperty({ example: 1250 })
  avgDuration: number;
}

export class JobExecutionDto {
  @ApiProperty()
  timestamp: Date;

  @ApiProperty({ example: 1250 })
  duration: number;

  @ApiProperty({ enum: ['success', 'failed'] })
  result: string;

  @ApiProperty({ required: false })
  data?: any;
}

export class JobMetricsDto {
  @ApiProperty({ example: 'sl-tp-monitor-real' })
  name: string;

  @ApiProperty({ example: 'Monitor de SL/TP para modo REAL' })
  description: string;

  @ApiProperty({ enum: ['active', 'paused', 'disabled'] })
  status: string;

  @ApiProperty({ type: JobExecutionDto, required: false })
  lastExecution?: JobExecutionDto;

  @ApiProperty({ required: false })
  nextExecution?: Date;

  @ApiProperty({ type: JobStatisticsDto })
  statistics: JobStatisticsDto;
}

export class SystemAlertDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'HIGH_CPU' })
  alert_type: string;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  severity: string;

  @ApiProperty({ example: 'CPU usage above 90%' })
  message: string;

  @ApiProperty({ example: 'API', required: false })
  service_name?: string;

  @ApiProperty({ required: false })
  metadata_json?: any;

  @ApiProperty()
  created_at: Date;

  @ApiProperty({ required: false })
  resolved_at?: Date;

  @ApiProperty({ example: 1, required: false })
  resolved_by?: number;
}

export class MonitoringLogDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty({ example: 'API' })
  service_name: string;

  @ApiProperty({ example: 12345, required: false })
  process_id?: number;

  @ApiProperty({ example: 'running' })
  status: string;

  @ApiProperty({ example: 25.5, required: false })
  cpu_usage?: number;

  @ApiProperty({ example: 524288000, required: false })
  memory_usage?: number;

  @ApiProperty({ required: false })
  metrics_json?: any;
}

