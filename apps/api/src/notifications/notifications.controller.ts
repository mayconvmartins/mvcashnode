import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService, WhatsAppGlobalConfigDto, WhatsAppNotificationsConfigDto } from './notifications.service';
import { NotificationWrapperService } from './notification-wrapper.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { WebPushService } from '@mvcashnode/notifications';
import { PrismaService } from '@mvcashnode/db';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  private webPushService: WebPushService;

  constructor(
    private notificationsService: NotificationsService,
    private notificationWrapper: NotificationWrapperService,
    private prisma: PrismaService
  ) {
    this.webPushService = new WebPushService(prisma);
  }

  // ==================== User Config (qualquer usuário autenticado) ====================

  @Get('config')
  @ApiOperation({ 
    summary: 'Obter configuração de notificações do usuário',
    description: 'Retorna as preferências de notificação WhatsApp do usuário autenticado, incluindo quais eventos deseja receber (posições abertas, fechadas, erros, etc.) e números de telefone configurados.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuração do usuário retornada com sucesso',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'number', example: 1 },
        enabled: { type: 'boolean', example: true, description: 'Se notificações estão habilitadas' },
        phone: { type: 'string', nullable: true, example: '5511999999999', description: 'Número de telefone para receber notificações' },
        events: {
          type: 'object',
          properties: {
            positionOpened: { type: 'boolean', example: true },
            positionClosed: { type: 'boolean', example: true },
            positionSLHit: { type: 'boolean', example: true },
            positionTPHit: { type: 'boolean', example: true },
            tradeError: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  async getUserConfig(@Request() req: any) {
    return this.notificationsService.getUserConfig(req.user.userId);
  }

  @Put('config')
  @ApiOperation({ 
    summary: 'Atualizar configuração de notificações do usuário',
    description: 'Atualiza as preferências de notificação WhatsApp do usuário autenticado. Permite habilitar/desabilitar tipos específicos de eventos e configurar número de telefone.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuração atualizada com sucesso',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'number', example: 1 },
        enabled: { type: 'boolean', example: true },
        phone: { type: 'string', nullable: true, example: '5511999999999' },
        events: {
          type: 'object',
          properties: {
            positionOpened: { type: 'boolean', example: true },
            positionClosed: { type: 'boolean', example: true },
            positionSLHit: { type: 'boolean', example: true },
            positionTPHit: { type: 'boolean', example: true },
            tradeError: { type: 'boolean', example: true },
          },
        },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
      },
    },
  })
  async updateUserConfig(
    @Request() req: any,
    @Body() data: WhatsAppNotificationsConfigDto
  ) {
    return this.notificationsService.updateUserConfig(req.user.userId, data);
  }

  // ==================== Email Config ====================

  @Get('email-config')
  @ApiOperation({ 
    summary: 'Obter configuração de notificações por email do usuário',
    description: 'Retorna as preferências de notificação por email do usuário autenticado.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuração de email retornada com sucesso',
  })
  async getEmailConfig(@Request() req: any) {
    return this.notificationsService.getEmailConfig(req.user.userId);
  }

  @Put('email-config')
  @ApiOperation({ 
    summary: 'Atualizar configuração de notificações por email do usuário',
    description: 'Atualiza as preferências de notificação por email do usuário autenticado.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuração de email atualizada com sucesso',
  })
  async updateEmailConfig(
    @Request() req: any,
    @Body() data: {
      password_reset_enabled?: boolean;
      system_alerts_enabled?: boolean;
      position_opened_enabled?: boolean;
      position_closed_enabled?: boolean;
      operations_enabled?: boolean;
    }
  ) {
    return this.notificationsService.updateEmailConfig(req.user.userId, data);
  }

  // ==================== Admin: Global Config ====================

  @Get('global-config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Obter configuração global do WhatsApp (Admin)',
    description: 'Retorna a configuração global da Evolution API para envio de notificações WhatsApp. Inclui URL da API, nome da instância, chave de API e status de ativação. Apenas administradores podem acessar.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuração global retornada com sucesso',
    schema: {
      type: 'object',
      properties: {
        is_active: { type: 'boolean', example: true, description: 'Se WhatsApp está ativo' },
        api_url: { type: 'string', example: 'http://localhost:8080', description: 'URL da Evolution API' },
        api_key: { type: 'string', nullable: true, example: 'sua-api-key', description: 'Chave de API (opcional)' },
        instance_name: { type: 'string', example: 'trading-bot', description: 'Nome da instância WhatsApp' },
      },
    },
  })
  async getGlobalConfig() {
    return this.notificationsService.getGlobalConfig();
  }

  @Put('global-config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Atualizar configuração global do WhatsApp (Admin)',
    description: 'Atualiza a configuração global da Evolution API. Esta configuração é compartilhada por todos os usuários do sistema. Apenas administradores podem modificar.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Configuração global atualizada com sucesso',
    schema: {
      type: 'object',
      properties: {
        is_active: { type: 'boolean', example: true },
        api_url: { type: 'string', example: 'http://localhost:8080' },
        api_key: { type: 'string', nullable: true, example: 'sua-api-key' },
        instance_name: { type: 'string', example: 'trading-bot' },
        updated_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:30:00.000Z' },
      },
    },
  })
  async updateGlobalConfig(@Body() data: WhatsAppGlobalConfigDto) {
    return this.notificationsService.updateGlobalConfig(data);
  }

  @Post('test-connection')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Testar conexão com Evolution API (Admin)',
    description: 'Verifica se a conexão com a Evolution API está funcionando'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado do teste',
    schema: {
      example: {
        success: true,
        message: 'Conexão estabelecida com sucesso!'
      }
    }
  })
  async testConnection() {
    return this.notificationsService.testConnection();
  }

  // ==================== Admin: Statistics & History ====================

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Estatísticas de notificações (Admin)',
    description: 'Retorna estatísticas gerais de notificações WhatsApp enviadas pelo sistema, incluindo totais, taxas de sucesso/falha e distribuição por tipo de evento.',
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Estatísticas retornadas com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalSent: { type: 'number', example: 1000, description: 'Total de notificações enviadas' },
        totalSuccess: { type: 'number', example: 980, description: 'Notificações enviadas com sucesso' },
        totalFailed: { type: 'number', example: 20, description: 'Notificações que falharam' },
        byType: {
          type: 'object',
          properties: {
            positionOpened: { type: 'number', example: 200 },
            positionClosed: { type: 'number', example: 150 },
            positionSLHit: { type: 'number', example: 50 },
            positionTPHit: { type: 'number', example: 100 },
            tradeError: { type: 'number', example: 30 },
          },
        },
        last24Hours: { type: 'number', example: 50, description: 'Notificações enviadas nas últimas 24 horas' },
      },
    },
  })
  async getStats() {
    return this.notificationsService.getStats();
  }

  @Get('history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Histórico de alertas enviados (Admin)',
    description: 'Lista histórico completo de notificações WhatsApp enviadas pelo sistema, com filtros por tipo, período e paginação. Útil para auditoria e análise de envios.',
  })
  @ApiQuery({ 
    name: 'type', 
    required: false, 
    description: 'Filtrar por tipo de alerta (positionOpened, positionClosed, positionSLHit, positionTPHit, tradeError)',
    example: 'positionOpened'
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    description: 'Data inicial para filtrar histórico (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    description: 'Data final para filtrar histórico (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Número da página para paginação',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Quantidade de itens por página',
    example: 20
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Histórico de alertas retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              user_id: { type: 'number', example: 1 },
              alert_type: { type: 'string', example: 'positionOpened' },
              phone: { type: 'string', example: '5511999999999' },
              message: { type: 'string', example: 'Posição aberta: BTCUSDT' },
              status: { type: 'string', enum: ['SENT', 'FAILED'], example: 'SENT' },
              error_message: { type: 'string', nullable: true, example: null },
              created_at: { type: 'string', format: 'date-time', example: '2025-02-12T10:00:00.000Z' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            current_page: { type: 'number', example: 1 },
            per_page: { type: 'number', example: 20 },
            total_items: { type: 'number', example: 100 },
            total_pages: { type: 'number', example: 5 },
          },
        },
      },
    },
  })
  async getAlertHistory(
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.notificationsService.getAlertHistory({
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ==================== Send Test Message ====================

  @Post('send-test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Enviar mensagem de teste (Admin)',
    description: `Envia uma mensagem de teste para um número de telefone específico para verificar se a configuração do WhatsApp está funcionando corretamente.

**Uso:**
- Testar conectividade com Evolution API
- Verificar se instância WhatsApp está conectada
- Validar formato de número de telefone
- Testar templates de mensagem

**Formato do número:**
- Deve incluir código do país (ex: 55 para Brasil)
- Exemplo: '5511999999999' (Brasil + DDD + número)`,
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado do envio da mensagem de teste',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true, description: 'Se a mensagem foi enviada com sucesso' },
        message: { type: 'string', example: 'Mensagem enviada com sucesso!', description: 'Mensagem descritiva do resultado' },
        endpoint: { type: 'string', nullable: true, example: 'http://localhost:8080/message/sendText/trading-bot', description: 'Endpoint da Evolution API usado (se sucesso)' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'WhatsApp não configurado, instância não conectada ou número inválido',
    schema: {
      example: {
        success: false,
        message: 'WhatsApp não está configurado ou ativo',
      },
    },
  })
  async sendTestMessage(@Body() data: { phone: string; message?: string }) {
    const config = await this.notificationsService.getGlobalConfig();
    
    if (!config.is_active || !config.api_url) {
      return {
        success: false,
        message: 'WhatsApp não está configurado ou ativo',
      };
    }

    // Normalizar URL da API (remover barra final se houver)
    const apiUrl = config.api_url.replace(/\/+$/, '');
    
    // Normalizar número de telefone (remover caracteres não numéricos e adicionar código do país se necessário)
    let phone = data.phone.replace(/\D/g, '');
    if (!phone.startsWith('55') && phone.length <= 11) {
      phone = '55' + phone;
    }

    // Se mensagem não fornecida, usar template
    let messageText = data.message;
    if (!messageText) {
      try {
        // Usar NotificationWrapperService para enviar com template
        await this.notificationWrapper.sendTestMessage(phone, config);
        return {
          success: true,
          message: 'Mensagem de teste enviada com sucesso usando template!',
        };
      } catch (templateError: any) {
        // Se template falhar, usar mensagem padrão
        console.warn(`[WHATSAPP] Erro ao usar template, usando mensagem padrão: ${templateError.message}`);
        messageText = '🔔 Teste de notificação do Trading Automation System';
      }
    }
    
    console.log(`[WHATSAPP] Enviando mensagem de teste para: ${phone}`);
    console.log(`[WHATSAPP] API URL: ${apiUrl}`);
    console.log(`[WHATSAPP] Instância: ${config.instance_name}`);

    // Lista de endpoints para tentar (diferentes versões da Evolution API)
    const endpointsToTry = [
      // Evolution API v2 - formato mais comum
      {
        url: `${apiUrl}/message/sendText/${config.instance_name}`,
        body: { number: phone, text: messageText },
      },
      // Formato alternativo v2
      {
        url: `${apiUrl}/message/sendText/${config.instance_name}`,
        body: { number: `${phone}@s.whatsapp.net`, textMessage: { text: messageText } },
      },
      // Evolution API v1 - formato antigo
      {
        url: `${apiUrl}/instance/${config.instance_name}/send-text`,
        body: { number: phone, text: messageText },
      },
      // Formato com options
      {
        url: `${apiUrl}/message/sendText/${config.instance_name}`,
        body: { 
          number: phone, 
          options: { delay: 1200, presence: 'composing' },
          textMessage: { text: messageText }
        },
      },
    ];

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`[WHATSAPP] Tentando endpoint: ${endpoint.url}`);
        console.log(`[WHATSAPP] Body:`, JSON.stringify(endpoint.body));
        
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.api_key && { 'apikey': config.api_key }),
          },
          body: JSON.stringify(endpoint.body),
        });

        console.log(`[WHATSAPP] Resposta: ${response.status}`);

        if (response.ok) {
          const responseData = await response.json().catch(() => ({}));
          console.log(`[WHATSAPP] Sucesso! Resposta:`, responseData);
          
          return {
            success: true,
            message: 'Mensagem enviada com sucesso!',
            endpoint: endpoint.url,
          };
        }

        const errorData = await response.text();
        console.log(`[WHATSAPP] Erro no endpoint ${endpoint.url}: ${response.status} - ${errorData}`);
        
        // Se recebeu 404, tentar próximo endpoint
        if (response.status === 404) {
          continue;
        }
        
        // Se recebeu outro erro, retornar
        return {
          success: false,
          message: `Erro ao enviar: ${response.status} - ${errorData}`,
        };
      } catch (error: any) {
        console.log(`[WHATSAPP] Exceção no endpoint ${endpoint.url}: ${error.message}`);
        // Continuar para o próximo endpoint
      }
    }

    return {
      success: false,
      message: `Não foi possível enviar a mensagem. Verifique se a instância "${config.instance_name}" está conectada e a URL da API está correta.`,
    };
  }

  // ==================== Web Push Notifications ====================

  @Get('webpush/vapid-public-key')
  @ApiOperation({
    summary: 'Obter chave pública VAPID',
    description: 'Retorna a chave pública VAPID para configurar Web Push no frontend',
  })
  @ApiResponse({
    status: 200,
    description: 'Chave pública retornada',
    schema: {
      type: 'object',
      properties: {
        publicKey: { type: 'string', nullable: true },
        enabled: { type: 'boolean' },
      },
    },
  })
  async getVapidPublicKey() {
    return {
      publicKey: this.webPushService.getVapidPublicKey(),
      enabled: this.webPushService.isEnabled(),
    };
  }

  @Post('webpush/subscribe')
  @ApiOperation({
    summary: 'Registrar subscription de Web Push',
    description: 'Registra uma nova subscription para receber notificações push',
  })
  @ApiResponse({
    status: 201,
    description: 'Subscription registrada com sucesso',
  })
  async subscribeWebPush(
    @Request() req: any,
    @Body() body: { 
      subscription: { 
        endpoint: string; 
        keys: { p256dh: string; auth: string } 
      };
      deviceName?: string;
    }
  ) {
    await this.webPushService.subscribe(
      req.user.userId,
      {
        endpoint: body.subscription.endpoint,
        p256dh: body.subscription.keys.p256dh,
        auth: body.subscription.keys.auth,
      },
      req.get('user-agent'),
      body.deviceName
    );
    return { success: true, message: 'Subscription registrada com sucesso' };
  }

  @Delete('webpush/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover subscription de Web Push',
    description: 'Remove uma subscription de notificações push',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription removida com sucesso',
  })
  async unsubscribeWebPush(
    @Request() req: any,
    @Body() body: { endpoint: string }
  ) {
    await this.webPushService.unsubscribe(req.user.userId, body.endpoint);
    return { success: true, message: 'Subscription removida com sucesso' };
  }

  @Get('webpush/subscriptions')
  @ApiOperation({
    summary: 'Listar subscriptions de Web Push',
    description: 'Lista todas as subscriptions ativas do usuário',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de subscriptions',
  })
  async listWebPushSubscriptions(@Request() req: any) {
    return this.webPushService.listSubscriptions(req.user.userId);
  }

  @Post('webpush/test')
  @ApiOperation({
    summary: 'Enviar notificação de teste',
    description: 'Envia uma notificação push de teste para o usuário',
  })
  @ApiResponse({
    status: 200,
    description: 'Notificação enviada',
  })
  async sendTestWebPush(@Request() req: any) {
    const result = await this.webPushService.sendToUser(
      req.user.userId,
      {
        title: 'MVCash Trading',
        body: 'Esta é uma notificação de teste. As notificações push estão funcionando!',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: {
          url: '/',
        },
      },
      'TEST_MESSAGE'
    );
    return result;
  }
}

