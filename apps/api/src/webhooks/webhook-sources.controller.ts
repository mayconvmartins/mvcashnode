import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookSourceDto } from './dto/create-webhook-source.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Webhooks')
@Controller('webhook-sources')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhookSourcesController {
  constructor(
    private webhooksService: WebhooksService,
    private prisma: PrismaService,
    private configService: ConfigService
  ) {}

  @Get()
  @ApiOperation({ 
    summary: 'Listar webhook sources',
    description: 'Retorna todos os webhook sources do usuário autenticado, incluindo a URL completa do webhook para uso.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de webhook sources',
    schema: {
      example: [
        {
          id: 1,
          label: 'Webhook Teste',
          webhook_code: 'test-webhook-001',
          webhook_url: 'http://localhost:4010/webhooks/test-webhook-001',
          trade_mode: 'SIMULATION',
          is_active: true,
          require_signature: false,
          rate_limit_per_min: 60,
          created_at: '2025-02-12T10:00:00.000Z'
        }
      ]
    }
  })
  async list(@CurrentUser() user: any): Promise<any[]> {
    try {
      const sources = await this.prisma.webhookSource.findMany({
        where: {
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
                },
              },
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      return sources.map(source => ({
        id: source.id,
        label: source.label,
        webhook_code: source.webhook_code,
        webhook_url: `${apiUrl}/webhooks/${source.webhook_code}`,
        trade_mode: source.trade_mode,
        is_active: source.is_active,
        admin_locked: source.admin_locked,
        require_signature: source.require_signature,
        rate_limit_per_min: source.rate_limit_per_min,
        allowed_ips: source.allowed_ips_json as string[] | null,
        bindings: source.bindings.map(binding => ({
          id: binding.id,
          exchange_account: binding.exchange_account,
          is_active: binding.is_active,
          weight: binding.weight,
        })),
        created_at: source.created_at,
        updated_at: source.updated_at,
      }));
    } catch (error: any) {
      throw new BadRequestException('Erro ao listar webhook sources');
    }
  }

  @Post()
  @ApiOperation({ 
    summary: 'Criar webhook source',
    description: 'Cria um novo webhook source. A URL do webhook será gerada automaticamente com base no código fornecido.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Webhook source criado com sucesso',
    schema: {
      example: {
        id: 1,
        label: 'Webhook Teste',
        webhook_code: 'test-webhook-001',
        webhook_url: 'http://localhost:4010/webhooks/test-webhook-001',
        trade_mode: 'SIMULATION',
        is_active: true,
        created_at: '2025-02-12T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou código já existe',
    schema: {
      example: {
        statusCode: 400,
        message: 'Código de webhook já existe',
        error: 'Bad Request'
      }
    }
  })
  async create(
    @CurrentUser() user: any,
    @Body() createDto: CreateWebhookSourceDto
  ) {
    try {
      const source = await this.webhooksService.getSourceService().createSource({
        ...createDto,
        ownerUserId: user.userId,
      });

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      return {
        ...source,
        webhook_url: `${apiUrl}/webhooks/${source.webhook_code}`,
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Erro ao criar webhook source';
      
      if (errorMessage.includes('Unique constraint') || errorMessage.includes('já existe') || errorMessage.includes('already exists')) {
        throw new BadRequestException('Código de webhook já existe. Escolha outro código.');
      }
      
      if (errorMessage.includes('invalid') || errorMessage.includes('inválido')) {
        throw new BadRequestException('Dados do webhook inválidos');
      }
      
      throw new BadRequestException('Erro ao criar webhook source');
    }
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Obter webhook source por ID',
    description: 'Retorna os detalhes de um webhook source específico, incluindo a URL completa do webhook.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do webhook source', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook source encontrado',
    schema: {
      example: {
        id: 1,
        label: 'Webhook Teste',
        webhook_code: 'test-webhook-001',
        webhook_url: 'http://localhost:4010/webhooks/test-webhook-001',
        trade_mode: 'SIMULATION',
        is_active: true,
        require_signature: false,
        rate_limit_per_min: 60,
        bindings: [],
        created_at: '2025-02-12T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Webhook source não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Webhook source não encontrado',
        error: 'Not Found'
      }
    }
  })
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ): Promise<any> {
    try {
      const source = await this.prisma.webhookSource.findFirst({
        where: {
          id,
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
                },
              },
            },
          },
        },
      });

      if (!source) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      return {
        id: source.id,
        label: source.label,
        webhook_code: source.webhook_code,
        webhook_url: `${apiUrl}/webhooks/${source.webhook_code}`,
        trade_mode: source.trade_mode,
        is_active: source.is_active,
        admin_locked: source.admin_locked,
        require_signature: source.require_signature,
        rate_limit_per_min: source.rate_limit_per_min,
        allowed_ips: source.allowed_ips_json as string[] | null,
        bindings: source.bindings.map(binding => ({
          id: binding.id,
          exchange_account: binding.exchange_account,
          is_active: binding.is_active,
          weight: binding.weight,
        })),
        created_at: source.created_at,
        updated_at: source.updated_at,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao buscar webhook source';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Webhook source não encontrado');
      }
      
      throw new BadRequestException('Erro ao buscar webhook source');
    }
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Atualizar webhook source',
    description: 'Atualiza um webhook source existente. A URL do webhook permanece a mesma (baseada no código).'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do webhook source', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook source atualizado com sucesso',
    schema: {
      example: {
        id: 1,
        label: 'Webhook Atualizado',
        webhook_code: 'test-webhook-001',
        webhook_url: 'http://localhost:4010/webhooks/test-webhook-001',
        trade_mode: 'SIMULATION',
        is_active: true,
        updated_at: '2025-02-12T10:00:00.000Z'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Webhook source não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Webhook source não encontrado',
        error: 'Not Found'
      }
    }
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() updateDto: Partial<CreateWebhookSourceDto>
  ): Promise<any> {
    try {
      // Verificar se o webhook source existe e pertence ao usuário
      const existing = await this.prisma.webhookSource.findFirst({
        where: {
          id,
          owner_user_id: user.userId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      // Atualizar apenas os campos fornecidos
      const updateData: any = {};
      if (updateDto.label !== undefined) updateData.label = updateDto.label;
      if (updateDto.tradeMode !== undefined) updateData.trade_mode = updateDto.tradeMode;
      if (updateDto.allowedIPs !== undefined) {
        updateData.allowed_ips_json = updateDto.allowedIPs ? JSON.parse(JSON.stringify(updateDto.allowedIPs)) : null;
      }
      if (updateDto.requireSignature !== undefined) updateData.require_signature = updateDto.requireSignature;
      if (updateDto.rateLimitPerMin !== undefined) updateData.rate_limit_per_min = updateDto.rateLimitPerMin;
      // Note: is_active e webhook_code não podem ser alterados via update

      const updated = await this.prisma.webhookSource.update({
        where: { id },
        data: updateData,
      });

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      return {
        ...updated,
        webhook_url: `${apiUrl}/webhooks/${updated.webhook_code}`,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao atualizar webhook source';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Webhook source não encontrado');
      }
      
      if (errorMessage.includes('permission') || errorMessage.includes('permissão')) {
        throw new ForbiddenException('Você não tem permissão para atualizar este webhook source');
      }
      
      throw new BadRequestException('Erro ao atualizar webhook source');
    }
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Deletar webhook source',
    description: 'Remove um webhook source. Todos os bindings e eventos relacionados também serão removidos.'
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do webhook source', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook source deletado com sucesso',
    schema: {
      example: {
        message: 'Webhook source deletado com sucesso'
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Webhook source não encontrado',
    schema: {
      example: {
        statusCode: 404,
        message: 'Webhook source não encontrado',
        error: 'Not Found'
      }
    }
  })
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any
  ) {
    try {
      // Verificar se o webhook source existe e pertence ao usuário
      const existing = await this.prisma.webhookSource.findFirst({
        where: {
          id,
          owner_user_id: user.userId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      await this.prisma.webhookSource.delete({
        where: { id },
      });

      return { message: 'Webhook source deletado com sucesso' };
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      const errorMessage = error?.message || 'Erro ao deletar webhook source';
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        throw new NotFoundException('Webhook source não encontrado');
      }
      
      if (errorMessage.includes('permission') || errorMessage.includes('permissão')) {
        throw new ForbiddenException('Você não tem permissão para deletar este webhook source');
      }
      
      throw new BadRequestException('Erro ao deletar webhook source');
    }
  }
}

