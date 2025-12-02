import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ExchangeType } from '@mvcashnode/shared';

export class CreateExchangeAccountDto {
  @ApiProperty({ enum: ExchangeType, example: ExchangeType.BINANCE_SPOT })
  @IsEnum(ExchangeType)
  exchange: ExchangeType;

  @ApiProperty({ example: 'Minha Conta Binance' })
  @IsString()
  label: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isSimulation: boolean;

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

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  testnet?: boolean;

  @ApiProperty({ required: false, example: { USDT: 1000 } })
  @IsOptional()
  @IsObject()
  initialBalances?: Record<string, number>;
}

