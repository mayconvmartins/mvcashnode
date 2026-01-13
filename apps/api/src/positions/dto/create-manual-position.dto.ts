import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, IsOptional, IsDateString, ValidateIf, Min, Matches } from 'class-validator';

export enum CreateManualPositionMethod {
  EXCHANGE_ORDER = 'EXCHANGE_ORDER',
  MANUAL = 'MANUAL',
}

export class CreateManualPositionDto {
  @ApiProperty({
    enum: CreateManualPositionMethod,
    description: 'Método de criação: buscar na exchange ou inserir manualmente',
    example: CreateManualPositionMethod.EXCHANGE_ORDER,
  })
  @IsEnum(CreateManualPositionMethod)
  method: CreateManualPositionMethod;

  @ApiProperty({
    description: 'ID da conta de exchange',
    example: 1,
  })
  @IsNumber()
  exchange_account_id: number;

  @ApiProperty({
    required: false,
    enum: ['BUY', 'SELL'],
    description: 'Tipo de ordem: BUY (cria nova posição) ou SELL (vincula a posição existente)',
    example: 'BUY',
    default: 'BUY',
  })
  @IsOptional()
  @IsEnum(['BUY', 'SELL'])
  side?: 'BUY' | 'SELL';

  @ApiProperty({
    required: false,
    description: 'ID da posição existente (obrigatório se side = SELL)',
    example: 123,
  })
  @ValidateIf((o) => o.side === 'SELL')
  @IsNumber()
  position_id?: number;

  // Campos para EXCHANGE_ORDER
  @ApiProperty({
    required: false,
    description: 'Número da ordem na exchange (obrigatório se method = EXCHANGE_ORDER)',
    example: '12345678',
  })
  @ValidateIf((o) => o.method === CreateManualPositionMethod.EXCHANGE_ORDER)
  @IsString()
  exchange_order_id?: string;

  @ApiProperty({
    required: false,
    description: 'Símbolo do par de trading (obrigatório se method = EXCHANGE_ORDER)',
    example: 'BTCUSDT',
  })
  @ValidateIf((o) => o.method === CreateManualPositionMethod.EXCHANGE_ORDER)
  @IsString()
  @Matches(/^[^/]+$/, { message: 'Símbolo não pode conter "/". Use o formato sem barra, ex: "LTCUSDT".' })
  symbol?: string;

  // Campos para MANUAL
  @ApiProperty({
    required: false,
    description: 'Símbolo do par de trading (obrigatório se method = MANUAL)',
    example: 'BTCUSDT',
  })
  @ValidateIf((o) => o.method === CreateManualPositionMethod.MANUAL)
  @IsString()
  @Matches(/^[^/]+$/, { message: 'Símbolo não pode conter "/". Use o formato sem barra, ex: "LTCUSDT".' })
  manual_symbol?: string;

  @ApiProperty({
    required: false,
    description: 'Quantidade total (obrigatório se method = MANUAL)',
    example: 0.001,
  })
  @ValidateIf((o) => o.method === CreateManualPositionMethod.MANUAL)
  @IsNumber()
  @Min(0.00000001)
  qty_total?: number;

  @ApiProperty({
    required: false,
    description: 'Preço de abertura (obrigatório se method = MANUAL)',
    example: 50000.0,
  })
  @ValidateIf((o) => o.method === CreateManualPositionMethod.MANUAL)
  @IsNumber()
  @Min(0.00000001)
  price_open?: number;

  @ApiProperty({
    required: false,
    enum: ['REAL', 'SIMULATION'],
    description: 'Modo de trading (obrigatório se method = MANUAL)',
    example: 'REAL',
  })
  @ValidateIf((o) => o.method === CreateManualPositionMethod.MANUAL)
  @IsEnum(['REAL', 'SIMULATION'])
  trade_mode?: 'REAL' | 'SIMULATION';

  @ApiProperty({
    required: false,
    description: 'Número da ordem na exchange (opcional, para referência)',
    example: '12345678',
  })
  @IsOptional()
  @IsString()
  manual_exchange_order_id?: string;

  @ApiProperty({
    required: false,
    description: 'Data de criação da posição (opcional, para posições antigas)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  created_at?: string;
}

