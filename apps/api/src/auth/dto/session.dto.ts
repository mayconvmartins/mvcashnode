import { ApiProperty } from '@nestjs/swagger';

export class SessionInfoDto {
  @ApiProperty({ description: 'ID da sessão' })
  id: number;

  @ApiProperty({ description: 'Nome do dispositivo', nullable: true })
  deviceName: string | null;

  @ApiProperty({ description: 'Tipo do dispositivo', nullable: true })
  deviceType: string | null;

  @ApiProperty({ description: 'Browser', nullable: true })
  browser: string | null;

  @ApiProperty({ description: 'Sistema operacional', nullable: true })
  os: string | null;

  @ApiProperty({ description: 'Endereço IP', nullable: true })
  ipAddress: string | null;

  @ApiProperty({ description: 'Se foi autenticado via Passkey' })
  isPasskeyAuth: boolean;

  @ApiProperty({ description: 'Última atividade' })
  lastActivityAt: Date;

  @ApiProperty({ description: 'Data de criação' })
  createdAt: Date;

  @ApiProperty({ description: 'Se é a sessão atual' })
  isCurrent: boolean;
}

