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
import { MercadoPagoService } from '../subscriptions/mercadopago.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Admin - Mercado Pago')
@Controller('admin/mercadopago')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminMercadoPagoController {
  private readonly logger = new Logger(AdminMercadoPagoController.name);

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
        // Atualizar existente - construir objeto de dados dinamicamente
        const updateData: any = {
          access_token_enc: accessTokenEnc,
          public_key: body.public_key,
          environment: body.environment,
          webhook_url: webhookUrl,
          is_active: body.is_active ?? existing.is_active,
        };
        
        // Só atualizar webhook_secret_enc se foi fornecido um novo valor
        if (body.webhook_secret && body.webhook_secret.trim() !== '') {
          updateData.webhook_secret_enc = webhookSecretEnc;
        }
        
        return this.prisma.mercadoPagoConfig.update({
          where: { id: existing.id },
          data: updateData,
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
      this.logger.error('[AdminMercadoPago] Erro ao salvar configuração:', error);
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      // Log detalhado do erro
      console.error('[AdminMercadoPago] Erro completo:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
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

  @Get('payments')
  @ApiOperation({ summary: 'Listar pagamentos do Mercado Pago' })
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
      mp_payment_id: p.mp_payment_id,
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

    // Buscar informações atualizadas do Mercado Pago
    let mpPaymentData = null;
    try {
      mpPaymentData = await this.mercadoPagoService.getPayment(payment.mp_payment_id);
    } catch (error) {
      this.logger.warn(`Não foi possível buscar dados atualizados do MP para pagamento ${payment.mp_payment_id}`);
    }

    return {
      id: payment.id,
      mp_payment_id: payment.mp_payment_id,
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
      mp_data: mpPaymentData,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
    };
  }

  @Post('payments/:id/refund')
  @ApiOperation({ summary: 'Estornar pagamento no Mercado Pago' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Pagamento estornado' })
  async refundPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { cancel_subscription?: boolean }
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

    if (payment.status === 'REFUNDED') {
      throw new BadRequestException('Pagamento já foi estornado');
    }

    try {
      // Estornar no Mercado Pago
      const refundResult = await this.mercadoPagoService.refundPayment(
        payment.mp_payment_id,
        payment.amount.toNumber()
      );

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
      this.logger.error('[AdminMercadoPago] Erro ao estornar pagamento:', error);
      throw new BadRequestException(
        error?.message || 'Erro ao estornar pagamento no Mercado Pago'
      );
    }
  }

  @Get('webhook-logs')
  @ApiOperation({ summary: 'Listar logs de webhook do Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Lista de eventos de webhook' })
  async listWebhookLogs(
    @Query('mp_event_type') mp_event_type?: string,
    @Query('processed') processed?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<any[]> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (mp_event_type) {
      where.mp_event_type = mp_event_type;
    }
    if (processed !== undefined) {
      where.processed = processed === 'true';
    }

    const events = await this.prisma.subscriptionWebhookEvent.findMany({
      where,
      orderBy: {
        created_at: 'desc',
      },
      skip,
      take: limitNum,
    });

    return events.map((e) => ({
      id: e.id,
      mp_event_id: e.mp_event_id,
      mp_event_type: e.mp_event_type,
      mp_resource_id: e.mp_resource_id,
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
    const event = await this.prisma.subscriptionWebhookEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException('Evento de webhook não encontrado');
    }

    return {
      id: event.id,
      mp_event_id: event.mp_event_id,
      mp_event_type: event.mp_event_type,
      mp_resource_id: event.mp_resource_id,
      processed: event.processed,
      processed_at: event.processed_at,
      created_at: event.created_at,
      raw_payload_json: event.raw_payload_json,
    };
  }

  @Post('sync-payments')
  @ApiOperation({ summary: 'Sincronizar pagamentos com Mercado Pago (manual)' })
  @ApiResponse({ status: 200, description: 'Sincronização iniciada' })
  async syncPayments(): Promise<any> {
    try {
      // Disparar job de sincronização no BullMQ
      // Usar import dinâmico para evitar dependência direta
      const bullmq = await import('bullmq');
      const Queue = bullmq.Queue;
      
      const queue = new Queue('mercadopago-sync', {
        connection: {
          host: this.configService.get<string>('REDIS_HOST') || 'localhost',
          port: parseInt(this.configService.get<string>('REDIS_PORT') || '16379'),
          password: this.configService.get<string>('REDIS_PASSWORD') || 'redispassword',
        },
      });

      const job = await queue.add('sync-mercadopago-payments', {}, {
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
