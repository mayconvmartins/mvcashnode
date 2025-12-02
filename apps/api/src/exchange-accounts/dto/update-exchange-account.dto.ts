import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsObject } from 'class-validator';

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
}

