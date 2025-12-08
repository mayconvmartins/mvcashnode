import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
  Query,
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
import { TransFiService } from '../subscriptions/transfi.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Admin - TransFi')
@Controller('admin/transfi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminTransFiController {
  private readonly logger = new Logger(AdminTransFiController.name);

  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private transfiService: TransFiService,
    private configService: ConfigService
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obter configuração do TransFi' })
  @ApiResponse({ status: 200, description: 'Configuração do TransFi' })
  async getConfig() {
    const config = await this.prisma.transFiConfig.findFirst({
      orderBy: { created_at: 'desc' },
    });

    // Gerar URL do webhook automaticamente
    const apiBaseUrl = this.configService.get<string>('API_BASE_URL') || 
                      this.configService.get<string>('SWAGGER_SERVER_URL') || 
                      'https://core.mvcash.com.br';
    const generatedWebhookUrl = `${apiBaseUrl}/subscriptions/webhooks/transfi`;

    // Gerar URL de redirect automaticamente
    const frontendBaseUrl = this.configService.get<string>('FRONTEND_URL') || 
                           this.configService.get<string>('API_BASE_URL')?.replace('/api', '') || 
                           'https://mvcash.com.br';
    const generatedRedirectUrl = `${frontendBaseUrl}/subscribe/success`;

    if (!config) {
      return {
        webhook_url: generatedWebhookUrl,
        redirect_url: generatedRedirectUrl,
        generated_webhook_url: generatedWebhookUrl,
        generated_redirect_url: generatedRedirectUrl,
      };
    }

    // Retornar sem dados sensíveis criptografados
    return {
      id: config.id,
      merchant_id: config.merchant_id,
      username: config.username,
      environment: config.environment,
      webhook_url: config.webhook_url || generatedWebhookUrl,
      redirect_url: config.redirect_url || generatedRedirectUrl,
      generated_webhook_url: generatedWebhookUrl,
      generated_redirect_url: generatedRedirectUrl,
      is_active: config.is_active,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }

  @Put('config')
  @ApiOperation({ summary: 'Atualizar configuração do TransFi' })
  @ApiResponse({ status: 200, description: 'Configuração atualizada' })
  async updateConfig(
    @Body()
    body: {
      merchant_id: string;
      username: string;
      password: string;
      webhook_secret?: string;
      environment: 'sandbox' | 'production';
      webhook_url?: string;
      redirect_url?: string;
      is_active?: boolean;
    }
  ) {
    try {
      if (!body.merchant_id || !body.username) {
        throw new BadRequestException('Merchant ID e Username são obrigatórios');
      }

      // Buscar configuração existente primeiro
      const existing = await this.prisma.transFiConfig.findFirst({
        orderBy: { created_at: 'desc' },
      });

      if (!body.password && !existing) {
        throw new BadRequestException('Password é obrigatório na primeira configuração');
      }

      // Criptografar dados sensíveis
      const passwordEnc = body.password && body.password.trim() !== ''
        ? await this.encryptionService.encrypt(body.password)
        : undefined;
      const webhookSecretEnc = body.webhook_secret && body.webhook_secret.trim() !== ''
        ? await this.encryptionService.encrypt(body.webhook_secret)
        : null;

      // Normalizar URLs (null se vazio)
      const webhookUrl = body.webhook_url && body.webhook_url.trim() !== ''
        ? body.webhook_url.trim()
        : null;
      const redirectUrl = body.redirect_url && body.redirect_url.trim() !== ''
        ? body.redirect_url.trim()
        : null;

      if (existing) {
        // Atualizar existente
        const updateData: any = {
          merchant_id: body.merchant_id,
          username: body.username,
          environment: body.environment,
          webhook_url: webhookUrl,
          redirect_url: redirectUrl,
          is_active: body.is_active ?? existing.is_active,
        };
        
        // Só atualizar password_enc se foi fornecido um novo valor
        if (passwordEnc) {
          updateData.password_enc = passwordEnc;
        }
        
        // Só atualizar webhook_secret_enc se foi fornecido um novo valor
        if (body.webhook_secret && body.webhook_secret.trim() !== '') {
          updateData.webhook_secret_enc = webhookSecretEnc;
        }
        
        // Limpar cache do service
        this.transfiService.clearCache();
        
        return this.prisma.transFiConfig.update({
          where: { id: existing.id },
          data: updateData,
        });
      } else {
        if (!passwordEnc) {
          throw new BadRequestException('Password é obrigatório na primeira configuração');
        }
        
        // Criar nova
        const newConfig = await this.prisma.transFiConfig.create({
          data: {
            merchant_id: body.merchant_id,
            username: body.username,
            password_enc: passwordEnc,
            webhook_secret_enc: webhookSecretEnc,
            environment: body.environment,
            webhook_url: webhookUrl,
            redirect_url: redirectUrl,
            is_active: body.is_active ?? false,
          },
        });
        
        // Limpar cache do service
        this.transfiService.clearCache();
        
        return newConfig;
      }
    } catch (error: any) {
      this.logger.error('[AdminTransFi] Erro ao salvar configuração:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        error?.message || 'Erro ao salvar configuração do TransFi'
      );
    }
  }

  @Post('test-connection')
  @ApiOperation({ summary: 'Testar conexão com TransFi' })
  @ApiResponse({ status: 200, description: 'Resultado do teste' })
  async testConnection() {
    const config = await this.prisma.transFiConfig.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });

    if (!config) {
      throw new NotFoundException('Configuração do TransFi não encontrada');
    }

    try {
      // Tentar listar moedas suportadas para testar conexão (direction obrigatório)
      await this.transfiService.getSupportedCurrencies('deposit');

      return {
        success: true,
        message: 'Conexão bem-sucedida',
        data: {
          merchant_id: config.merchant_id,
          environment: config.environment,
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

  @Get('payments')
  @ApiOperation({ summary: 'Listar pagamentos do TransFi' })
  @ApiResponse({ status: 200, description: 'Lista de pagamentos' })
  async listPayments(
    @Query('status') status?: string,
    @Query('payment_method') payment_method?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<any[]> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (payment_method) {
      where.payment_method = payment_method;
    }
    // Filtrar apenas pagamentos TransFi
    where.transfi_order_id = { not: null };

    const payments = await this.prisma.subscriptionPayment.findMany({
      where,
      include: {
        subscription: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: {
                    full_name: true,
                  },
                },
              },
            },
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      skip,
      take: limitNum,
    });

    return payments.map((p) => ({
      id: p.id,
      transfi_order_id: p.transfi_order_id,
      transfi_payment_id: p.transfi_payment_id,
      amount: p.amount.toNumber(),
      status: p.status,
      payment_method: p.payment_method,
      subscription: {
        id: p.subscription.id,
        status: p.subscription.status,
        user: p.subscription.user,
        plan: p.subscription.plan,
      },
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Obter detalhes de um pagamento' })
  @ApiResponse({ status: 200, description: 'Detalhes do pagamento' })
  async getPayment(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id },
      include: {
        subscription: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: {
                    full_name: true,
                  },
                },
              },
            },
            plan: {
              select: {
                id: true,
                name: true,
                price_monthly: true,
                price_quarterly: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    if (!payment.transfi_order_id) {
      throw new BadRequestException('Este pagamento não é do TransFi');
    }

    // Buscar informações atualizadas do TransFi
    let transfiOrderData = null;
    try {
      transfiOrderData = await this.transfiService.getOrderDetails(payment.transfi_order_id);
    } catch (error) {
      this.logger.warn(`Não foi possível buscar dados atualizados do TransFi para pedido ${payment.transfi_order_id}`);
    }

    return {
      id: payment.id,
      transfi_order_id: payment.transfi_order_id,
      transfi_payment_id: payment.transfi_payment_id,
      amount: payment.amount.toNumber(),
      status: payment.status,
      payment_method: payment.payment_method,
      subscription: {
        id: payment.subscription.id,
        status: payment.subscription.status,
        start_date: payment.subscription.start_date,
        end_date: payment.subscription.end_date,
        user: payment.subscription.user,
        plan: payment.subscription.plan,
      },
      transfi_data: transfiOrderData,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
    };
  }

  @Post('payments/:id/refund')
  @ApiOperation({ summary: 'Estornar pagamento no TransFi' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Pagamento estornado' })
  async refundPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { cancel_subscription?: boolean; reason?: string }
  ): Promise<any> {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id },
      include: {
        subscription: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    if (!payment.transfi_order_id) {
      throw new BadRequestException('Este pagamento não é do TransFi');
    }

    if (payment.status === 'REFUNDED') {
      throw new BadRequestException('Pagamento já foi estornado');
    }

    try {
      // Buscar dados do cliente da assinatura para o estorno
      const subscription = await this.prisma.subscription.findUnique({
        where: { id: payment.subscription_id },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      });

      const customerEmail = subscription?.user?.email || 'refund@example.com';
      const customerName = subscription?.user?.profile?.full_name || 
                          `${subscription?.user?.email?.split('@')[0] || 'Cliente'}`;

      // Estornar no TransFi
      const refundResult = await this.transfiService.refundPayment({
        orderId: payment.transfi_order_id,
        amount: payment.amount.toNumber(),
        reason: body.reason || 'Estorno solicitado pelo administrador',
        customerEmail,
        customerName,
        originalCurrency: 'BRL', // Assumindo BRL, pode ser ajustado se necessário
      });

      // Atualizar status do pagamento
      await this.prisma.subscriptionPayment.update({
        where: { id },
        data: {
          status: 'REFUNDED',
        },
      });

      // Se solicitado, cancelar assinatura
      if (body.cancel_subscription) {
        await this.prisma.subscription.update({
          where: { id: payment.subscription_id },
          data: {
            status: 'CANCELLED',
            auto_renew: false,
          },
        });

        // Desativar usuário e remover role de subscriber
        const subscription = await this.prisma.subscription.findUnique({
          where: { id: payment.subscription_id },
          include: { user: true },
        });

        if (subscription) {
          await this.prisma.user.update({
            where: { id: subscription.user_id },
            data: {
              is_active: false,
            },
          });

          // Remover role de subscriber
          await this.prisma.userRole.deleteMany({
            where: {
              user_id: subscription.user_id,
              role: 'subscriber',
            },
          });

          this.logger.log(`Assinatura ${subscription.id} cancelada e usuário ${subscription.user.email} desativado após estorno`);
        }
      }

      return {
        success: true,
        message: 'Pagamento estornado com sucesso',
        refund: refundResult,
        subscription_cancelled: body.cancel_subscription || false,
      };
    } catch (error: any) {
      this.logger.error('[AdminTransFi] Erro ao estornar pagamento:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao estornar pagamento no TransFi'
      );
    }
  }

  @Get('webhook-logs')
  @ApiOperation({ summary: 'Listar logs de webhook do TransFi' })
  @ApiResponse({ status: 200, description: 'Lista de eventos de webhook' })
  async listWebhookLogs(
    @Query('transfi_event_type') transfi_event_type?: string,
    @Query('processed') processed?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<any[]> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (transfi_event_type) {
      where.transfi_event_type = transfi_event_type;
    }
    if (processed !== undefined) {
      where.processed = processed === 'true';
    }

    const events = await this.prisma.transFiWebhookEvent.findMany({
      where,
      orderBy: {
        created_at: 'desc',
      },
      skip,
      take: limitNum,
    });

    return events.map((e) => ({
      id: e.id,
      transfi_event_id: e.transfi_event_id,
      transfi_event_type: e.transfi_event_type,
      transfi_resource_id: e.transfi_resource_id,
      processed: e.processed,
      processed_at: e.processed_at,
      created_at: e.created_at,
      raw_payload: e.raw_payload_json,
    }));
  }

  @Get('webhook-logs/:id')
  @ApiOperation({ summary: 'Obter detalhes de um evento de webhook' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Detalhes do evento' })
  async getWebhookLog(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const event = await this.prisma.transFiWebhookEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException('Evento de webhook não encontrado');
    }

    return {
      id: event.id,
      transfi_event_id: event.transfi_event_id,
      transfi_event_type: event.transfi_event_type,
      transfi_resource_id: event.transfi_resource_id,
      processed: event.processed,
      processed_at: event.processed_at,
      created_at: event.created_at,
      raw_payload_json: event.raw_payload_json,
    };
  }

  @Post('sync-payments')
  @ApiOperation({ summary: 'Sincronizar pagamentos com TransFi (manual)' })
  @ApiResponse({ status: 200, description: 'Sincronização iniciada' })
  async syncPayments(): Promise<any> {
    try {
      // Disparar job de sincronização no BullMQ
      const bullmq = await import('bullmq');
      const Queue = bullmq.Queue;
      
      const queue = new Queue('transfi-sync', {
        connection: {
          host: this.configService.get<string>('REDIS_HOST') || 'localhost',
          port: parseInt(this.configService.get<string>('REDIS_PORT') || '16379'),
          password: this.configService.get<string>('REDIS_PASSWORD') || 'redispassword',
        },
      });

      const job = await queue.add('sync-transfi-payments', {}, {
        jobId: `manual-sync-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.log(`Job de sincronização manual criado: ${job.id}`);

      // Fechar conexão após adicionar job
      await queue.close();

      return {
        success: true,
        message: 'Sincronização iniciada. Os pagamentos serão atualizados em alguns instantes.',
        job_id: job.id,
      };
    } catch (error: any) {
      this.logger.error('Erro ao iniciar sincronização manual:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao iniciar sincronização de pagamentos'
      );
    }
  }
}
