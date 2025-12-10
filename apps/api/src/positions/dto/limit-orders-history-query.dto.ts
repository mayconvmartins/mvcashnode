import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class LimitOrdersHistoryQueryDto {
  @ApiProperty({
    required: false,
    type: String,
    description: 'Data inicial para filtrar histórico (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({
    required: false,
    type: String,
    description: 'Data final para filtrar histórico (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z',
  })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiProperty({
    required: false,
    type: String,
    description: 'Filtrar por símbolo do par de trading',
    example: 'SOLUSDT',
  })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiProperty({
    required: false,
    enum: ['FILLED', 'CANCELED', 'EXPIRED'],
    description: 'Filtrar por status final da ordem',
    example: 'FILLED',
  })
  @IsOptional()
  @IsEnum(['FILLED', 'CANCELED', 'EXPIRED'])
  status?: string;

  @ApiProperty({
    required: false,
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading',
    example: 'REAL',
  })
  @IsOptional()
  @IsEnum(['REAL', 'SIMULATION'])
  trade_mode?: string;
}

