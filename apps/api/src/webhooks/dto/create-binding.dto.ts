import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsBoolean, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateBindingDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  exchangeAccountId: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, example: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;
}

