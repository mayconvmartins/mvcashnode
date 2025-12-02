import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
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

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private notificationWrapper: NotificationWrapperService
  ) {}

  // ==================== User Config (qualquer usuário autenticado) ====================

  @Get('config')
  @ApiOperation({ 
    summary: 'Obter configuração de notificações do usuário',
    description: 'Retorna as preferências de notificação do usuário logado'
  })
  @ApiResponse({ status: 200, description: 'Configuração do usuário' })
  async getUserConfig(@Request() req: any) {
    return this.notificationsService.getUserConfig(req.user.userId);
  }

  @Put('config')
  @ApiOperation({ 
    summary: 'Atualizar configuração de notificações do usuário',
    description: 'Atualiza as preferências de notificação do usuário logado'
  })
  @ApiResponse({ status: 200, description: 'Configuração atualizada' })
  async updateUserConfig(
    @Request() req: any,
    @Body() data: WhatsAppNotificationsConfigDto
  ) {
    return this.notificationsService.updateUserConfig(req.user.userId, data);
  }

  // ==================== Admin: Global Config ====================

  @Get('global-config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Obter configuração global do WhatsApp (Admin)',
    description: 'Retorna a configuração global da Evolution API'
  })
  @ApiResponse({ status: 200, description: 'Configuração global' })
  async getGlobalConfig() {
    return this.notificationsService.getGlobalConfig();
  }

  @Put('global-config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Atualizar configuração global do WhatsApp (Admin)',
    description: 'Atualiza a configuração da Evolution API'
  })
  @ApiResponse({ status: 200, description: 'Configuração atualizada' })
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
    description: 'Retorna estatísticas gerais de notificações enviadas'
  })
  @ApiResponse({ status: 200, description: 'Estatísticas' })
  async getStats() {
    return this.notificationsService.getStats();
  }

  @Get('history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Histórico de alertas enviados (Admin)',
    description: 'Lista alertas enviados com filtros'
  })
  @ApiQuery({ name: 'type', required: false, description: 'Tipo de alerta' })
  @ApiQuery({ name: 'from', required: false, description: 'Data inicial' })
  @ApiQuery({ name: 'to', required: false, description: 'Data final' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Histórico de alertas' })
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
    description: 'Envia uma mensagem de teste para um número específico'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resultado do envio',
    schema: {
      example: {
        success: true,
        message: 'Mensagem enviada com sucesso!'
      }
    }
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
}

