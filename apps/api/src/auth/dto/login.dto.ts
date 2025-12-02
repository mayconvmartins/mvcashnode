import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecureP@ssw0rd' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ required: false, example: '123456' })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}

