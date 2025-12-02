import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { OrderType } from '@mvcashnode/shared';

export class ClosePositionDto {
  @ApiProperty({ required: false, example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiProperty({ required: false, enum: OrderType, example: OrderType.MARKET })
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ApiProperty({ required: false, example: 216.00 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  limitPrice?: number;
}

