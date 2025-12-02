import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { OrderType } from '@mvcashnode/shared';

export class ClosePositionDto {
  @ApiProperty({ required: false, example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiProperty({ required: false, enum: [OrderType.MARKET, OrderType.LIMIT], example: OrderType.MARKET, description: 'Apenas MARKET ou LIMIT são permitidos para fechamento de posição' })
  @IsOptional()
  @IsEnum([OrderType.MARKET, OrderType.LIMIT])
  orderType?: OrderType.MARKET | OrderType.LIMIT;

  @ApiProperty({ required: false, example: 216.00 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  limitPrice?: number;
}

