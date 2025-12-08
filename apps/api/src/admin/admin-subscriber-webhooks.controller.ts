import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import * as crypto from 'crypto';

@ApiTags('Admin - Subscriber Webhooks')
@Controller('admin/subscriber-webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscriberWebhooksController {
  private readonly logger = new Logger(AdminSubscriberWebhooksController.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar webhooks padrão de assinantes' })
  @ApiResponse({ status: 200, description: 'Lista de webhooks padrão' })
  async list(): Promise<any[]> {
    // Webhooks padrão: is_shared = true AND admin_locked = true
    const webhooks = await this.prisma.webhookSource.findMany({
      where: {
        is_shared: true,
        admin_locked: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        _count: {
          select: {
            bindings: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return webhooks.map((w) => ({
      id: w.id,
      label: w.label,
      webhook_code: w.webhook_code,
      trade_mode: w.trade_mode,
      is_active: w.is_active,
      rate_limit_per_min: w.rate_limit_per_min,
      require_signature: w.require_signature,
      owner: w.user,
      bindings_count: w._count.bindings,
      created_at: w.created_at,
      updated_at: w.updated_at,
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter webhook padrão por ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes do webhook' })
  async get(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const webhook = await this.prisma.webhookSource.findFirst({
      where: {
        id,
        is_shared: true,
        admin_locked: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        bindings: {
          include: {
            exchange_account: {
              select: {
                id: true,
                label: true,
                exchange: true,
                user_id: true,
              },
            },
          },
        },
      },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook padrão não encontrado');
    }

    return {
      id: webhook.id,
      label: webhook.label,
      webhook_code: webhook.webhook_code,
      trade_mode: webhook.trade_mode,
      is_active: webhook.is_active,
      rate_limit_per_min: webhook.rate_limit_per_min,
      require_signature: webhook.require_signature,
      allowed_ips: webhook.allowed_ips_json,
      owner: webhook.user,
      bindings: webhook.bindings.map((b) => ({
        id: b.id,
        exchange_account: b.exchange_account,
        is_active: b.is_active,
        weight: b.weight?.toNumber() || null,
      })),
      created_at: webhook.created_at,
      updated_at: webhook.updated_at,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Criar webhook padrão de assinantes' })
  @ApiResponse({ status: 201, description: 'Webhook criado' })
  async create(
    @CurrentUser() user: any,
    @Body()
    body: {
      label: string;
      trade_mode: 'REAL' | 'SIMULATION';
      require_signature?: boolean;
      signing_secret?: string;
      rate_limit_per_min?: number;
      allowed_ips?: string[];
    }
  ): Promise<any> {
    try {
      if (!body.label || !body.trade_mode) {
        throw new BadRequestException('Label e trade_mode são obrigatórios');
      }

      // Gerar código único
      const webhookCode = `subscriber-default-${crypto.randomBytes(8).toString('hex')}`;

      // Criptografar secret se fornecido
      let signingSecretEnc: string | null = null;
      if (body.signing_secret && body.signing_secret.trim() !== '') {
        signingSecretEnc = await this.encryptionService.encrypt(body.signing_secret);
      }

      // Criar webhook como padrão de assinantes
      const webhook = await this.prisma.webhookSource.create({
        data: {
          owner_user_id: user.userId,
          label: body.label.trim(),
          webhook_code: webhookCode,
          trade_mode: body.trade_mode,
          require_signature: body.require_signature || false,
          signing_secret_enc: signingSecretEnc,
          rate_limit_per_min: body.rate_limit_per_min || 60,
          allowed_ips_json: body.allowed_ips && body.allowed_ips.length > 0 ? body.allowed_ips : null,
          is_active: true,
          is_shared: true, // Compartilhado
          admin_locked: true, // Bloqueado pelo admin (padrão de assinantes)
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      return {
        id: webhook.id,
        label: webhook.label,
        webhook_code: webhook.webhook_code,
        trade_mode: webhook.trade_mode,
        is_active: webhook.is_active,
        owner: webhook.user,
        created_at: webhook.created_at,
      };
    } catch (error: any) {
      this.logger.error('[AdminSubscriberWebhooks] Erro ao criar webhook:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao criar webhook padrão de assinantes'
      );
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar webhook padrão de assinantes' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook atualizado' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      label?: string;
      is_active?: boolean;
      require_signature?: boolean;
      signing_secret?: string;
      rate_limit_per_min?: number;
      allowed_ips?: string[];
    }
  ): Promise<any> {
    try {
      const existing = await this.prisma.webhookSource.findFirst({
        where: {
          id,
          is_shared: true,
          admin_locked: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('Webhook padrão não encontrado');
      }

      const updateData: any = {};

      if (body.label !== undefined) {
        updateData.label = body.label.trim();
      }
      if (body.is_active !== undefined) {
        updateData.is_active = body.is_active;
      }
      if (body.require_signature !== undefined) {
        updateData.require_signature = body.require_signature;
      }
      if (body.rate_limit_per_min !== undefined) {
        updateData.rate_limit_per_min = body.rate_limit_per_min;
      }
      if (body.allowed_ips !== undefined) {
        updateData.allowed_ips_json = body.allowed_ips && body.allowed_ips.length > 0 ? body.allowed_ips : null;
      }

      // Atualizar secret se fornecido
      if (body.signing_secret !== undefined) {
        if (body.signing_secret && body.signing_secret.trim() !== '') {
          updateData.signing_secret_enc = await this.encryptionService.encrypt(body.signing_secret);
        } else {
          // Se for string vazia, remover secret
          updateData.signing_secret_enc = null;
        }
      }

      const updated = await this.prisma.webhookSource.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      return {
        id: updated.id,
        label: updated.label,
        webhook_code: updated.webhook_code,
        trade_mode: updated.trade_mode,
        is_active: updated.is_active,
        owner: updated.user,
        updated_at: updated.updated_at,
      };
    } catch (error: any) {
      this.logger.error('[AdminSubscriberWebhooks] Erro ao atualizar webhook:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao atualizar webhook padrão de assinantes'
      );
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desativar webhook padrão de assinantes' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook desativado' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const existing = await this.prisma.webhookSource.findFirst({
      where: {
        id,
        is_shared: true,
        admin_locked: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Webhook padrão não encontrado');
    }

    // Não deletar, apenas desativar
    await this.prisma.webhookSource.update({
      where: { id },
      data: { is_active: false },
    });

    return { message: 'Webhook padrão desativado com sucesso' };
  }
}
