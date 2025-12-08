import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { MercadoPagoService } from '../subscriptions/mercadopago.service';

@ApiTags('Admin - Mercado Pago')
@Controller('admin/mercadopago')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminMercadoPagoController {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private mercadoPagoService: MercadoPagoService
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obter configuração do Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Configuração do Mercado Pago' })
  async getConfig() {
    const config = await this.prisma.mercadoPagoConfig.findFirst({
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      return null;
    }

    // Retornar sem dados sensíveis criptografados
    return {
      id: config.id,
      public_key: config.public_key,
      environment: config.environment,
      webhook_url: config.webhook_url,
      is_active: config.is_active,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }

  @Get('public-key')
  @ApiOperation({ summary: 'Obter public key do Mercado Pago (público para frontend)' })
  @ApiResponse({ status: 200, description: 'Public key' })
  async getPublicKey() {
    const config = await this.prisma.mercadoPagoConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      throw new NotFoundException('Configuração do Mercado Pago não encontrada');
    }

    return {
      public_key: config.public_key,
    };
  }

  @Put('config')
  @ApiOperation({ summary: 'Atualizar configuração do Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Configuração atualizada' })
  async updateConfig(
    @Body()
    body: {
      access_token: string;
      public_key: string;
      webhook_secret?: string;
      environment: 'sandbox' | 'production';
      webhook_url?: string;
      is_active?: boolean;
    }
  ) {
    if (!body.access_token || !body.public_key) {
      throw new BadRequestException('Access Token e Public Key são obrigatórios');
    }

    // Criptografar dados sensíveis
    const accessTokenEnc = await this.encryptionService.encrypt(body.access_token);
    const webhookSecretEnc = body.webhook_secret
      ? await this.encryptionService.encrypt(body.webhook_secret)
      : null;

    // Buscar configuração existente
    const existing = await this.prisma.mercadopagoConfig.findFirst({
      orderBy: { created_at: 'desc' },
    });

    if (existing) {
      // Atualizar existente
      return this.prisma.mercadoPagoConfig.update({
        where: { id: existing.id },
        data: {
          access_token_enc: accessTokenEnc,
          public_key: body.public_key,
          webhook_secret_enc: webhookSecretEnc,
          environment: body.environment,
          webhook_url: body.webhook_url,
          is_active: body.is_active ?? existing.is_active,
        },
      });
    } else {
      // Criar nova
      return this.prisma.mercadoPagoConfig.create({
        data: {
          access_token_enc: accessTokenEnc,
          public_key: body.public_key,
          webhook_secret_enc: webhookSecretEnc,
          environment: body.environment,
          webhook_url: body.webhook_url,
          is_active: body.is_active ?? false,
        },
      });
    }
  }

  @Post('test-connection')
  @ApiOperation({ summary: 'Testar conexão com Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Resultado do teste' })
  async testConnection() {
    const config = await this.prisma.mercadoPagoConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      throw new NotFoundException('Configuração do Mercado Pago não encontrada');
    }

    try {
      // Tentar buscar informações da conta usando o access token
      const accessToken = await this.encryptionService.decrypt(config.access_token_enc);
      const baseUrl =
        config.environment === 'production'
          ? 'https://api.mercadopago.com'
          : 'https://api.mercadopago.com';

      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json() as any;
        return {
          success: false,
          message: 'Erro ao conectar com Mercado Pago',
          error: error?.message || 'Token inválido ou sem permissões',
        };
      }

      const userData = await response.json() as any;
      return {
        success: true,
        message: 'Conexão bem-sucedida',
        data: {
          user_id: userData?.id,
          email: userData?.email,
          nickname: userData?.nickname,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Erro ao testar conexão',
        error: error.message || 'Erro desconhecido',
      };
    }
  }
}
