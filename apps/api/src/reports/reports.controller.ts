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
  @ApiOperation({ 
    summary: 'Resumo de PnL (Profit and Loss)',
    description: 'Retorna um resumo consolidado de lucros e perdas, incluindo PnL total, PnL realizado, PnL não realizado, número de trades e taxa de acerto. Suporta filtros por modo de trading, período e conta de exchange.',
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    type: String,
    description: 'Data inicial (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    type: String,
    description: 'Data final (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiQuery({ 
    name: 'exchange_account_id', 
    required: false, 
    type: Number,
    description: 'Filtrar por conta de exchange específica',
    example: 1
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resumo de PnL retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalPnL: { type: 'number', example: 150.50, description: 'PnL total (realizado + não realizado)' },
        realizedPnL: { type: 'number', example: 100.25, description: 'PnL de posições fechadas' },
        unrealizedPnL: { type: 'number', example: 50.25, description: 'PnL de posições abertas' },
        totalTrades: { type: 'number', example: 25, description: 'Total de trades executados' },
        winningTrades: { type: 'number', example: 15, description: 'Trades com lucro' },
        losingTrades: { type: 'number', example: 10, description: 'Trades com prejuízo' },
        winRate: { type: 'number', example: 60.0, description: 'Taxa de acerto em percentual' },
        avgWin: { type: 'number', example: 20.50, description: 'Lucro médio por trade vencedor' },
        avgLoss: { type: 'number', example: -10.25, description: 'Prejuízo médio por trade perdedor' },
      },
    },
  })
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
  @ApiOperation({ 
    summary: 'PnL agrupado por símbolo',
    description: 'Retorna o PnL consolidado agrupado por símbolo de trading (ex: BTCUSDT, SOLUSDT), permitindo identificar quais pares são mais lucrativos.',
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    type: String,
    description: 'Data inicial (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    type: String,
    description: 'Data final (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'PnL por símbolo retornado com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string', example: 'BTCUSDT' },
          totalPnL: { type: 'number', example: 50.25 },
          realizedPnL: { type: 'number', example: 30.10 },
          unrealizedPnL: { type: 'number', example: 20.15 },
          totalTrades: { type: 'number', example: 10 },
          winRate: { type: 'number', example: 70.0 },
        },
      },
    },
  })
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
  @ApiOperation({ 
    summary: 'PnL agrupado por dia',
    description: 'Retorna o PnL diário para análise de tendências e performance ao longo do tempo. Útil para gráficos de evolução de lucros.',
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    type: String,
    description: 'Data inicial (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    type: String,
    description: 'Data final (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'PnL por dia retornado com sucesso',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date', example: '2025-02-12' },
          totalPnL: { type: 'number', example: 25.50 },
          realizedPnL: { type: 'number', example: 20.00 },
          unrealizedPnL: { type: 'number', example: 5.50 },
          tradesCount: { type: 'number', example: 5 },
        },
      },
    },
  })
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
  @ApiOperation({ 
    summary: 'Resumo de posições abertas',
    description: 'Retorna estatísticas consolidadas das posições abertas, incluindo quantidade, PnL não realizado total e distribuição por símbolo.',
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resumo de posições abertas retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalPositions: { type: 'number', example: 5, description: 'Quantidade total de posições abertas' },
        totalUnrealizedPnL: { type: 'number', example: 50.25, description: 'PnL não realizado total' },
        totalInvested: { type: 'number', example: 500.00, description: 'Valor total investido em posições abertas' },
        bySymbol: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string', example: 'BTCUSDT' },
              count: { type: 'number', example: 2 },
              unrealizedPnL: { type: 'number', example: 20.10 },
            },
          },
        },
      },
    },
  })
  async getOpenPositionsSummary(
    @CurrentUser() user: any,
    @Query('trade_mode') tradeMode?: string
  ) {
    return this.reportsService.getOpenPositionsSummary(user.userId, tradeMode as any);
  }

  @Get('vaults/summary')
  @ApiOperation({ 
    summary: 'Resumo de cofres',
    description: 'Retorna estatísticas consolidadas dos cofres, incluindo saldos totais, evolução ao longo do tempo e movimentações.',
  })
  @ApiQuery({ 
    name: 'trade_mode', 
    required: false, 
    enum: ['REAL', 'SIMULATION'],
    description: 'Filtrar por modo de trading',
    example: 'REAL'
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    type: String,
    description: 'Data inicial (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    type: String,
    description: 'Data final (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resumo de cofres retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalVaults: { type: 'number', example: 2 },
        totalBalance: { type: 'number', example: 2000.00, description: 'Saldo total em USDT equivalente' },
        totalDeposits: { type: 'number', example: 2500.00 },
        totalWithdrawals: { type: 'number', example: 500.00 },
        byAsset: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              asset: { type: 'string', example: 'USDT' },
              totalBalance: { type: 'number', example: 1500.00 },
              totalReserved: { type: 'number', example: 100.00 },
            },
          },
        },
      },
    },
  })
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
  @ApiOperation({ 
    summary: 'Resumo de webhooks',
    description: 'Retorna estatísticas consolidadas dos webhooks recebidos, incluindo quantidade de eventos, taxa de sucesso e jobs criados.',
  })
  @ApiQuery({ 
    name: 'webhook_source_id', 
    required: false, 
    type: Number,
    description: 'Filtrar por webhook source específico',
    example: 1
  })
  @ApiQuery({ 
    name: 'from', 
    required: false, 
    type: String,
    description: 'Data inicial (ISO 8601)',
    example: '2025-02-01T00:00:00.000Z'
  })
  @ApiQuery({ 
    name: 'to', 
    required: false, 
    type: String,
    description: 'Data final (ISO 8601)',
    example: '2025-02-12T23:59:59.999Z'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Resumo de webhooks retornado com sucesso',
    schema: {
      type: 'object',
      properties: {
        totalEvents: { type: 'number', example: 100, description: 'Total de eventos recebidos' },
        eventsProcessed: { type: 'number', example: 95, description: 'Eventos processados com sucesso' },
        eventsSkipped: { type: 'number', example: 3, description: 'Eventos ignorados' },
        eventsFailed: { type: 'number', example: 2, description: 'Eventos que falharam' },
        jobsCreated: { type: 'number', example: 90, description: 'Trade jobs criados a partir dos webhooks' },
        bySource: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              webhook_source_id: { type: 'number', example: 1 },
              label: { type: 'string', example: 'TradingView Alerts' },
              eventsCount: { type: 'number', example: 50 },
              jobsCreated: { type: 'number', example: 45 },
            },
          },
        },
      },
    },
  })
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

