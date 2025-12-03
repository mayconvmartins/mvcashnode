import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Setup2FAResponseDto } from './dto/setup-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentativas por minuto
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Autenticação de usuário',
    description: 'Realiza login do usuário e retorna tokens de acesso e refresh. Se o usuário tiver 2FA habilitado, o campo twoFactorCode é obrigatório.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Login bem-sucedido',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 1,
          email: 'admin@example.com',
          roles: ['admin']
        }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Credenciais inválidas ou código 2FA incorreto',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid credentials',
        error: 'Unauthorized'
      }
    }
  })
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    try {
      const result = await this.authService.getDomainAuthService().login(
        {
          email: loginDto.email,
          password: loginDto.password,
          twoFactorCode: loginDto.twoFactorCode,
        },
        ip,
        userAgent
      );

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao realizar login';
      
      if (errorMessage.includes('Invalid credentials') || errorMessage.includes('credenciais')) {
        throw new UnauthorizedException('Email ou senha inválidos');
      }
      
      if (errorMessage.includes('2FA') || errorMessage.includes('two factor')) {
        throw new UnauthorizedException('Código 2FA inválido');
      }
      
      if (errorMessage.includes('Password change required') || errorMessage.includes('senha')) {
        throw new UnauthorizedException('É necessário alterar a senha antes de fazer login');
      }
      
      throw new UnauthorizedException('Erro ao realizar autenticação');
    }
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 renovações por minuto
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Renovar access token',
    description: 'Renova o token de acesso usando o refresh token. O refresh token deve ser válido e não expirado.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Token renovado com sucesso',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Refresh token inválido ou expirado',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid refresh token',
        error: 'Unauthorized'
      }
    }
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    try {
      const result = await this.authService
        .getDomainAuthService()
        .refreshToken(refreshTokenDto.refreshToken);

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao renovar token';
      
      if (errorMessage.includes('Invalid') || errorMessage.includes('expired') || errorMessage.includes('token')) {
        throw new UnauthorizedException('Refresh token inválido ou expirado');
      }
      
      if (errorMessage.includes('User not found') || errorMessage.includes('inactive')) {
        throw new UnauthorizedException('Usuário não encontrado ou inativo');
      }
      
      throw new UnauthorizedException('Erro ao renovar token de acesso');
    }
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Configurar autenticação de dois fatores (2FA)',
    description: 'Gera um QR code e secret para configurar 2FA no aplicativo autenticador do usuário. O usuário deve escanear o QR code e depois verificar com o endpoint /auth/2fa/verify.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '2FA configurado com sucesso',
    type: Setup2FAResponseDto,
    schema: {
      example: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: 'otpauth://totp/Trading%20Automation:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Trading%20Automation',
        qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=...',
        backupCodes: []
      }
    }
  })
  async setup2FA(@Request() req: any) {
    try {
      const userId = req.user.userId;
      const result = await this.authService.getDomainAuthService().setup2FA(userId);
      return result;
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao configurar 2FA';
      
      if (errorMessage.includes('User not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Usuário não encontrado');
      }
      
      throw new BadRequestException('Erro ao configurar autenticação de dois fatores');
    }
  }

  @Post('2fa/verify')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 tentativas por minuto
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Verificar código 2FA',
    description: 'Verifica o código TOTP gerado pelo aplicativo autenticador. Deve ser chamado após /auth/2fa/setup para ativar o 2FA.'
  })
  @ApiResponse({ 
    status: 200, 
    description: '2FA verificado e ativado com sucesso',
    schema: {
      example: {
        valid: true,
        message: '2FA ativado com sucesso'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Código 2FA inválido',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid 2FA token',
        error: 'Bad Request'
      }
    }
  })
  async verify2FA(@Request() req: any, @Body() verifyDto: Verify2FADto) {
    try {
      const userId = req.user.userId;
      const isValid = await this.authService
        .getDomainAuthService()
        .verify2FA(userId, verifyDto.token);

      if (!isValid) {
        throw new BadRequestException('Código 2FA inválido');
      }

      return { valid: true, message: '2FA verificado e ativado com sucesso' };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao verificar 2FA';
      
      if (errorMessage.includes('2FA not set up') || errorMessage.includes('não configurado')) {
        throw new BadRequestException('2FA não está configurado para este usuário');
      }
      
      throw new BadRequestException('Código 2FA inválido');
    }
  }
}

