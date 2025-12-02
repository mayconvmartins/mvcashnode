import { ApiProperty } from '@nestjs/swagger';

export class Setup2FAResponseDto {
  @ApiProperty()
  secret: string;

  @ApiProperty()
  qrCodeUrl: string;
}

