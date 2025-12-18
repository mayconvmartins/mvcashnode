import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '@mvcashnode/db';
import { SubscriberOnlyGuard } from '../subscriptions/guards/subscriber-only.guard';

@ApiTags('Subscriber')
@Controller('subscriber')
@UseGuards(JwtAuthGuard, SubscriberOnlyGuard)
@ApiBearerAuth()
export class SubscriberController {
  constructor(private prisma: PrismaService) {}

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
    summary: 'Resumo do dashboard do assinante',
    description: 'Retorna um resumo das posições e operações do assinante.'
  })
  async getDashboard(@CurrentUser() user: any): Promise<any> {
    // Buscar contas do assinante
    const accounts = await this.prisma.exchangeAccount.findMany({
      where: { user_id: user.userId },
      select: { id: true }
    });
    const accountIds = accounts.map(a => a.id);

    if (accountIds.length === 0) {
      return {
        total_positions: 0,
        open_positions: 0,
        total_invested_usd: 0,
        total_unrealized_pnl_usd: 0,
        position_settings: null
      };
    }

    // Contar posições
    const openPositions = await this.prisma.tradePosition.count({
      where: {
        exchange_account_id: { in: accountIds },
        status: 'OPEN',
        is_residue_position: false
      }
    });

    const totalPositions = await this.prisma.tradePosition.count({
      where: {
        exchange_account_id: { in: accountIds },
        is_residue_position: false
      }
    });

    // Buscar configurações
    const settings = await this.getPositionSettings(user);

    return {
      total_positions: totalPositions,
      open_positions: openPositions,
      accounts_count: accountIds.length,
      position_settings: settings
    };
  }
}

