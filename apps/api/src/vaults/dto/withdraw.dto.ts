import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, Min } from 'class-validator';

export class WithdrawDto {
  @ApiProperty({ example: 'USDT' })
  @IsString()
  asset: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  amount: number;
}

