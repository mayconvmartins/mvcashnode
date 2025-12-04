import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123def456...' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewSecureP@ssw0rd' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

