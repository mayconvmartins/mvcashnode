import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsEmail } from 'class-validator';

export class PasskeyRegisterStartDto {
  @ApiPropertyOptional({ description: 'Nome do dispositivo (opcional)' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class PasskeyRegisterFinishDto {
  @ApiProperty({ description: 'Resposta da WebAuthn API' })
  @IsObject()
  response: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
      transports?: string[];
    };
    type: string;
    clientExtensionResults: any;
    authenticatorAttachment?: string;
  };

  @ApiPropertyOptional({ description: 'Nome do dispositivo' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class PasskeyAuthenticateStartDto {
  @ApiPropertyOptional({ description: 'Email do usuário (opcional - para listar passkeys disponíveis)' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PasskeyAuthenticateFinishDto {
  @ApiProperty({ description: 'Resposta da WebAuthn API' })
  @IsObject()
  response: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    type: string;
    clientExtensionResults: any;
    authenticatorAttachment?: string;
  };

  @ApiPropertyOptional({ description: 'Email do usuário (opcional)' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Lembrar de mim' })
  @IsOptional()
  rememberMe?: boolean;
}

export class PasskeyCheckEmailDto {
  @ApiProperty({ description: 'Email do usuário' })
  @IsEmail()
  email: string;
}

export class UpdatePasskeyNameDto {
  @ApiProperty({ description: 'Novo nome do dispositivo' })
  @IsString()
  deviceName: string;
}

