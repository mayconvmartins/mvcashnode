import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, Min } from 'class-validator';

export class DepositDto {
  @ApiProperty({ example: 'USDT' })
  @IsString()
  asset: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  amount: number;
}

