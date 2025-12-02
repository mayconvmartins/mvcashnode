import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ExchangeType, TradeMode } from '@mvcashnode/shared';

export class CreateExchangeAccountDto {
  @ApiProperty({ 
    enum: ExchangeType, 
    example: ExchangeType.BINANCE_SPOT,
    description: 'Tipo de exchange (BINANCE_SPOT, BYBIT_SPOT, etc.)'
  })
  @IsEnum(ExchangeType)
  exchange: ExchangeType;

  @ApiProperty({ 
    example: 'Minha Conta Binance',
    description: 'Nome/label da conta para identificação'
  })
  @IsString()
  label: string;

  @ApiProperty({ 
    example: false,
    description: 'Se true, cria conta de simulação. Se false, cria conta real.',
    deprecated: true
  })
  @IsOptional()
  @IsBoolean()
  isSimulation?: boolean;

  @ApiProperty({ 
    enum: TradeMode,
    example: TradeMode.REAL,
    description: 'Modo de trading: REAL ou SIMULATION. Se fornecido, sobrescreve isSimulation.',
    required: false
  })
  @IsOptional()
  @IsEnum(TradeMode)
  tradeMode?: TradeMode;

  @ApiProperty({ 
    required: false,
    description: 'API Key da exchange (obrigatória para contas reais)'
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({ 
    required: false,
    description: 'API Secret da exchange (obrigatória para contas reais)'
  })
  @IsOptional()
  @IsString()
  apiSecret?: string;

  @ApiProperty({ 
    required: false,
    description: 'URL do proxy (opcional)'
  })
  @IsOptional()
  @IsString()
  proxyUrl?: string;

  @ApiProperty({ 
    required: false, 
    example: false,
    description: 'Se true, usa testnet da exchange',
    deprecated: true
  })
  @IsOptional()
  @IsBoolean()
  testnet?: boolean;

  @ApiProperty({ 
    required: false, 
    example: false,
    description: 'Se true, usa testnet da exchange (alias para testnet)'
  })
  @IsOptional()
  @IsBoolean()
  isTestnet?: boolean;

  @ApiProperty({ 
    required: false, 
    example: true,
    description: 'Se true, conta fica ativa imediatamente após criação'
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ 
    required: false, 
    example: { USDT: 1000 },
    description: 'Saldos iniciais para contas de simulação'
  })
  @IsOptional()
  @IsObject()
  initialBalances?: Record<string, number>;
}

