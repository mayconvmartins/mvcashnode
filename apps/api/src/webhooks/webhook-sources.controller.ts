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
import { UserRole } from '@mvcashnode/shared';

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
      // Buscar IDs das contas do usuário
      const userAccounts = await this.prisma.exchangeAccount.findMany({
        where: { user_id: user.userId },
        select: { id: true },
      });
      const userAccountIds = userAccounts.map(acc => acc.id);

      // Buscar webhooks onde:
      // 1. owner_user_id = userId OU
      // 2. (is_shared = true E usuário tem contas vinculadas)
      const sources = await this.prisma.webhookSource.findMany({
        where: {
          OR: [
            { owner_user_id: user.userId },
            {
              is_shared: true,
              bindings: {
                some: {
                  exchange_account_id: { in: userAccountIds },
                },
              },
            },
          ],
        },
        include: {
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
        orderBy: {
          created_at: 'desc',
        },
      });

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      return sources.map(source => {
        const isOwner = source.owner_user_id === user.userId;
        
        // Se não for dono, retornar apenas informações básicas
        if (!isOwner) {
          return {
            id: source.id,
            label: source.label,
            is_shared: source.is_shared,
            is_owner: false,
          };
        }

        // Se for dono, retornar todos os dados
        return {
          id: source.id,
          label: source.label,
          webhook_code: source.webhook_code,
          webhook_url: `${apiUrl}/webhooks/${source.webhook_code}`,
          trade_mode: source.trade_mode,
          is_active: source.is_active,
          is_shared: source.is_shared,
          is_owner: true,
          admin_locked: source.admin_locked,
          require_signature: source.require_signature,
          rate_limit_per_min: source.rate_limit_per_min,
          allowed_ips: source.allowed_ips_json as string[] | null,
          alert_group_enabled: source.alert_group_enabled,
          alert_group_id: source.alert_group_id,
          bindings: source.bindings.map(binding => ({
            id: binding.id,
            exchange_account: binding.exchange_account,
            is_active: binding.is_active,
            weight: binding.weight,
          })),
          created_at: source.created_at,
          updated_at: source.updated_at,
        };
      });
    } catch (error: any) {
      throw new BadRequestException('Erro ao listar webhook sources');
    }
  }

  @Post()
  @ApiOperation({ 
    summary: 'Criar webhook source',
    description: `Cria um novo webhook source (fonte de webhook). Um webhook source é um endpoint que recebe sinais de trading de fontes externas (ex: TradingView, bots, etc.) e os converte em trades.

**Campos importantes:**
- \`label\`: Nome descritivo do webhook source
- \`webhook_code\`: Código único que será usado na URL (ex: 'tradingview-alerts')
- \`trade_mode\`: 'REAL' ou 'SIMULATION' - determina se trades serão executados em modo real ou simulação
- \`require_signature\`: Se true, valida assinatura HMAC dos webhooks recebidos
- \`rate_limit_per_min\`: Limite de requisições por minuto (padrão: 60)
- \`allowed_ips\`: Lista de IPs permitidos (opcional, para segurança)

A URL completa do webhook será: \`{API_URL}/webhooks/{webhook_code}\`

**Exemplo de uso:**
1. Criar webhook source com código 'tradingview-alerts'
2. URL gerada: \`http://localhost:4010/webhooks/tradingview-alerts\`
3. Configurar esta URL no TradingView ou outra fonte
4. Vincular contas de exchange via bindings (POST /webhook-sources/:id/bindings)`
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Webhook source criado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        label: { type: 'string', example: 'TradingView Alerts' },
        webhook_code: { type: 'string', example: 'tradingview-alerts' },
        webhook_url: { type: 'string', example: 'http://localhost:4010/webhooks/tradingview-alerts', description: 'URL completa do webhook para uso externo' },
        trade_mode: { type: 'string', enum: ['REAL', 'SIMULATION'], example: 'SIMULATION' },
        is_active: { type: 'boolean', example: true },
        require_signature: { type: 'boolean', example: false },
        rate_limit_per_min: { type: 'number', example: 60 },
        allowed_ips: { type: 'array', items: { type: 'string' }, nullable: true, example: ['192.168.1.1'] },
        created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Dados inválidos ou código de webhook já existe',
    schema: {
      example: {
        statusCode: 400,
        message: 'Código de webhook já existe. Escolha outro código.',
        error: 'Bad Request',
      },
    },
  })
  async create(
    @CurrentUser() user: any,
    @Body() createDto: CreateWebhookSourceDto
  ) {
    try {
      // Validar se usuário é admin antes de permitir is_shared = true
      if (createDto.isShared === true) {
        const isAdmin = user.roles?.includes(UserRole.ADMIN);
        if (!isAdmin) {
          throw new ForbiddenException('Apenas administradores podem marcar webhooks como compartilhados');
        }
      }

      const source = await this.webhooksService.getSourceService().createSource({
        ...createDto,
        ownerUserId: user.userId,
        isShared: createDto.isShared || false,
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
      // Buscar webhook source
      const source = await this.prisma.webhookSource.findFirst({
        where: { id },
        include: {
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

      if (!source) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      const isOwner = source.owner_user_id === user.userId;

      // Se não for dono e webhook não é compartilhado: retornar 404
      if (!isOwner && !source.is_shared) {
        throw new NotFoundException('Webhook source não encontrado');
      }

      // Se não for dono e webhook é compartilhado: retornar apenas id e label
      if (!isOwner && source.is_shared) {
        // Verificar se usuário tem contas vinculadas
        const userAccounts = await this.prisma.exchangeAccount.findMany({
          where: { user_id: user.userId },
          select: { id: true },
        });
        const userAccountIds = userAccounts.map(acc => acc.id);
        
        const hasBoundAccounts = source.bindings.some(
          binding => userAccountIds.includes(binding.exchange_account_id)
        );

        if (!hasBoundAccounts) {
          throw new NotFoundException('Webhook source não encontrado');
        }

        return {
          id: source.id,
          label: source.label,
          is_shared: true,
          is_owner: false,
        };
      }

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      const response = {
        id: source.id,
        label: source.label,
        webhook_code: source.webhook_code,
        webhook_url: `${apiUrl}/webhooks/${source.webhook_code}`,
        trade_mode: source.trade_mode,
        is_active: source.is_active,
        is_shared: source.is_shared,
        is_owner: true,
        admin_locked: source.admin_locked,
        require_signature: source.require_signature,
        rate_limit_per_min: source.rate_limit_per_min,
        allowed_ips: source.allowed_ips_json as string[] | null,
        alert_group_enabled: Boolean(source.alert_group_enabled), // Garantir que é boolean
        alert_group_id: source.alert_group_id || null, // Garantir que é null se vazio
        bindings: source.bindings.map(binding => ({
          id: binding.id,
          exchange_account: binding.exchange_account,
          is_active: binding.is_active,
          weight: binding.weight,
        })),
        created_at: source.created_at,
        updated_at: source.updated_at,
      };
      
      console.log('[WEBHOOK-GETONE] Resposta sendo enviada:', {
        alert_group_enabled: response.alert_group_enabled,
        alert_group_id: response.alert_group_id,
        tipo_alert_group_enabled: typeof response.alert_group_enabled,
      });
      
      return response;
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
    description: 'Atualiza as configurações de um webhook source existente. A URL do webhook permanece a mesma (baseada no código), mas é possível alterar trade_mode, rate limits, IPs permitidos, etc. O código do webhook não pode ser alterado após criação.',
  })
  @ApiParam({ 
    name: 'id', 
    type: 'number', 
    description: 'ID do webhook source',
    example: 1
  })
  @ApiResponse({ 
    status: 200,
    description: 'Webhook source atualizado com sucesso',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number', example: 1 },
        label: { type: 'string', example: 'TradingView Alerts Atualizado' },
        webhook_code: { type: 'string', example: 'tradingview-alerts' },
        webhook_url: { type: 'string', example: 'http://localhost:4010/webhooks/tradingview-alerts' },
        trade_mode: { type: 'string', enum: ['REAL', 'SIMULATION'], example: 'REAL' },
        is_active: { type: 'boolean', example: true },
        require_signature: { type: 'boolean', example: true },
        rate_limit_per_min: { type: 'number', example: 120 },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T11:00:00.000Z' },
      },
    },
  })
  @ApiResponse({ 
    status: 404,
    description: 'Webhook source não encontrado',
  })
  @ApiResponse({ 
    status: 403,
    description: 'Sem permissão para atualizar este webhook source',
  })
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

      // Validar se usuário é admin antes de permitir is_shared = true
      if (updateDto.isShared !== undefined) {
        const isAdmin = user.roles?.includes(UserRole.ADMIN);
        if (updateDto.isShared === true && !isAdmin) {
          throw new ForbiddenException('Apenas administradores podem marcar webhooks como compartilhados');
        }
      }

      // Atualizar apenas os campos fornecidos
      const updateData: any = {};
      if (updateDto.isShared !== undefined) updateData.is_shared = updateDto.isShared;
      if (updateDto.label !== undefined) updateData.label = updateDto.label;
      if (updateDto.tradeMode !== undefined) updateData.trade_mode = updateDto.tradeMode;
      if (updateDto.allowedIPs !== undefined) {
        updateData.allowed_ips_json = updateDto.allowedIPs ? JSON.parse(JSON.stringify(updateDto.allowedIPs)) : null;
      }
      if (updateDto.requireSignature !== undefined) updateData.require_signature = updateDto.requireSignature;
      if (updateDto.rateLimitPerMin !== undefined) updateData.rate_limit_per_min = updateDto.rateLimitPerMin;
      
      // Sempre atualizar alert_group_enabled e alert_group_id juntos
      if (updateDto.alertGroupEnabled !== undefined) {
        updateData.alert_group_enabled = updateDto.alertGroupEnabled;
        // Se está desativando, limpar o ID também
        if (!updateDto.alertGroupEnabled) {
          updateData.alert_group_id = null;
        } else {
          // Se está ativando, usar o ID fornecido ou null
          updateData.alert_group_id = updateDto.alertGroupId !== undefined ? (updateDto.alertGroupId || null) : null;
        }
      } else if (updateDto.alertGroupId !== undefined) {
        // Se apenas o ID foi alterado (sem mudar o enabled)
        updateData.alert_group_id = updateDto.alertGroupId || null;
      }
      
      console.log('[WEBHOOK-UPDATE] Dados recebidos:', updateDto);
      console.log('[WEBHOOK-UPDATE] Dados para atualizar:', updateData);
      // Note: is_active e webhook_code não podem ser alterados via update

      const updated = await this.prisma.webhookSource.update({
        where: { id },
        data: updateData,
      });
      
      console.log('[WEBHOOK-UPDATE] Dados atualizados no banco:', {
        alert_group_enabled: updated.alert_group_enabled,
        alert_group_id: updated.alert_group_id,
      });

      const apiUrl = this.configService.get<string>('API_URL') || 
                     `http://localhost:${this.configService.get<string>('API_PORT') || 4010}`;

      const response = {
        id: updated.id,
        owner_user_id: updated.owner_user_id,
        label: updated.label,
        webhook_code: updated.webhook_code,
        webhook_url: `${apiUrl}/webhooks/${updated.webhook_code}`,
        trade_mode: updated.trade_mode,
        is_active: updated.is_active,
        is_shared: updated.is_shared,
        is_owner: true,
        admin_locked: updated.admin_locked,
        require_signature: updated.require_signature,
        rate_limit_per_min: updated.rate_limit_per_min,
        allowed_ips: updated.allowed_ips_json as string[] | null,
        alert_group_enabled: Boolean(updated.alert_group_enabled), // Garantir que é boolean
        alert_group_id: updated.alert_group_id || null, // Garantir que é null se vazio
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      };
      
      console.log('[WEBHOOK-UPDATE] Resposta sendo enviada:', {
        alert_group_enabled: response.alert_group_enabled,
        alert_group_id: response.alert_group_id,
        tipo_alert_group_enabled: typeof response.alert_group_enabled,
      });
      
      return response;
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

