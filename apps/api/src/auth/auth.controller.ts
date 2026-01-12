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
  Get,
  Delete,
  Param,
  Put,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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
import {
  PasskeyRegisterStartDto,
  PasskeyRegisterFinishDto,
  PasskeyAuthenticateStartDto,
  PasskeyAuthenticateFinishDto,
  PasskeyCheckEmailDto,
  UpdatePasskeyNameDto,
} from './dto/passkey.dto';
import { AuditEntityType, AuditAction } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';
import { MvmPayService } from '../subscriptions/mvm-pay.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private prisma: PrismaService,
    private mvmPayService: MvmPayService,
  ) {}

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

      // MvM Pay (híbrido): se o usuário é subscriber, validar acesso no login
      const providerSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'subscription_provider' },
      });
      const provider = providerSetting?.value || 'native';
      const roles = (result as any)?.user?.roles || [];
      const isSubscriber = roles.some((r: string) => r === 'subscriber');

      if (provider === 'mvm_pay' && isSubscriber) {
        const access = await this.mvmPayService.authAccess(loginDto.email);
        const hasAccess = !!access?.data?.has_access;
        if (!hasAccess) {
          throw new UnauthorizedException('Assinatura ativa necessária para fazer login');
        }
      }

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

  // ============================================
  // PASSKEYS (WEBAUTHN)
  // ============================================

  @Post('passkeys/check-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar se email tem passkeys cadastradas',
    description: 'Verifica se o email informado possui passkeys cadastradas para login sem senha',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna se o email tem passkeys',
    schema: {
      example: { hasPasskeys: true },
    },
  })
  async checkEmailHasPasskeys(@Body() dto: PasskeyCheckEmailDto) {
    try {
      const hasPasskeys = await this.authService.getPasskeyService().emailHasPasskeys(dto.email);
      return { hasPasskeys };
    } catch (error: any) {
      return { hasPasskeys: false };
    }
  }

  @Post('passkeys/register/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar registro de passkey',
    description: 'Gera as opções necessárias para o navegador iniciar o registro de uma nova passkey',
  })
  @ApiResponse({
    status: 200,
    description: 'Opções de registro geradas',
  })
  async passkeyRegisterStart(@Request() req: any, @Body() dto: PasskeyRegisterStartDto) {
    try {
      const options = await this.authService.getPasskeyService().generateRegistrationOptions(
        req.user.userId,
        req.get('user-agent')
      );
      return options;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao iniciar registro de passkey');
    }
  }

  @Post('passkeys/register/finish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalizar registro de passkey',
    description: 'Verifica e salva a nova passkey no banco de dados',
  })
  @ApiResponse({
    status: 200,
    description: 'Passkey registrada com sucesso',
    schema: {
      example: {
        id: 1,
        deviceName: 'iPhone 15 Pro',
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
  })
  async passkeyRegisterFinish(@Request() req: any, @Body() dto: PasskeyRegisterFinishDto) {
    try {
      const passkey = await this.authService.getPasskeyService().verifyRegistration(
        req.user.userId,
        dto.response as any,
        dto.deviceName,
        req.get('user-agent')
      );
      return passkey;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao finalizar registro de passkey');
    }
  }

  @Post('passkeys/authenticate/start')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Iniciar autenticação com passkey',
    description: 'Gera as opções necessárias para o navegador iniciar a autenticação com passkey',
  })
  @ApiResponse({
    status: 200,
    description: 'Opções de autenticação geradas',
  })
  async passkeyAuthenticateStart(@Body() dto: PasskeyAuthenticateStartDto) {
    try {
      const options = await this.authService.getPasskeyService().generateAuthenticationOptions(dto.email);
      return options;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao iniciar autenticação com passkey');
    }
  }

  @Post('passkeys/authenticate/finish')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Finalizar autenticação com passkey',
    description: 'Verifica a passkey e retorna tokens de acesso',
  })
  @ApiResponse({
    status: 200,
    description: 'Autenticação bem-sucedida',
    schema: {
      example: {
        accessToken: 'eyJ...',
        refreshToken: 'eyJ...',
        user: { id: 1, email: 'user@example.com', roles: ['user'] },
      },
    },
  })
  async passkeyAuthenticateFinish(@Request() req: any, @Body() dto: PasskeyAuthenticateFinishDto) {
    try {
      const ip = req.ip || req.connection?.remoteAddress;
      const userAgent = req.get('user-agent');

      // Verificar a passkey
      const authResult = await this.authService.getPasskeyService().verifyAuthentication(
        dto.response as any,
        dto.email
      );

      // Gerar tokens
      const payload = {
        userId: authResult.userId,
        email: authResult.email,
        roles: authResult.roles,
      };

      const accessToken = this.authService.getDomainAuthService().generateJWT(
        payload,
        dto.rememberMe || false
      );
      const refreshToken = this.authService.getDomainAuthService().generateRefreshToken(payload);

      // Registrar login no histórico
      await this.authService.getDomainAuditService().logUserAction({
        userId: authResult.userId,
        entityType: AuditEntityType.USER,
        entityId: authResult.userId,
        action: AuditAction.LOGIN_PASSKEY,
        ip,
        userAgent,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: dto.rememberMe ? 7 * 24 * 60 * 60 : 3600,
        user: {
          id: authResult.userId,
          email: authResult.email,
          roles: authResult.roles,
        },
      };
    } catch (error: any) {
      throw new UnauthorizedException(error.message || 'Falha na autenticação com passkey');
    }
  }

  @Get('passkeys')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar passkeys do usuário',
    description: 'Retorna todas as passkeys cadastradas do usuário autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de passkeys',
    schema: {
      example: [
        {
          id: 1,
          deviceName: 'iPhone 15 Pro',
          createdAt: '2024-01-01T00:00:00Z',
          lastUsedAt: '2024-01-02T00:00:00Z',
        },
      ],
    },
  })
  async listPasskeys(@Request() req: any) {
    try {
      const passkeys = await this.authService.getPasskeyService().listPasskeys(req.user.userId);
      return passkeys;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao listar passkeys');
    }
  }

  @Put('passkeys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Atualizar nome da passkey',
    description: 'Atualiza o nome do dispositivo de uma passkey',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da passkey' })
  @ApiResponse({
    status: 200,
    description: 'Passkey atualizada',
  })
  async updatePasskeyName(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePasskeyNameDto
  ) {
    try {
      const passkey = await this.authService.getPasskeyService().updatePasskeyName(
        req.user.userId,
        id,
        dto.deviceName
      );
      return passkey;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao atualizar passkey');
    }
  }

  @Delete('passkeys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover passkey',
    description: 'Remove uma passkey do usuário',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da passkey' })
  @ApiResponse({
    status: 204,
    description: 'Passkey removida',
  })
  async deletePasskey(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    try {
      await this.authService.getPasskeyService().deletePasskey(req.user.userId, id);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao remover passkey');
    }
  }

  // ============================================
  // SESSIONS (MULTIPLE DEVICES)
  // ============================================

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar sessões ativas',
    description: 'Retorna todas as sessões ativas do usuário em diferentes dispositivos',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de sessões ativas',
    schema: {
      example: [
        {
          id: 1,
          deviceName: 'Chrome em Windows 10/11',
          deviceType: 'desktop',
          browser: 'Chrome 120',
          os: 'Windows 10/11',
          ipAddress: '192.168.1.1',
          isPasskeyAuth: false,
          lastActivityAt: '2024-01-02T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          isCurrent: true,
        },
      ],
    },
  })
  async listSessions(@Request() req: any) {
    try {
      // Extrair session token do header Authorization
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.replace('Bearer ', '') || undefined;
      
      const sessions = await this.authService.getSessionService().listSessions(
        req.user.userId,
        sessionToken
      );
      return sessions;
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao listar sessões');
    }
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Encerrar sessão específica',
    description: 'Encerra uma sessão específica em outro dispositivo',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID da sessão' })
  @ApiResponse({
    status: 204,
    description: 'Sessão encerrada',
  })
  async terminateSession(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    try {
      await this.authService.getSessionService().terminateSession(req.user.userId, id);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao encerrar sessão');
    }
  }

  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Encerrar outras sessões',
    description: 'Encerra todas as sessões exceto a atual',
  })
  @ApiResponse({
    status: 200,
    description: 'Outras sessões encerradas',
    schema: {
      example: { terminatedCount: 3 },
    },
  })
  async terminateOtherSessions(@Request() req: any) {
    try {
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.replace('Bearer ', '') || '';
      
      const count = await this.authService.getSessionService().terminateOtherSessions(
        req.user.userId,
        sessionToken
      );
      return { terminatedCount: count };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao encerrar outras sessões');
    }
  }

  @Delete('sessions/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Encerrar todas as sessões',
    description: 'Encerra todas as sessões do usuário (logout de todos os dispositivos)',
  })
  @ApiResponse({
    status: 200,
    description: 'Todas as sessões encerradas',
    schema: {
      example: { terminatedCount: 5 },
    },
  })
  async terminateAllSessions(@Request() req: any) {
    try {
      const count = await this.authService.getSessionService().terminateAllSessions(req.user.userId);
      return { terminatedCount: count };
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Erro ao encerrar sessões');
    }
  }
}

