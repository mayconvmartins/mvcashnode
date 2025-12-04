import * as nodemailer from 'nodemailer';
import { PrismaClient } from '@mvcashnode/db';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateService, TemplateVariables } from './template.service';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private templateService: TemplateService;

  constructor(
    private prisma: PrismaClient,
    private config: {
      host: string;
      port: number;
      user: string;
      password: string;
      from: string;
    }
  ) {
    this.templateService = new TemplateService();
    
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: false, // true para 465, false para outras portas
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }

  /**
   * Método genérico para enviar email
   */
  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    try {
      // Verificar se o transporter está configurado
      if (!this.transporter) {
        const errorMsg = 'Transporter de email não está configurado. Verifique as variáveis de ambiente SMTP.';
        console.error(`[EMAIL] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const mailOptions = {
        from: this.config.from,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      console.log(`[EMAIL] Enviando email para ${to} com assunto: ${subject}`);
      await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL] ✅ Email enviado com sucesso para ${to}`);

      // Registrar no log
      await this.logEmail('GENERIC', to, subject, 'sent');
    } catch (error: any) {
      const errorMsg = error.message || 'Erro desconhecido ao enviar email';
      console.error(`[EMAIL] ❌ Erro ao enviar email para ${to}:`, errorMsg);
      console.error(`[EMAIL] Detalhes do erro:`, {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        errno: error.errno,
        syscall: error.syscall,
        hostname: error.hostname,
        port: error.port,
      });
      
      // Registrar erro no log
      await this.logEmail('GENERIC', to, subject, 'failed', errorMsg);
      throw error;
    }
  }

  /**
   * Envia email de reset de senha
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    resetUrl: string
  ): Promise<void> {
    const template = await this.loadTemplate('password-reset');
    const variables: TemplateVariables = {
      'resetUrl': resetUrl,
      'resetToken': resetToken,
      'email': email,
      'datetime': new Date(),
    };

    const html = this.templateService.renderTemplate(template, variables);
    const subject = 'Recuperação de Senha - Trading Automation';

    try {
      await this.sendEmail(email, subject, html);
      await this.logEmail('PASSWORD_RESET', email, subject, 'sent');
    } catch (error: any) {
      await this.logEmail('PASSWORD_RESET', email, subject, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Envia email de confirmação de reset de senha
   */
  async sendPasswordResetConfirmationEmail(email: string): Promise<void> {
    const template = await this.loadTemplate('password-reset-confirmation');
    const variables: TemplateVariables = {
      'email': email,
      'datetime': new Date(),
    };

    const html = this.templateService.renderTemplate(template, variables);
    const subject = 'Senha Alterada com Sucesso - Trading Automation';

    try {
      await this.sendEmail(email, subject, html);
      await this.logEmail('PASSWORD_RESET_CONFIRMATION', email, subject, 'sent');
    } catch (error: any) {
      await this.logEmail('PASSWORD_RESET_CONFIRMATION', email, subject, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Envia alerta de saúde do sistema
   */
  async sendSystemHealthAlert(email: string, alert: {
    alertType: string;
    severity: string;
    message: string;
    serviceName?: string;
    metadata?: any;
  }): Promise<void> {
    const template = await this.loadTemplate('system-alert');
    const variables: TemplateVariables = {
      'alertType': alert.alertType,
      'severity': alert.severity,
      'message': alert.message,
      'serviceName': alert.serviceName || 'Sistema',
      'metadata': JSON.stringify(alert.metadata || {}, null, 2),
      'datetime': new Date(),
    };

    const html = this.templateService.renderTemplate(template, variables);
    const subject = `Alerta de Sistema - ${alert.severity.toUpperCase()}: ${alert.alertType}`;

    try {
      await this.sendEmail(email, subject, html);
      await this.logEmail('SYSTEM_ALERT', email, subject, 'sent');
    } catch (error: any) {
      await this.logEmail('SYSTEM_ALERT', email, subject, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Envia email de posição aberta
   */
  async sendPositionOpenedEmail(email: string, positionData: {
    accountLabel: string;
    symbol: string;
    positionId: string;
    qty: number;
    avgPrice: number;
    total: number;
    datetime: Date;
  }): Promise<void> {
    const subject = `Posição Aberta - ${positionData.symbol}`;
    
    try {
      // Verificar se o transporter está configurado
      if (!this.transporter) {
        const errorMsg = 'Transporter de email não está configurado';
        console.error(`[EMAIL] ${errorMsg}`);
        await this.logEmail('POSITION_OPENED', email, subject, 'failed', errorMsg);
        throw new Error(errorMsg);
      }

      // Carregar template
      let template: string;
      try {
        template = await this.loadTemplate('position-opened');
        console.log(`[EMAIL] Template 'position-opened' carregado com sucesso`);
      } catch (templateError: any) {
        console.error(`[EMAIL] Erro ao carregar template 'position-opened':`, templateError.message);
        // Usar template básico como fallback
        template = this.getBasicTemplate('position-opened');
        console.log(`[EMAIL] Usando template básico como fallback`);
      }

      // Preparar variáveis
      const variables: TemplateVariables = {
        'account.label': positionData.accountLabel,
        'symbol': positionData.symbol,
        'position.id': positionData.positionId,
        'qty': positionData.qty,
        'avgPrice': positionData.avgPrice,
        'total': positionData.total,
        'datetime': positionData.datetime,
      };

      // Renderizar template
      let html: string;
      try {
        html = this.templateService.renderTemplate(template, variables);
        console.log(`[EMAIL] Template renderizado com sucesso`);
      } catch (renderError: any) {
        const errorMsg = `Erro ao renderizar template: ${renderError.message}`;
        console.error(`[EMAIL] ${errorMsg}`);
        await this.logEmail('POSITION_OPENED', email, subject, 'failed', errorMsg);
        throw new Error(errorMsg);
      }

      // Enviar email
      await this.sendEmail(email, subject, html);
      await this.logEmail('POSITION_OPENED', email, subject, 'sent');
      console.log(`[EMAIL] ✅ Email de posição aberta enviado com sucesso para ${email}`);
    } catch (error: any) {
      const errorMsg = error.message || 'Erro desconhecido ao enviar email';
      console.error(`[EMAIL] ❌ Erro ao enviar email de posição aberta para ${email}:`, errorMsg);
      console.error(`[EMAIL] Stack trace:`, error.stack);
      console.error(`[EMAIL] Detalhes do erro:`, {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
      });
      await this.logEmail('POSITION_OPENED', email, subject, 'failed', errorMsg);
      throw error;
    }
  }

  /**
   * Envia email de posição fechada
   */
  async sendPositionClosedEmail(email: string, positionData: {
    accountLabel: string;
    symbol: string;
    positionId: string;
    buyQty: number;
    buyAvgPrice: number;
    buyTotal: number;
    sellQty: number;
    sellAvgPrice: number;
    sellTotal: number;
    profit: number;
    profitPct: number;
    duration: string;
    closeReason: string;
    datetime: Date;
  }): Promise<void> {
    const template = await this.loadTemplate('position-closed');
    const variables: TemplateVariables = {
      'account.label': positionData.accountLabel,
      'symbol': positionData.symbol,
      'position.id': positionData.positionId,
      'buyQty': positionData.buyQty,
      'buyAvgPrice': positionData.buyAvgPrice,
      'buyTotal': positionData.buyTotal,
      'sellQty': positionData.sellQty,
      'sellAvgPrice': positionData.sellAvgPrice,
      'sellTotal': positionData.sellTotal,
      'profit': positionData.profit,
      'profitPct': positionData.profitPct,
      'duration': positionData.duration,
      'closeReason': positionData.closeReason,
      'datetime': positionData.datetime,
    };

    const html = this.templateService.renderTemplate(template, variables);
    const subject = `Posição Fechada - ${positionData.symbol} - ${positionData.profitPct >= 0 ? 'Lucro' : 'Prejuízo'}: ${positionData.profitPct.toFixed(2)}%`;

    try {
      await this.sendEmail(email, subject, html);
      await this.logEmail('POSITION_CLOSED', email, subject, 'sent');
    } catch (error: any) {
      await this.logEmail('POSITION_CLOSED', email, subject, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Envia email de operação geral
   */
  async sendOperationAlert(email: string, operationData: {
    type: string;
    message: string;
    details?: any;
    datetime: Date;
  }): Promise<void> {
    const template = await this.loadTemplate('operation-alert');
    const variables: TemplateVariables = {
      'operationType': operationData.type,
      'message': operationData.message,
      'details': JSON.stringify(operationData.details || {}, null, 2),
      'datetime': operationData.datetime,
    };

    const html = this.templateService.renderTemplate(template, variables);
    const subject = `Alerta de Operação - ${operationData.type}`;

    try {
      await this.sendEmail(email, subject, html);
      await this.logEmail('OPERATION_ALERT', email, subject, 'sent');
    } catch (error: any) {
      await this.logEmail('OPERATION_ALERT', email, subject, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Carrega template HTML do disco
   */
  private async loadTemplate(templateName: string): Promise<string> {
    const templatePath = path.join(__dirname, 'email-templates', `${templateName}.html`);
    
    try {
      return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      // Se não encontrar, retornar template básico
      console.warn(`[EMAIL] Template ${templateName} não encontrado, usando template básico`);
      return this.getBasicTemplate(templateName);
    }
  }

  /**
   * Template básico quando arquivo não é encontrado
   */
  private getBasicTemplate(templateName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Email Template</title>
      </head>
      <body>
        <h1>Template: ${templateName}</h1>
        <p>Conteúdo do email será renderizado aqui com as variáveis do template.</p>
      </body>
      </html>
    `;
  }

  /**
   * Converte HTML para texto simples
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Registra envio de email no banco
   */
  private async logEmail(
    templateType: string,
    recipient: string,
    subject: string,
    status: 'sent' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.prisma.emailNotificationLog.create({
        data: {
          template_type: templateType,
          recipient,
          subject,
          status,
          error_message: errorMessage || null,
          sent_at: status === 'sent' ? new Date() : null,
        },
      });
    } catch (error) {
      // Não falhar se o log falhar
      console.error('[EMAIL] Erro ao registrar log de email:', error);
    }
  }
}

