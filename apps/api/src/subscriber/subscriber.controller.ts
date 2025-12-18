import {
  Controller,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';
import { SubscriberOnlyGuard } from '../subscriptions/guards/subscriber-only.guard';
import { ReportsService } from '../reports/reports.service';
import { TradeMode } from '@mvcashnode/shared';

@ApiTags('Subscriber')
@Controller('subscriber')
@UseGuards(JwtAuthGuard, SubscriberOnlyGuard)
@ApiBearerAuth()
export class SubscriberController {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService
  ) {}

  @Get('position-settings')
  @ApiOperation({
    summary: 'Obter configurações de valor da posição',
    description: 'Retorna as configurações atuais do assinante para valor da posição, incluindo limites definidos pelo admin.'
  })
  @ApiResponse({ status: 200, description: 'Configurações retornadas com sucesso' })
  async getPositionSettings(@CurrentUser() user: any): Promise<any> {
    // Buscar parâmetros padrão globais
    let defaults = await this.prisma.subscriberDefaultParameters.findFirst();
    
    if (!defaults) {
      // Criar registro padrão se não existir
      defaults = await this.prisma.subscriberDefaultParameters.create({
        data: {
          min_quote_amount: 20,
          default_quote_amount: 100,
          lock_webhook_on_tsg: true
        }
      });
    }

    // Buscar parâmetros do assinante
    let subscriberParams = await this.prisma.subscriberParameters.findUnique({
      where: { user_id: user.userId }
    });

    // Criar parâmetros do assinante se não existir
    if (!subscriberParams) {
      subscriberParams = await this.prisma.subscriberParameters.create({
        data: {
          user_id: user.userId,
          quote_amount_fixed: defaults.default_quote_amount
        }
      });
    }

    const minAmount = defaults.min_quote_amount?.toNumber?.() ?? defaults.min_quote_amount ?? 20;
    const maxAmount = defaults.max_quote_amount?.toNumber?.() ?? defaults.max_quote_amount ?? null;
    const defaultAmount = defaults.default_quote_amount?.toNumber?.() ?? defaults.default_quote_amount ?? 100;
    const currentAmount = subscriberParams.quote_amount_fixed?.toNumber?.() ?? subscriberParams.quote_amount_fixed ?? defaultAmount;

    return {
      current_value: currentAmount,
      min_value: minAmount,
      max_value: maxAmount,
      default_value: defaultAmount,
      message: maxAmount 
        ? `O valor deve estar entre $${minAmount} e $${maxAmount} USD` 
        : `O valor mínimo é $${minAmount} USD`
    };
  }

  @Put('position-settings')
  @ApiOperation({
    summary: 'Atualizar valor da posição',
    description: 'Atualiza o valor da posição do assinante (validado contra limites min/max do admin).'
  })
  @ApiResponse({ status: 200, description: 'Configuração atualizada com sucesso' })
  @ApiResponse({ status: 400, description: 'Valor fora dos limites permitidos' })
  async updatePositionSettings(
    @CurrentUser() user: any,
    @Body() dto: { quote_amount_fixed: number }
  ): Promise<any> {
    const { quote_amount_fixed } = dto;

    if (!quote_amount_fixed || typeof quote_amount_fixed !== 'number') {
      throw new BadRequestException('Valor da posição é obrigatório e deve ser um número');
    }

    // Buscar parâmetros padrão globais para validação
    let defaults = await this.prisma.subscriberDefaultParameters.findFirst();
    
    if (!defaults) {
      defaults = await this.prisma.subscriberDefaultParameters.create({
        data: {
          min_quote_amount: 20,
          default_quote_amount: 100,
          lock_webhook_on_tsg: true
        }
      });
    }

    const minAmount = Number(defaults.min_quote_amount) || 20;
    const maxAmount = defaults.max_quote_amount ? Number(defaults.max_quote_amount) : null;

    // Validar limites
    if (quote_amount_fixed < minAmount) {
      throw new BadRequestException(`Valor mínimo permitido: $${minAmount} USD`);
    }

    if (maxAmount !== null && quote_amount_fixed > maxAmount) {
      throw new BadRequestException(`Valor máximo permitido: $${maxAmount} USD`);
    }

    // Atualizar ou criar parâmetros do assinante
    const subscriberParams = await this.prisma.subscriberParameters.upsert({
      where: { user_id: user.userId },
      update: { quote_amount_fixed },
      create: {
        user_id: user.userId,
        quote_amount_fixed
      }
    });

    return {
      success: true,
      message: 'Valor da posição atualizado com sucesso',
      data: {
        current_value: subscriberParams.quote_amount_fixed?.toNumber?.() ?? subscriberParams.quote_amount_fixed,
        min_value: minAmount,
        max_value: maxAmount
      }
    };
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard completo do assinante',
    description: 'Retorna dados completos da dashboard do assinante, similar à dashboard do admin mas sem métricas de SL/TP.'
  })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'period', required: false, description: 'today, last7days, currentMonth, previousMonth' })
  async getDashboard(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('period') period?: string
  ): Promise<any> {
    // Calcular datas baseado no período
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let from: Date;
    let to: Date;
    
    switch (period) {
      case 'last7days':
        from = new Date(today);
        from.setDate(from.getDate() - 6);
        to = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;
      case 'currentMonth':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'previousMonth':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'today':
      default:
        from = new Date(today);
        to = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;
    }
    
    // Usar ReportsService para obter dados detalhados
    const mode = tradeMode === 'SIMULATION' ? TradeMode.SIMULATION : TradeMode.REAL;
    const dashboardData = await this.reportsService.getDetailedDashboardSummary(
      user.userId,
      mode,
      from,
      to
    );
    
    // Retornar dados simplificados (sem SL/TP vs Webhook, sem estatísticas SL/TP, sem evolução P&L)
    return {
      // Resumo principal
      totalPositions: dashboardData.totalPositions,
      openPositions: dashboardData.openPositions,
      closedPositions: dashboardData.closedPositions,
      totalInvestment: dashboardData.totalInvestment,
      totalPnL: dashboardData.totalPnL,
      realizedPnL: dashboardData.realizedPnL,
      unrealizedPnL: dashboardData.unrealizedPnL,
      capitalInvested: dashboardData.capitalInvested,
      
      // ROI
      roiAccumulated: dashboardData.roiAccumulated,
      roiRealized: dashboardData.roiRealized,
      roiUnrealized: dashboardData.roiUnrealized,
      
      // Top símbolos
      topProfitable: dashboardData.topProfitable,
      topLosses: dashboardData.topLosses,
      
      // Gráficos
      positionsBySymbol: dashboardData.positionsBySymbol,
      // Composição P&L já está em realizedPnL e unrealizedPnL
    };
  }
}

