import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, ValidateIf, Min, Matches } from 'class-validator';

export class CreateManualBuyDto {
  @ApiProperty({
    description: 'ID da conta de exchange',
    example: 1,
  })
  @IsNumber()
  exchange_account_id: number;

  @ApiProperty({
    description: 'Símbolo do par de trading',
    example: 'BTCUSDT',
  })
  @IsString()
  @Matches(/^[^/]+$/, { message: 'Símbolo não pode conter "/". Use o formato sem barra, ex: "LTCUSDT".' })
  symbol: string;

  @ApiProperty({
    description: 'Valor em USDT a ser investido (obrigatório para ordens MARKET)',
    example: 100.0,
  })
  @ValidateIf((o) => o.order_type === 'MARKET')
  @IsNumber()
  @Min(0.01)
  quote_amount?: number;

  @ApiProperty({
    enum: ['MARKET', 'LIMIT'],
    description: 'Tipo de ordem',
    example: 'MARKET',
  })
  @IsEnum(['MARKET', 'LIMIT'])
  order_type: 'MARKET' | 'LIMIT';

  @ApiProperty({
    required: false,
    description: 'Preço limite (obrigatório se order_type = LIMIT)',
    example: 50000.0,
  })
  @ValidateIf((o) => o.order_type === 'LIMIT')
  @IsNumber()
  @Min(0.00000001)
  limit_price?: number;
}

