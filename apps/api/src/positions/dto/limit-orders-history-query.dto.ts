import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiProperty({
    required: false,
    type: Number,
    description: 'Número da página (padrão: 1)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    required: false,
    type: Number,
    description: 'Itens por página (padrão: 50, máximo: 200)',
    example: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

