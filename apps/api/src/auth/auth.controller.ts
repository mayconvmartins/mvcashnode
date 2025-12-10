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
import { ChangePasswordRequiredDto } from './dto/change-password-required.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
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
          rememberMe: loginDto.rememberMe,
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

  @Post('change-password-required')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Alterar senha obrigatória',
    description: 'Altera a senha quando o usuário é obrigado a alterá-la antes de fazer login. Não requer autenticação, mas valida email e senha atual.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Senha alterada com sucesso',
    schema: {
      example: {
        message: 'Senha alterada com sucesso. Você pode fazer login agora.'
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Credenciais inválidas ou senha atual incorreta',
    schema: {
      example: {
        statusCode: 401,
        message: 'Email ou senha atual inválidos',
        error: 'Unauthorized'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Alteração de senha não é obrigatória para este usuário',
    schema: {
      example: {
        statusCode: 400,
        message: 'Alteração de senha não é obrigatória para este usuário',
        error: 'Bad Request'
      }
    }
  })
  async changePasswordRequired(@Body() dto: ChangePasswordRequiredDto) {
    try {
      await this.authService.getDomainAuthService().changePasswordRequired(
        dto.email,
        dto.currentPassword,
        dto.newPassword
      );

      return { 
        message: 'Senha alterada com sucesso. Você pode fazer login agora.' 
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao alterar senha';
      
      if (errorMessage.includes('Invalid credentials') || errorMessage.includes('credenciais')) {
        throw new UnauthorizedException('Email ou senha atual inválidos');
      }
      
      if (errorMessage.includes('not required')) {
        throw new BadRequestException('Alteração de senha não é obrigatória para este usuário');
      }
      
      throw new BadRequestException('Erro ao alterar senha');
    }
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentativas por minuto
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Solicitar reset de senha',
    description: 'Envia um email com link para redefinir a senha. O link expira em 1 hora.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Email de recuperação enviado com sucesso',
    schema: {
      example: {
        message: 'Se o email existir, um link de recuperação foi enviado'
      }
    }
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    try {
      const token = await this.authService.getDomainAuthService().generatePasswordResetToken(dto.email);
      
      // Sempre retornar sucesso para não revelar se o email existe
      if (token) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
        
        await this.authService.getEmailService().sendPasswordResetEmail(
          dto.email,
          token,
          resetUrl
        );
      }

      return { 
        message: 'Se o email existir, um link de recuperação foi enviado' 
      };
    } catch (error: any) {
      // Sempre retornar sucesso para não revelar se o email existe
      return { 
        message: 'Se o email existir, um link de recuperação foi enviado' 
      };
    }
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentativas por minuto
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Redefinir senha com token',
    description: 'Redefine a senha usando o token recebido por email. O token expira em 1 hora.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Senha redefinida com sucesso',
    schema: {
      example: {
        message: 'Senha redefinida com sucesso'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Token inválido ou expirado',
    schema: {
      example: {
        statusCode: 400,
        message: 'Token inválido ou expirado',
        error: 'Bad Request'
      }
    }
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    try {
      const userEmail = await this.authService.getDomainAuthService().resetPassword(
        dto.token,
        dto.newPassword
      );

      // Enviar email de confirmação
      if (userEmail) {
        try {
          await this.authService.getEmailService().sendPasswordResetConfirmationEmail(userEmail);
        } catch (emailError) {
          // Não falhar se o email falhar, apenas logar
          console.error('[AUTH] Erro ao enviar email de confirmação:', emailError);
        }
      }

      return { 
        message: 'Senha redefinida com sucesso' 
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao redefinir senha';
      
      if (errorMessage.includes('Invalid') || errorMessage.includes('expired') || errorMessage.includes('token')) {
        throw new BadRequestException('Token inválido ou expirado');
      }
      
      throw new BadRequestException('Erro ao redefinir senha');
    }
  }
}

