import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateSLTPDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  slEnabled?: boolean;

  @ApiProperty({ required: false, example: 2.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  slPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  tpEnabled?: boolean;

  @ApiProperty({ required: false, example: 5.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tpPct?: number;

  @ApiProperty({ required: false, description: 'Ativar Stop Gain (saída antecipada do TP)' })
  @IsOptional()
  @IsBoolean()
  sgEnabled?: boolean;

  @ApiProperty({ required: false, example: 2.0, description: 'Porcentagem de Stop Gain (deve ser menor que TP)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sgPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  trailingEnabled?: boolean;

  @ApiProperty({ required: false, example: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  trailingDistancePct?: number;
}

