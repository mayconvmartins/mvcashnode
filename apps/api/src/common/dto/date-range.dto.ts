import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class DateRangeDto {
  @ApiProperty({ required: false, example: '2025-11-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, example: '2025-12-01T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

