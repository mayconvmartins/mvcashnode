import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
  Body,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService, UserRole } from '@mvcashnode/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MvmPayService } from '../subscriptions/mvm-pay.service';

@ApiTags('Admin - MvM Pay')
@Controller('admin/mvm-pay')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminMvmPayController {
  private readonly logger = new Logger(AdminMvmPayController.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private mvmPayService: MvmPayService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obter configuração do MvM Pay' })
  @ApiResponse({ status: 200, description: 'Configuração do MvM Pay' })
  async getConfig() {
    const config = await this.prisma.mvmPayConfig.findFirst({
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      return null;
    }

    return {
      id: config.id,
      base_url: config.base_url,
      checkout_url: config.checkout_url,
      api_key: config.api_key,
      product_id: config.product_id,
      is_active: config.is_active,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }

  @Put('config')
  @ApiOperation({ summary: 'Atualizar configuração do MvM Pay' })
  @ApiResponse({ status: 200, description: 'Configuração atualizada' })
  async updateConfig(
    @Body()
    body: {
      base_url: string;
      checkout_url: string;
      api_key: string;
      api_secret?: string;
      product_id: number;
      is_active?: boolean;
    },
  ) {
    try {
      if (!body.base_url || !body.checkout_url || !body.api_key) {
        throw new BadRequestException('base_url, checkout_url e api_key são obrigatórios');
      }
      if (!body.product_id || body.product_id < 1) {
        throw new BadRequestException('product_id inválido');
      }

      const existing = await this.prisma.mvmPayConfig.findFirst({
        orderBy: { created_at: 'desc' },
      });

      if (existing) {
        const updateData: any = {
          base_url: body.base_url.trim(),
          checkout_url: body.checkout_url.trim(),
          api_key: body.api_key.trim(),
          product_id: body.product_id,
          is_active: body.is_active ?? existing.is_active,
        };

        // Só atualiza o secret se foi fornecido (e não for placeholder)
        if (body.api_secret && body.api_secret.trim() !== '' && body.api_secret !== 'KEEP') {
          updateData.api_secret_enc = await this.encryptionService.encrypt(body.api_secret.trim());
        }

        return this.prisma.mvmPayConfig.update({
          where: { id: existing.id },
          data: updateData,
        });
      }

      if (!body.api_secret || body.api_secret.trim() === '' || body.api_secret === 'KEEP') {
        throw new BadRequestException('api_secret é obrigatório para criar a configuração');
      }

      const apiSecretEnc = await this.encryptionService.encrypt(body.api_secret.trim());
      return this.prisma.mvmPayConfig.create({
        data: {
          base_url: body.base_url.trim(),
          checkout_url: body.checkout_url.trim(),
          api_key: body.api_key.trim(),
          api_secret_enc: apiSecretEnc,
          product_id: body.product_id,
          is_active: body.is_active ?? false,
        },
      });
    } catch (error: any) {
      this.logger.error('[AdminMvmPay] Erro ao salvar configuração:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Erro ao salvar configuração do MvM Pay');
    }
  }

  @Post('test-connection')
  @ApiOperation({ summary: 'Testar conexão com MvM Pay' })
  @ApiResponse({ status: 200, description: 'Resultado do teste' })
  async testConnection() {
    const active = await this.prisma.mvmPayConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });
    if (!active) {
      throw new NotFoundException('Configuração do MvM Pay não encontrada ou inativa');
    }

    try {
      const plans = await this.mvmPayService.getPlans();
      return {
        success: true,
        message: 'Conexão bem-sucedida',
        data: {
          plans_count: plans?.data?.plans?.length ?? 0,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Erro ao conectar com MvM Pay',
        error: error?.message || 'Falha no teste',
      };
    }
  }
}

