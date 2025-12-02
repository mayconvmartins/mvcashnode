import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateBindingDto } from './dto/create-binding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Webhooks')
@Controller('webhook-sources/:sourceId/bindings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookBindingsController {
  constructor(
    private webhooksService: WebhooksService,
    private prisma: PrismaService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar bindings de webhook source',
    description: 'Retorna todos os bindings vinculados a um webhook source específico. Requer que o webhook source pertença ao usuário autenticado.',
  })
  @ApiParam({ name: 'sourceId', type: 'number', description: 'ID do webhook source', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Lista de bindings',
    schema: {
      example: [
        {
          id: 1,
          webhook_source_id: 1,
          exchange_account_id: 1,
          is_active: true,
          weight: 1.0,
          exchange_account: {
            id: 1,
            label: 'Binance Spot Real',
            exchange: 'BINANCE_SPOT',
          },
          created_at: '2025-02-12T10:00:00.000Z',
          updated_at: '2025-02-12T10:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'Webhook source não encontrado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para acessar este webhook source' })
  async list(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @CurrentUser() user: any
  ) {
    try {
      // Verificar se o webhook source pertence ao usuário
      const source = await this.prisma.webhookSource.findFirst({
        where: {
          id: sourceId,
          owner_user_id: user.userId,
        },
        include: {
          bindings: {
            include: {
              exchange_account: {
                select: {
                  id: true,
                  label: true,
                  exchange: true,
                  is_simulation: true,
                },
              },
            },
          },
        },
      });

      if (!source) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      return source.bindings.map((binding) => ({
        id: binding.id,
        webhook_source_id: binding.webhook_source_id,
        exchange_account_id: binding.exchange_account_id,
        is_active: binding.is_active,
        weight: binding.weight?.toNumber() || null,
        exchange_account: binding.exchange_account,
        created_at: binding.created_at,
        updated_at: binding.updated_at,
      }));
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Erro ao listar bindings');
    }
  }

  @Post()
  @ApiOperation({
    summary: 'Criar binding',
    description: 'Vincula uma conta de exchange a um webhook source. Cada binding permite que o webhook dispare trades na conta vinculada.',
  })
  @ApiParam({ name: 'sourceId', type: 'number', description: 'ID do webhook source', example: 1 })
  @ApiBody({ type: CreateBindingDto, description: 'Dados para criação do binding' })
  @ApiResponse({
    status: 201,
    description: 'Binding criado com sucesso',
    schema: {
      example: {
        id: 1,
        webhook_source_id: 1,
        exchange_account_id: 1,
        is_active: true,
        weight: 1.0,
        exchange_account: {
          id: 1,
          label: 'Binance Spot Real',
          exchange: 'BINANCE_SPOT',
        },
        created_at: '2025-02-12T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Webhook source ou conta de exchange não encontrada' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 409, description: 'Binding já existe' })
  async create(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @CurrentUser() user: any,
    @Body() createDto: CreateBindingDto
  ) {
    try {
      // Verificar se o webhook source pertence ao usuário
      const source = await this.prisma.webhookSource.findFirst({
        where: {
          id: sourceId,
          owner_user_id: user.userId,
        },
      });

      if (!source) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      // Verificar se a exchange account pertence ao usuário
      const account = await this.prisma.exchangeAccount.findFirst({
        where: {
          id: createDto.exchangeAccountId,
          user_id: user.userId,
        },
      });

      if (!account) {
        throw new NotFoundException('Conta de exchange não encontrada');
      }

      // Verificar se já existe binding (unique constraint)
      const existing = await this.prisma.accountWebhookBinding.findUnique({
        where: {
          webhook_source_id_exchange_account_id: {
            webhook_source_id: sourceId,
            exchange_account_id: createDto.exchangeAccountId,
          },
        },
      });

      if (existing) {
        throw new ConflictException('Binding já existe para esta conta de exchange');
      }

      // Criar binding
      const binding = await this.prisma.accountWebhookBinding.create({
        data: {
          webhook_source_id: sourceId,
          exchange_account_id: createDto.exchangeAccountId,
          is_active: createDto.isActive ?? true,
          weight: createDto.weight ?? 1.0,
        },
        include: {
          exchange_account: {
            select: {
              id: true,
              label: true,
              exchange: true,
              is_simulation: true,
            },
          },
        },
      });

      return {
        id: binding.id,
        webhook_source_id: binding.webhook_source_id,
        exchange_account_id: binding.exchange_account_id,
        is_active: binding.is_active,
        weight: binding.weight?.toNumber() || null,
        exchange_account: binding.exchange_account,
        created_at: binding.created_at,
        updated_at: binding.updated_at,
      };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      const errorMessage = error?.message || 'Erro ao criar binding';
      if (errorMessage.includes('Unique constraint') || errorMessage.includes('already exists')) {
        throw new ConflictException('Binding já existe para esta conta de exchange');
      }

      throw new BadRequestException('Erro ao criar binding');
    }
  }

  @Delete(':bindingId')
  @ApiOperation({
    summary: 'Deletar binding',
    description: 'Remove o vínculo entre um webhook source e uma conta de exchange.',
  })
  @ApiParam({ name: 'sourceId', type: 'number', description: 'ID do webhook source', example: 1 })
  @ApiParam({ name: 'bindingId', type: 'number', description: 'ID do binding a ser deletado', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Binding deletado com sucesso',
    schema: {
      example: {
        message: 'Binding deletado com sucesso',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Binding não encontrado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para deletar este binding' })
  async delete(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Param('bindingId', ParseIntPipe) bindingId: number,
    @CurrentUser() user: any
  ) {
    try {
      // Verificar se o binding existe e pertence ao webhook source do usuário
      const binding = await this.prisma.accountWebhookBinding.findFirst({
        where: {
          id: bindingId,
          webhook_source_id: sourceId,
        },
        include: {
          webhook_source: {
            select: {
              owner_user_id: true,
            },
          },
        },
      });

      if (!binding) {
        throw new NotFoundException('Binding não encontrado');
      }

      // Verificar se o webhook source pertence ao usuário
      if (binding.webhook_source.owner_user_id !== user.userId) {
        throw new ForbiddenException('Você não tem permissão para deletar este binding');
      }

      // Deletar binding
      await this.prisma.accountWebhookBinding.delete({
        where: {
          id: bindingId,
        },
      });

      return { message: 'Binding deletado com sucesso' };
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new BadRequestException('Erro ao deletar binding');
    }
  }
}

