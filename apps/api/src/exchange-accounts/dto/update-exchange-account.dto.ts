import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsObject, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateExchangeAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiSecret?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  proxyUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  testnet?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  initialBalances?: Record<string, number>;

  @ApiProperty({ required: false, description: 'Taxa para compra limit (ex: 0.001 = 0.1%)', type: 'number' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  feeRateBuyLimit?: number;

  @ApiProperty({ required: false, description: 'Taxa para compra market (ex: 0.001 = 0.1%)', type: 'number' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  feeRateBuyMarket?: number;

  @ApiProperty({ required: false, description: 'Taxa para venda limit (ex: 0.001 = 0.1%)', type: 'number' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  feeRateSellLimit?: number;

  @ApiProperty({ required: false, description: 'Taxa para venda market (ex: 0.001 = 0.1%)', type: 'number' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  feeRateSellMarket?: number;
}

