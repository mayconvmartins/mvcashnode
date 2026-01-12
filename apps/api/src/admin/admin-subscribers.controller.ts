import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PrismaService } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import * as bcrypt from 'bcrypt';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@ApiTags('Admin - Subscribers')
@Controller('admin/subscribers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscribersController {
  private readonly logger = new Logger(AdminSubscribersController.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os assinantes' })
  @ApiQuery({ name: 'email', required: false, description: 'Filtrar por email' })
  @ApiQuery({ name: 'is_active', required: false, description: 'Filtrar por status ativo' })
  @ApiResponse({ status: 200, description: 'Lista de assinantes' })
  async list(
    @Query('email') email?: string,
    @Query('is_active') isActive?: string
  ): Promise<any[]> {
    const where: any = {
      roles: {
        some: {
          role: 'subscriber',
        },
      },
    };

    if (email) {
      where.email = { contains: email };
    }

    if (isActive !== undefined) {
      where.is_active = isActive === 'true';
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        roles: true,
        profile: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: {
            plan: true,
          },
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Formatar resposta com a assinatura ativa
    return users.map(user => ({
      ...user,
      subscription: user.subscriptions?.[0] || null,
      subscriptions: undefined, // Remover array para limpar resposta
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de um assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes do assinante' })
  async get(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    // Buscar perfil do assinante
    const subscriberProfile = await this.prisma.subscriberProfile.findUnique({
      where: { user_id: id },
    });

    // Descriptografar CPF se existir
    let decryptedCpf = null;
    if (subscriberProfile?.cpf_enc) {
      try {
        decryptedCpf = await this.encryptionService.decrypt(subscriberProfile.cpf_enc);
      } catch (error) {
        this.logger.warn(`Erro ao descriptografar CPF do usuário ${id}`);
      }
    }

    return {
      ...user,
      subscription: user.subscriptions?.[0] || null,
      subscriptions: undefined,
      subscriber_profile: subscriberProfile ? {
        ...subscriberProfile,
        cpf: decryptedCpf,
        cpf_enc: undefined, // Não retornar CPF criptografado
      } : null,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar dados do assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinante atualizado' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      is_active?: boolean;
      subscriber_profile?: {
        full_name?: string;
        phone?: string;
        whatsapp?: string;
        address_street?: string;
        address_number?: string;
        address_complement?: string;
        address_neighborhood?: string;
        address_city?: string;
        address_state?: string;
        address_zipcode?: string;
      };
    }
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    const updates: any = {};

    if (body.is_active !== undefined) {
      updates.is_active = body.is_active;
    }

    if (body.subscriber_profile) {
      await this.prisma.subscriberProfile.upsert({
        where: { user_id: id },
        create: {
          user_id: id,
          address_street: body.subscriber_profile.address_street,
          address_number: body.subscriber_profile.address_number,
          address_complement: body.subscriber_profile.address_complement,
          address_neighborhood: body.subscriber_profile.address_neighborhood,
          address_city: body.subscriber_profile.address_city,
          address_state: body.subscriber_profile.address_state,
          address_zipcode: body.subscriber_profile.address_zipcode,
        },
        update: {
          address_street: body.subscriber_profile.address_street,
          address_number: body.subscriber_profile.address_number,
          address_complement: body.subscriber_profile.address_complement,
          address_neighborhood: body.subscriber_profile.address_neighborhood,
          address_city: body.subscriber_profile.address_city,
          address_state: body.subscriber_profile.address_state,
          address_zipcode: body.subscriber_profile.address_zipcode,
        },
      });
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({
        where: { id },
        data: updates,
      });
    }

    return this.get(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Desativar assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Assinante desativado' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    return this.prisma.user.update({
      where: { id },
      data: { is_active: false },
    });
  }

  @Post(':id/change-password')
  @ApiOperation({ summary: 'Trocar senha do assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Senha alterada' })
  async changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { new_password: string; must_change_password?: boolean }
  ) {
    if (!body.new_password || body.new_password.length < 6) {
      throw new BadRequestException('Senha deve ter pelo menos 6 caracteres');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new NotFoundException('Usuário não é um assinante');
    }

    const passwordHash = await bcrypt.hash(body.new_password, 12);

    return this.prisma.user.update({
      where: { id },
      data: {
        password_hash: passwordHash,
        must_change_password: body.must_change_password ?? false,
      },
    });
  }

  @Post(':id/mvm-pay/activation-link')
  @ApiOperation({ summary: 'Gerar link de ativação (MvM Pay) para copiar e enviar ao assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Link de ativação gerado' })
  async generateMvmPayActivationLink(@Param('id', ParseIntPipe) id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Delegar para o mesmo fluxo público, mas retornando o link (admin pode copiar)
    return this.subscriptionsService.startMvmPayActivation(user.email, { returnLink: true });
  }

  @Get(':id/parameters')
  @ApiOperation({ summary: 'Ver parâmetros do assinante' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Parâmetros do assinante' })
  async getParameters(@Param('id', ParseIntPipe) id: number): Promise<any> {
    let parameters = await this.prisma.subscriberParameters.findUnique({
      where: { user_id: id },
    });

    // Se não existir, criar com valores padrão
    if (!parameters) {
      const defaults = await this.prisma.subscriberDefaultParameters.findFirst();
      
      parameters = await this.prisma.subscriberParameters.create({
        data: {
          user_id: id,
          quote_amount_fixed: defaults?.default_quote_amount || 100,
        }
      });
      
      this.logger.log(`Parâmetros criados automaticamente para assinante ${id}`);
    }

    // Incluir valores dos defaults globais na resposta
    const globalDefaults = await this.prisma.subscriberDefaultParameters.findFirst();
    
    return {
      ...parameters,
      quote_amount_fixed: parameters.quote_amount_fixed?.toNumber?.() || parameters.quote_amount_fixed,
      global_defaults: globalDefaults ? {
        min_quote_amount: globalDefaults.min_quote_amount?.toNumber?.() || globalDefaults.min_quote_amount,
        max_quote_amount: globalDefaults.max_quote_amount?.toNumber?.() || globalDefaults.max_quote_amount,
        default_quote_amount: globalDefaults.default_quote_amount?.toNumber?.() || globalDefaults.default_quote_amount,
        default_sl_enabled: globalDefaults.default_sl_enabled,
        default_sl_pct: globalDefaults.default_sl_pct?.toNumber?.() || globalDefaults.default_sl_pct,
        default_tp_enabled: globalDefaults.default_tp_enabled,
        default_tp_pct: globalDefaults.default_tp_pct?.toNumber?.() || globalDefaults.default_tp_pct,
        default_tsg_enabled: globalDefaults.default_tsg_enabled,
        default_tsg_activation_pct: globalDefaults.default_tsg_activation_pct?.toNumber?.() || globalDefaults.default_tsg_activation_pct,
        default_tsg_drop_pct: globalDefaults.default_tsg_drop_pct?.toNumber?.() || globalDefaults.default_tsg_drop_pct,
        allowed_symbols: globalDefaults.allowed_symbols,
      } : null
    };
  }

  @Post('sync')
  @ApiOperation({ 
    summary: 'Sincronizar assinantes',
    description: 'Vincula webhooks padrão e cria parâmetros padrão para assinantes que ainda não têm'
  })
  @ApiResponse({ status: 200, description: 'Sincronização concluída' })
  async syncSubscribers(): Promise<any> {
    this.logger.log('Iniciando sincronização de assinantes...');
    
    // Buscar todos os assinantes
    const subscribers = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: 'subscriber' } },
      },
      include: {
        exchange_accounts: true,
      },
    });

    // Buscar parâmetros padrão
    const defaultParams = await this.prisma.subscriberDefaultParameters.findFirst();

    // Buscar webhooks padrão de assinantes
    const defaultWebhooks = await this.prisma.webhookSource.findMany({
      where: { is_shared: true },
    });

    let syncedWebhooks = 0;
    let syncedParams = 0;
    let skippedParams = 0;

    for (const subscriber of subscribers) {
      // Sincronizar webhooks para cada conta de exchange
      for (const account of subscriber.exchange_accounts) {
        for (const webhook of defaultWebhooks) {
          // Verificar se já existe o binding
          const existingBinding = await this.prisma.accountWebhookBinding.findFirst({
            where: {
              webhook_source_id: webhook.id,
              exchange_account_id: account.id,
            },
          });

          if (!existingBinding) {
            await this.prisma.accountWebhookBinding.create({
              data: {
                webhook_source_id: webhook.id,
                exchange_account_id: account.id,
              },
            });
            syncedWebhooks++;
          }
        }
      }

      // Verificar se já tem parâmetros
      const existingParams = await this.prisma.subscriberParameters.findUnique({
        where: { user_id: subscriber.id },
      });

      if (!existingParams && defaultParams) {
        // Criar parâmetros padrão (apenas campos que existem em SubscriberParameters)
        await this.prisma.subscriberParameters.create({
          data: {
            user_id: subscriber.id,
            default_sl_enabled: defaultParams.default_sl_enabled,
            default_sl_pct: defaultParams.default_sl_pct,
            default_tp_enabled: defaultParams.default_tp_enabled,
            default_tp_pct: defaultParams.default_tp_pct,
            min_profit_pct: defaultParams.min_profit_pct,
            // NÃO copiar quote_amount_fixed - deixar null para o usuário definir
          },
        });
        syncedParams++;
      } else if (existingParams) {
        skippedParams++;
      }
    }

    this.logger.log(`Sincronização concluída: ${syncedWebhooks} webhooks, ${syncedParams} parâmetros criados, ${skippedParams} parâmetros já existentes`);

    return {
      success: true,
      synced_webhooks: syncedWebhooks,
      synced_parameters: syncedParams,
      skipped_parameters: skippedParams,
      total_subscribers: subscribers.length,
    };
  }
}

@ApiTags('Admin - Subscriber Parameters')
@Controller('admin/subscriber-parameters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminSubscriberParametersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os parâmetros de assinantes' })
  @ApiResponse({ status: 200, description: 'Lista de parâmetros' })
  async list(): Promise<any[]> {
    return this.prisma.subscriberParameters.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Obter parâmetros de um assinante' })
  @ApiParam({ name: 'userId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Parâmetros do assinante' })
  async get(@Param('userId', ParseIntPipe) userId: number): Promise<any> {
    const parameters = await this.prisma.subscriberParameters.findUnique({
      where: { user_id: userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            is_active: true,
          },
        },
      },
    });

    if (!parameters) {
      throw new NotFoundException('Parâmetros não encontrados para este assinante');
    }

    return parameters;
  }

  @Put(':userId')
  @ApiOperation({ summary: 'Atualizar parâmetros de um assinante' })
  @ApiParam({ name: 'userId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Parâmetros atualizados' })
  async update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: {
      default_exchange_account_id?: number;
      max_orders_per_hour?: number;
      min_interval_sec?: number;
      default_order_type?: string;
      slippage_bps?: number;
      default_sl_enabled?: boolean;
      default_sl_pct?: number;
      default_tp_enabled?: boolean;
      default_tp_pct?: number;
      trailing_stop_enabled?: boolean;
      trailing_distance_pct?: number;
      min_profit_pct?: number;
    }
  ): Promise<any> {
    // Verificar se usuário existe e é assinante
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new BadRequestException('Usuário não é um assinante');
    }

    // Upsert parâmetros
    return this.prisma.subscriberParameters.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        default_exchange_account_id: body.default_exchange_account_id,
        max_orders_per_hour: body.max_orders_per_hour,
        min_interval_sec: body.min_interval_sec,
        default_order_type: body.default_order_type || 'MARKET',
        slippage_bps: body.slippage_bps ?? 0,
        default_sl_enabled: body.default_sl_enabled ?? false,
        default_sl_pct: body.default_sl_pct,
        default_tp_enabled: body.default_tp_enabled ?? false,
        default_tp_pct: body.default_tp_pct,
        trailing_stop_enabled: body.trailing_stop_enabled ?? false,
        trailing_distance_pct: body.trailing_distance_pct,
        min_profit_pct: body.min_profit_pct,
      },
      update: {
        default_exchange_account_id: body.default_exchange_account_id,
        max_orders_per_hour: body.max_orders_per_hour,
        min_interval_sec: body.min_interval_sec,
        default_order_type: body.default_order_type,
        slippage_bps: body.slippage_bps,
        default_sl_enabled: body.default_sl_enabled,
        default_sl_pct: body.default_sl_pct,
        default_tp_enabled: body.default_tp_enabled,
        default_tp_pct: body.default_tp_pct,
        trailing_stop_enabled: body.trailing_stop_enabled,
        trailing_distance_pct: body.trailing_distance_pct,
        min_profit_pct: body.min_profit_pct,
      },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Criar parâmetros para um assinante' })
  @ApiResponse({ status: 201, description: 'Parâmetros criados' })
  async create(
    @Body() body: {
      user_id: number;
      default_exchange_account_id?: number;
      max_orders_per_hour?: number;
      min_interval_sec?: number;
      default_order_type?: string;
      slippage_bps?: number;
      default_sl_enabled?: boolean;
      default_sl_pct?: number;
      default_tp_enabled?: boolean;
      default_tp_pct?: number;
      trailing_stop_enabled?: boolean;
      trailing_distance_pct?: number;
      min_profit_pct?: number;
    }
  ): Promise<any> {
    // Verificar se usuário existe e é assinante
    const user = await this.prisma.user.findUnique({
      where: { id: body.user_id },
      include: {
        roles: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isSubscriber = user.roles.some(r => r.role === 'subscriber');
    if (!isSubscriber) {
      throw new BadRequestException('Usuário não é um assinante');
    }

    // Verificar se já existem parâmetros
    const existing = await this.prisma.subscriberParameters.findUnique({
      where: { user_id: body.user_id },
    });

    if (existing) {
      throw new BadRequestException('Parâmetros já existem para este assinante. Use PUT para atualizar.');
    }

    // Criar parâmetros
    return this.prisma.subscriberParameters.create({
      data: {
        user_id: body.user_id,
        default_exchange_account_id: body.default_exchange_account_id,
        max_orders_per_hour: body.max_orders_per_hour,
        min_interval_sec: body.min_interval_sec,
        default_order_type: body.default_order_type || 'MARKET',
        slippage_bps: body.slippage_bps ?? 0,
        default_sl_enabled: body.default_sl_enabled ?? false,
        default_sl_pct: body.default_sl_pct,
        default_tp_enabled: body.default_tp_enabled ?? false,
        default_tp_pct: body.default_tp_pct,
        trailing_stop_enabled: body.trailing_stop_enabled ?? false,
        trailing_distance_pct: body.trailing_distance_pct,
        min_profit_pct: body.min_profit_pct,
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
  }
}
