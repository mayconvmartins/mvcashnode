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
import { ConfigService } from '@nestjs/config';

@ApiTags('Admin - Mercado Pago')
@Controller('admin/mercadopago')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminMercadoPagoController {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private mercadoPagoService: MercadoPagoService,
    private configService: ConfigService
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obter configuração do Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Configuração do Mercado Pago' })
  async getConfig() {
    const config = await this.prisma.mercadoPagoConfig.findFirst({
      orderBy: { created_at: 'desc' },
    });

    // Gerar URL do webhook automaticamente
    const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 
                      this.configService.get<string>('SWAGGER_SERVER_URL') || 
                      'https://core.mvcash.com.br';
    const generatedWebhookUrl = `${apiBaseUrl}/subscriptions/webhooks/mercadopago`;

    if (!config) {
      return {
        webhook_url: generatedWebhookUrl,
        generated_webhook_url: generatedWebhookUrl,
      };
    }

    // Retornar sem dados sensíveis criptografados
    return {
      id: config.id,
      public_key: config.public_key,
      environment: config.environment,
      webhook_url: config.webhook_url || generatedWebhookUrl,
      generated_webhook_url: generatedWebhookUrl,
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
    try {
      if (!body.access_token || !body.public_key) {
        throw new BadRequestException('Access Token e Public Key são obrigatórios');
      }

      // Criptografar dados sensíveis
      const accessTokenEnc = await this.encryptionService.encrypt(body.access_token);
      const webhookSecretEnc = body.webhook_secret && body.webhook_secret.trim() !== ''
        ? await this.encryptionService.encrypt(body.webhook_secret)
        : null;

      // Normalizar webhook_url (null se vazio)
      const webhookUrl = body.webhook_url && body.webhook_url.trim() !== ''
        ? body.webhook_url.trim()
        : null;

      // Buscar configuração existente
      const existing = await this.prisma.mercadoPagoConfig.findFirst({
        orderBy: { created_at: 'desc' },
      });

      if (existing) {
        // Atualizar existente
        return this.prisma.mercadoPagoConfig.update({
          where: { id: existing.id },
          data: {
            access_token_enc: accessTokenEnc,
            public_key: body.public_key,
            webhook_secret_enc: webhookSecretEnc !== null ? webhookSecretEnc : undefined,
            environment: body.environment,
            webhook_url: webhookUrl,
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
            webhook_url: webhookUrl,
            is_active: body.is_active ?? false,
          },
        });
      }
    } catch (error: any) {
      console.error('[AdminMercadoPago] Erro ao salvar configuração:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao salvar configuração do Mercado Pago'
      );
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
        const error = await response.json() as { message?: string };
        return {
          success: false,
          message: 'Erro ao conectar com Mercado Pago',
          error: error?.message || 'Token inválido ou sem permissões',
        };
      }

      const userData = await response.json() as { id?: string; email?: string; nickname?: string };
      return {
        success: true,
        message: 'Conexão bem-sucedida',
        data: {
          user_id: userData?.id,
          email: userData?.email,
          nickname: userData?.nickname,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      return {
        success: false,
        message: 'Erro ao testar conexão',
        error: errorMessage,
      };
    }
  }
}
