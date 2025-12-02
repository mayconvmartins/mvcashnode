import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';
import { TemplateService, NotificationTemplateType } from '@mvcashnode/notifications';

export interface CreateTemplateDto {
  template_type: NotificationTemplateType;
  name: string;
  subject?: string;
  body: string;
  variables_json?: any;
  is_active?: boolean;
}

export interface UpdateTemplateDto {
  name?: string;
  subject?: string;
  body?: string;
  variables_json?: any;
  is_active?: boolean;
}

export interface PreviewTemplateDto {
  variables?: Record<string, any>;
}

@ApiTags('Admin')
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminNotificationsController {
  private templateService: TemplateService;

  constructor(private prisma: PrismaService) {
    this.templateService = new TemplateService();
  }

  @Get('templates')
  @ApiOperation({
    summary: 'Listar todos os templates de notificação',
    description: 'Retorna todos os templates cadastrados, ordenados por tipo e data de atualização',
  })
  @ApiResponse({ status: 200, description: 'Lista de templates' })
  async listTemplates(): Promise<any[]> {
    const templates = await this.prisma.whatsAppNotificationTemplate.findMany({
      orderBy: [
        { template_type: 'asc' },
        { updated_at: 'desc' },
      ],
    });

    return templates;
  }

  @Get('templates/:id')
  @ApiOperation({
    summary: 'Obter template por ID',
    description: 'Retorna os detalhes de um template específico',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do template' })
  @ApiResponse({ status: 200, description: 'Template encontrado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  async getTemplate(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const template = await this.prisma.whatsAppNotificationTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new Error('Template não encontrado');
    }

    return template;
  }

  @Get('templates/type/:type')
  @ApiOperation({
    summary: 'Obter template ativo por tipo',
    description: 'Retorna o template ativo para um tipo específico',
  })
  @ApiParam({ name: 'type', type: 'string', description: 'Tipo do template' })
  @ApiResponse({ status: 200, description: 'Template encontrado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  async getTemplateByType(@Param('type') type: NotificationTemplateType): Promise<any> {
    const template = await this.prisma.whatsAppNotificationTemplate.findFirst({
      where: {
        template_type: type,
        is_active: true,
      },
      orderBy: {
        updated_at: 'desc',
      },
    });

    if (!template) {
      throw new Error(`Template ativo do tipo ${type} não encontrado`);
    }

    return template;
  }

  @Post('templates')
  @ApiOperation({
    summary: 'Criar novo template',
    description: 'Cria um novo template de notificação',
  })
  @ApiResponse({ status: 201, description: 'Template criado com sucesso' })
  async createTemplate(@Body() data: CreateTemplateDto): Promise<any> {
    // Validar variáveis no template
    const variables = this.templateService.extractVariables(data.body);
    
    const template = await this.prisma.whatsAppNotificationTemplate.create({
      data: {
        template_type: data.template_type,
        name: data.name,
        subject: data.subject,
        body: data.body,
        variables_json: data.variables_json || { available: variables },
        is_active: data.is_active ?? true,
      },
    });

    return template;
  }

  @Put('templates/:id')
  @ApiOperation({
    summary: 'Atualizar template',
    description: 'Atualiza um template existente',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do template' })
  @ApiResponse({ status: 200, description: 'Template atualizado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  async updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateTemplateDto
  ): Promise<any> {
    const existing = await this.prisma.whatsAppNotificationTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Template não encontrado');
    }

    // Se body foi atualizado, recalcular variáveis
    let variables_json = data.variables_json || existing.variables_json;
    if (data.body) {
      const variables = this.templateService.extractVariables(data.body);
      variables_json = { available: variables };
    }

    const template = await this.prisma.whatsAppNotificationTemplate.update({
      where: { id },
      data: {
        name: data.name,
        subject: data.subject,
        body: data.body,
        variables_json,
        is_active: data.is_active,
      },
    });

    return template;
  }

  @Delete('templates/:id')
  @ApiOperation({
    summary: 'Deletar template',
    description: 'Remove um template do sistema',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do template' })
  @ApiResponse({ status: 200, description: 'Template deletado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  async deleteTemplate(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    const existing = await this.prisma.whatsAppNotificationTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Template não encontrado');
    }

    await this.prisma.whatsAppNotificationTemplate.delete({
      where: { id },
    });

    return { message: 'Template deletado com sucesso' };
  }

  @Post('templates/:id/preview')
  @ApiOperation({
    summary: 'Preview do template com dados de exemplo',
    description: 'Renderiza o template com variáveis de exemplo para visualização',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do template' })
  @ApiResponse({ status: 200, description: 'Preview renderizado' })
  async previewTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: PreviewTemplateDto
  ): Promise<any> {
    const template = await this.prisma.whatsAppNotificationTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new Error('Template não encontrado');
    }

    // Se variáveis foram fornecidas, usar elas; senão, gerar exemplos
    const variables = data.variables || this.generateExampleVariables(template.template_type as NotificationTemplateType);

    const rendered = this.templateService.renderTemplate(template.body, variables);

    return {
      template,
      variables,
      rendered,
    };
  }

  @Post('templates/:id/set-active')
  @ApiOperation({
    summary: 'Definir template como ativo',
    description: 'Ativa este template e desativa outros do mesmo tipo',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'ID do template' })
  @ApiResponse({ status: 200, description: 'Template ativado' })
  async setTemplateActive(@Param('id', ParseIntPipe) id: number): Promise<any> {
    const template = await this.prisma.whatsAppNotificationTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new Error('Template não encontrado');
    }

    // Desativar outros templates do mesmo tipo
    await this.prisma.whatsAppNotificationTemplate.updateMany({
      where: {
        template_type: template.template_type,
        id: { not: id },
      },
      data: {
        is_active: false,
      },
    });

    // Ativar este template
    const updated = await this.prisma.whatsAppNotificationTemplate.update({
      where: { id },
      data: {
        is_active: true,
      },
    });

    return updated;
  }

  /**
   * Gera variáveis de exemplo baseado no tipo de template
   */
  private generateExampleVariables(type: NotificationTemplateType): Record<string, any> {
    const now = new Date();
    
    switch (type) {
      case 'WEBHOOK_RECEIVED':
        return {
          'source.label': 'TradingView Principal',
          'symbol': 'SOLUSDT',
          'action': 'BUY',
          'price': '215.81',
          'timeframe': 'H1',
          'originalText': 'SOLUSDT.P Caça Fundo 🟢 (H1) Preço (215.81)',
          'datetime': now,
          'emoji': '🟢',
        };
      
      case 'TEST_MESSAGE':
        return {
          'instanceName': 'minha-instancia',
          'datetime': now,
        };
      
      case 'POSITION_OPENED':
        return {
          'account.label': 'Conta Principal',
          'symbol': 'SOLUSDT',
          'position.id': '123',
          'position.idShort': 'POS-A1B2C3D4',
          'qty': 0.45,
          'avgPrice': 215.81,
          'total': 97.11,
          'commission': 0.00033750,
          'commissionAsset': 'BNB',
          'autoAdjusted': '*Auto-ajustada* (mínimo Binance)',
          'datetime': now,
        };
      
      case 'POSITION_CLOSED':
        return {
          'account.label': 'Conta Principal',
          'symbol': 'SOLUSDT',
          'position.id': '123',
          'position.idShort': 'POS-A1B2C3D4',
          'buyQty': 0.45,
          'buyAvgPrice': 215.81,
          'buyTotal': 97.11,
          'sellQty': 0.45,
          'sellAvgPrice': 220.50,
          'sellTotal': 99.23,
          'profitPct': 2.18,
          'profit': 2.12,
          'duration': '3h 45min',
          'closeReason': '🎯 *Fechado por Take Profit*',
          'datetime': now,
        };
      
      case 'STOP_LOSS_TRIGGERED':
        return {
          'account.label': 'Conta Principal',
          'symbol': 'SOLUSDT',
          'position.id': '123',
          'position.idShort': 'POS-A1B2C3D4',
          'qty': 0.45,
          'profitPct': -3.50,
          'sellPrice': 208.25,
          'total': 93.71,
          'limitPct': -3.5,
          'datetime': now,
        };
      
      case 'PARTIAL_TP_TRIGGERED':
        return {
          'account.label': 'Conta Principal',
          'symbol': 'SOLUSDT',
          'position.id': '123',
          'position.idShort': 'POS-A1B2C3D4',
          'qtySold': 0.225,
          'qtyRemaining': 0.225,
          'profitPct': 5.25,
          'sellPrice': 227.14,
          'total': 51.11,
          'datetime': now,
        };
      
      default:
        return {};
    }
  }
}

