import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class SellLimitDto {
  @ApiProperty({ example: 220.50 })
  @IsNumber()
  @Min(0)
  limitPrice: number;

  @ApiProperty({ required: false, example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiProperty({ required: false, example: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(720)
  expiresInHours?: number;
}

