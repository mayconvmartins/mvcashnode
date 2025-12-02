import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('pnl/summary')
  @ApiOperation({ summary: 'Resumo de PnL' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'exchange_account_id', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Resumo de PnL' })
  async getPnLSummary(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('exchange_account_id') exchangeAccountId?: number
  ) {
    return this.reportsService.getPnLSummary(
      user.userId,
      tradeMode as any,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      exchangeAccountId
    );
  }

  @Get('pnl/by-symbol')
  @ApiOperation({ summary: 'PnL por símbolo' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 200, description: 'PnL por símbolo' })
  async getPnLBySymbol(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.reportsService.getPnLBySymbol(
      user.userId,
      tradeMode as any,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    );
  }

  @Get('pnl/by-day')
  @ApiOperation({ summary: 'PnL por dia' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 200, description: 'PnL por dia' })
  async getPnLByDay(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.reportsService.getPnLByDay(
      user.userId,
      tradeMode as any,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    );
  }

  @Get('open-positions/summary')
  @ApiOperation({ summary: 'Resumo de posições abertas' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiResponse({ status: 200, description: 'Resumo de posições abertas' })
  async getOpenPositionsSummary(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string
  ) {
    return this.reportsService.getOpenPositionsSummary(user.userId, tradeMode as any);
  }

  @Get('vaults/summary')
  @ApiOperation({ summary: 'Resumo de cofres' })
  @ApiQuery({ name: 'trade_mode', required: false, enum: ['REAL', 'SIMULATION'] })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Resumo de cofres' })
  async getVaultsSummary(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.reportsService.getVaultsSummary(
      user.userId,
      tradeMode as any,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    );
  }

  @Get('webhooks/summary')
  @ApiOperation({ summary: 'Resumo de webhooks' })
  @ApiQuery({ name: 'webhook_source_id', required: false, type: Number })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Resumo de webhooks' })
  async getWebhooksSummary(
    @CurrentUser() user: any,
    @Query('webhook_source_id') webhookSourceId?: number,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.reportsService.getWebhooksSummary(
      user.userId,
      webhookSourceId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    );
  }
}

