import { ApiProperty } from '@nestjs/swagger';

export class Setup2FAResponseDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXP', description: 'Secret key para configuração manual' })
  secret: string;

  @ApiProperty({ 
    example: 'otpauth://totp/Trading%20Automation:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Trading%20Automation',
    description: 'String otpauth para gerar QR code no frontend'
  })
  qrCode: string;

  @ApiProperty({ 
    example: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=...',
    description: 'URL do QR code (fallback)',
    required: false
  })
  qrCodeUrl?: string;

  @ApiProperty({ 
    example: [],
    description: 'Códigos de backup (se aplicável)',
    required: false
  })
  backupCodes?: string[];
}

