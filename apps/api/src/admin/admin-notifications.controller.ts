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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@mvcashnode/shared';
import { PrismaService } from '@mvcashnode/db';
import { TemplateService, NotificationTemplateType } from '@mvcashnode/notifications';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

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

@ApiTags('Admin - Email')
@Controller('admin/emails')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminEmailController {
  private emailService: any;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService
  ) {
    // Inicializar EmailService se configurado
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    
    if (smtpHost && smtpUser && smtpPass) {
      const { EmailService } = require('@mvcashnode/notifications');
      this.emailService = new EmailService(this.prisma as any, {
        host: smtpHost,
        port: parseInt(this.configService.get<string>('SMTP_PORT') || '2525'),
        user: smtpUser,
        password: smtpPass,
        from: this.configService.get<string>('SMTP_FROM') || 'noreply.mvcash@mvmdev.com',
      });
    }
  }

  @Get('history')
  @ApiOperation({ summary: 'Listar histórico de emails enviados' })
  @ApiResponse({ status: 200, description: 'Histórico de emails' })
  async getEmailHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('template_type') templateType?: string,
    @Query('status') status?: string,
    @Query('recipient') recipient?: string
  ): Promise<any> {
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (templateType) {
      where.template_type = templateType;
    }
    if (status) {
      where.status = status;
    }
    if (recipient) {
      where.recipient = { contains: recipient };
    }

    const [emails, total] = await Promise.all([
      this.prisma.emailNotificationLog.findMany({
        where,
        orderBy: { sent_at: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.emailNotificationLog.count({ where }),
    ]);

    return {
      items: emails,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  @Get('history/stats')
  @ApiOperation({ summary: 'Estatísticas de emails enviados' })
  @ApiResponse({ status: 200, description: 'Estatísticas de emails' })
  async getEmailStats(): Promise<any> {
    const [total, sent, failed, byType] = await Promise.all([
      this.prisma.emailNotificationLog.count(),
      this.prisma.emailNotificationLog.count({ where: { status: 'sent' } }),
      this.prisma.emailNotificationLog.count({ where: { status: 'failed' } }),
      this.prisma.emailNotificationLog.groupBy({
        by: ['template_type'],
        _count: { template_type: true },
      }),
    ]);

    const last24Hours = await this.prisma.emailNotificationLog.count({
      where: {
        sent_at: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        status: 'sent',
      },
    });

    return {
      total,
      sent,
      failed,
      successRate: total > 0 ? ((sent / total) * 100).toFixed(2) : '0.00',
      byType: byType.reduce((acc, item) => {
        acc[item.template_type] = item._count.template_type;
        return acc;
      }, {} as Record<string, number>),
      last24Hours,
    };
  }

  @Post('test')
  @ApiOperation({ summary: 'Enviar email de teste' })
  @ApiResponse({ status: 200, description: 'Email de teste enviado' })
  async sendTestEmail(
    @Body() body: { email: string; subject?: string; message?: string }
  ): Promise<any> {
    if (!this.emailService) {
      return {
        success: false,
        message: 'EmailService não configurado. Verifique as variáveis de ambiente SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS).',
      };
    }

    try {
      await this.emailService.sendTestEmail(body.email, body.subject, body.message);
      return {
        success: true,
        message: 'Email de teste enviado com sucesso',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Erro ao enviar email de teste',
      };
    }
  }
}

@ApiTags('Admin - Email Templates')
@Controller('admin/email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminEmailTemplatesController {
  private readonly templatesDir: string;

  constructor() {
    // Caminho para os templates de email
    // Tentar múltiplos caminhos possíveis (desenvolvimento e produção)
    const possiblePaths = [
      path.resolve(process.cwd(), 'packages/notifications/src/email-templates'),
      path.resolve(__dirname, '../../../../packages/notifications/src/email-templates'),
      path.resolve(__dirname, '../../../packages/notifications/src/email-templates'),
    ];
    
    let templatesDir: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        templatesDir = possiblePath;
        break;
      }
    }
    
    if (!templatesDir) {
      // Se não encontrar, usar o primeiro caminho como padrão
      templatesDir = possiblePaths[0];
      console.warn(`[AdminEmailTemplatesController] Diretório de templates não encontrado, usando: ${templatesDir}`);
    }
    
    this.templatesDir = templatesDir;
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os templates de email' })
  @ApiResponse({ status: 200, description: 'Lista de templates de email' })
  async listEmailTemplates(): Promise<any[]> {
    try {
      const files = fs.readdirSync(this.templatesDir);
      const templates = files
        .filter(file => file.endsWith('.html'))
        .map(file => {
          const templateName = file.replace('.html', '');
          const filePath = path.join(this.templatesDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Extrair variáveis do template
          const variableRegex = /\{([^}]+)\}/g;
          const variables: string[] = [];
          let match;
          while ((match = variableRegex.exec(content)) !== null) {
            if (!variables.includes(match[1])) {
              variables.push(match[1]);
            }
          }

          return {
            name: templateName,
            filename: file,
            content: content,
            variables: variables,
            size: content.length,
            lastModified: fs.statSync(filePath).mtime,
          };
        });

      return templates;
    } catch (error: any) {
      throw new Error(`Erro ao listar templates: ${error.message}`);
    }
  }

  @Get(':name')
  @ApiOperation({ summary: 'Obter template de email por nome' })
  @ApiParam({ name: 'name', type: 'string', description: 'Nome do template (sem extensão .html)' })
  @ApiResponse({ status: 200, description: 'Template encontrado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  async getEmailTemplate(@Param('name') name: string): Promise<any> {
    try {
      const filePath = path.join(this.templatesDir, `${name}.html`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`Template ${name} não encontrado`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Extrair variáveis do template
      const variableRegex = /\{([^}]+)\}/g;
      const variables: string[] = [];
      let match;
      while ((match = variableRegex.exec(content)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }

      return {
        name: name,
        filename: `${name}.html`,
        content: content,
        variables: variables,
        size: content.length,
        lastModified: fs.statSync(filePath).mtime,
      };
    } catch (error: any) {
      if (error.message.includes('não encontrado')) {
        throw new Error(error.message);
      }
      throw new Error(`Erro ao obter template: ${error.message}`);
    }
  }

  @Put(':name')
  @ApiOperation({ summary: 'Atualizar template de email' })
  @ApiParam({ name: 'name', type: 'string', description: 'Nome do template (sem extensão .html)' })
  @ApiResponse({ status: 200, description: 'Template atualizado' })
  @ApiResponse({ status: 404, description: 'Template não encontrado' })
  async updateEmailTemplate(
    @Param('name') name: string,
    @Body() body: { content: string }
  ): Promise<any> {
    try {
      const filePath = path.join(this.templatesDir, `${name}.html`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`Template ${name} não encontrado`);
      }

      // Validar que o conteúdo não está vazio
      if (!body.content || body.content.trim().length === 0) {
        throw new Error('Conteúdo do template não pode estar vazio');
      }

      // Salvar o template
      fs.writeFileSync(filePath, body.content, 'utf-8');

      // Extrair variáveis do template atualizado
      const variableRegex = /\{([^}]+)\}/g;
      const variables: string[] = [];
      let match;
      while ((match = variableRegex.exec(body.content)) !== null) {
        if (!variables.includes(match[1])) {
          variables.push(match[1]);
        }
      }

      return {
        name: name,
        filename: `${name}.html`,
        content: body.content,
        variables: variables,
        size: body.content.length,
        lastModified: fs.statSync(filePath).mtime,
        message: 'Template atualizado com sucesso',
      };
    } catch (error: any) {
      if (error.message.includes('não encontrado') || error.message.includes('não pode estar vazio')) {
        throw new Error(error.message);
      }
      throw new Error(`Erro ao atualizar template: ${error.message}`);
    }
  }

  @Post(':name/preview')
  @ApiOperation({ summary: 'Preview do template de email com dados de exemplo' })
  @ApiParam({ name: 'name', type: 'string', description: 'Nome do template (sem extensão .html)' })
  @ApiResponse({ status: 200, description: 'Preview renderizado' })
  async previewEmailTemplate(
    @Param('name') name: string,
    @Body() body?: { variables?: Record<string, any> }
  ): Promise<any> {
    try {
      const filePath = path.join(this.templatesDir, `${name}.html`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`Template ${name} não encontrado`);
      }

      const template = fs.readFileSync(filePath, 'utf-8');
      const templateService = new TemplateService();

      // Gerar variáveis de exemplo se não fornecidas
      const exampleVariables = body?.variables || this.generateExampleVariables(name);

      const rendered = templateService.renderTemplate(template, exampleVariables);

      return {
        template: {
          name: name,
          content: template,
        },
        variables: exampleVariables,
        rendered: rendered,
      };
    } catch (error: any) {
      throw new Error(`Erro ao gerar preview: ${error.message}`);
    }
  }

  /**
   * Gera variáveis de exemplo baseado no nome do template
   */
  private generateExampleVariables(templateName: string): Record<string, any> {
    const now = new Date();
    
    switch (templateName) {
      case 'password-reset':
        return {
          'resetUrl': 'https://app.mvcash.com.br/reset-password?token=abc123',
          'resetToken': 'abc123',
          'email': 'usuario@exemplo.com',
          'datetime': now,
        };
      
      case 'password-reset-confirmation':
        return {
          'email': 'usuario@exemplo.com',
          'datetime': now,
        };
      
      case 'subscription-activated':
        return {
          'planName': 'Plano Premium',
          'loginUrl': 'https://app.mvcash.com.br/login',
          'email': 'usuario@exemplo.com',
          'endDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
          'datetime': now,
        };
      
      case 'payment-confirmed':
        return {
          'planName': 'Plano Premium',
          'amount': '99.90',
          'paymentMethod': 'PIX',
          'registrationUrl': 'https://app.mvcash.com.br/subscribe/register?email=usuario@exemplo.com',
          'endDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          'datetime': now,
        };
      
      case 'position-opened':
        return {
          'account.label': 'Conta Principal',
          'symbol': 'SOLUSDT',
          'position.id': '123',
          'qty': 0.45,
          'avgPrice': 215.81,
          'total': 97.11,
          'datetime': now,
        };
      
      case 'position-closed':
        return {
          'account.label': 'Conta Principal',
          'symbol': 'SOLUSDT',
          'position.id': '123',
          'buyQty': 0.45,
          'buyAvgPrice': 215.81,
          'buyTotal': 97.11,
          'sellQty': 0.45,
          'sellAvgPrice': 220.50,
          'sellTotal': 99.23,
          'profit': 2.12,
          'profitPct': 2.18,
          'duration': '3h 45min',
          'closeReason': 'Take Profit',
          'datetime': now,
        };
      
      case 'system-alert':
        return {
          'alertType': 'Sistema Crítico',
          'severity': 'high',
          'message': 'Erro ao conectar com exchange',
          'serviceName': 'Binance API',
          'metadata': JSON.stringify({ error: 'Connection timeout' }, null, 2),
          'datetime': now,
        };
      
      case 'operation-alert':
        return {
          'operationType': 'Stop Loss',
          'message': 'Stop Loss acionado para posição SOLUSDT',
          'details': JSON.stringify({ positionId: 123, price: 210.50 }, null, 2),
          'datetime': now,
        };
      
      default:
        return {
          'datetime': now,
        };
    }
  }
}

