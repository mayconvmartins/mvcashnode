import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticação de usuário' })
  @ApiResponse({ status: 200, description: 'Login bem-sucedido' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

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
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token' })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService
      .getDomainAuthService()
      .refreshToken(refreshTokenDto.refreshToken);

    return result;
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configurar 2FA' })
  @ApiResponse({ status: 200, type: Setup2FAResponseDto })
  async setup2FA(@Request() req: any) {
    const userId = req.user.userId;
    const result = await this.authService.getDomainAuthService().setup2FA(userId);
    return result;
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar código 2FA' })
  @ApiResponse({ status: 200, description: '2FA verificado com sucesso' })
  @ApiResponse({ status: 400, description: 'Código inválido' })
  async verify2FA(@Request() req: any, @Body() verifyDto: Verify2FADto) {
    const userId = req.user.userId;
    const isValid = await this.authService
      .getDomainAuthService()
      .verify2FA(userId, verifyDto.token);

    return { valid: isValid };
  }
}

