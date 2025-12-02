import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { TradeMode } from '@mvcashnode/shared';

export class CreateVaultDto {
  @ApiProperty({ example: 'Cofre Principal' })
  @IsString()
  name: string;

  @ApiProperty({ required: false, example: 'Cofre para trading real' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TradeMode, example: TradeMode.REAL })
  @IsEnum(TradeMode)
  tradeMode: TradeMode;
}

