import { apiClient } from './client'
import type {
    PnLSummary,
    PnLBySymbol,
    PnLByDay,
    OpenPositionsSummaryResponse,
    VaultSummary,
    WebhookSummary,
    ReportFilters,
    DetailedDashboardSummary,
} from '@/lib/types'

export const reportsService = {
    getPnLSummary: async (filters?: ReportFilters): Promise<PnLSummary> => {
        const response = await apiClient.get<PnLSummary>('/reports/pnl/summary', {
            params: filters,
        })
        return response.data
    },

    getPnLBySymbol: async (filters?: ReportFilters): Promise<PnLBySymbol[]> => {
        const response = await apiClient.get<PnLBySymbol[]>('/reports/pnl/by-symbol', {
            params: filters,
        })
        return response.data
    },

    getPnLByDay: async (filters?: ReportFilters): Promise<PnLByDay[]> => {
        const response = await apiClient.get<PnLByDay[]>('/reports/pnl/by-day', {
            params: filters,
        })
        return response.data
    },

    getOpenPositionsSummary: async (filters?: ReportFilters): Promise<OpenPositionsSummaryResponse> => {
        const response = await apiClient.get<OpenPositionsSummaryResponse>(
            '/reports/open-positions/summary',
            {
                params: filters,
            }
        )
        return response.data
    },

    getVaultsSummary: async (filters?: ReportFilters): Promise<VaultSummary[]> => {
        const response = await apiClient.get<VaultSummary[]>('/reports/vaults/summary', {
            params: filters,
        })
        return response.data
    },

    getFeesReport: async (filters?: ReportFilters): Promise<any> => {
        const response = await apiClient.get('/reports/fees', {
            params: filters,
        })
        return response.data
    },

    getWebhooksSummary: async (filters?: {
        webhook_source_id?: number
        from?: string
        to?: string
    }): Promise<WebhookSummary> => {
        const response = await apiClient.get<WebhookSummary>('/reports/webhooks/summary', {
            params: filters,
        })
        return response.data
    },

    getStrategyPerformance: async (filters?: ReportFilters & { webhook_source_id?: number }): Promise<Array<{
        strategy: string
        pnl: number
        trades: number
        wins: number
        avgPnL: number
        totalVolume: number
        winRate: number
    }>> => {
        const response = await apiClient.get('/reports/strategy-performance', {
            params: filters,
        })
        return response.data
    },

    getSharpeRatio: async (filters?: ReportFilters): Promise<{
        sharpeRatio: number
        avgReturn: number
        stdDev: number
        riskFreeRate: number
        returns: Array<{ date: string; return: number }>
    }> => {
        const response = await apiClient.get('/reports/sharpe-ratio', {
            params: filters,
        })
        return response.data
    },

    getSymbolCorrelation: async (filters?: ReportFilters): Promise<Array<{
        symbol1: string
        symbol2: string
        correlation: number
    }>> => {
        const response = await apiClient.get('/reports/symbol-correlation', {
            params: filters,
        })
        return response.data
    },

    getDashboardSummary: async (tradeMode?: string): Promise<{
        openPositions: number
        dailyPnL: number
        totalBalance: number
        activeAccounts: number
        positionsTrend?: number
        pnlTrend?: number
        recentTrades: Array<{
            id: number
            symbol: string
            side: string
            status: string
            created_at: string
        }>
        topSymbols: Array<{
            symbol: string
            pnl: number
            trades: number
        }>
    }> => {
        try {
            // Preparar parâmetros com trade_mode se fornecido
            const params = tradeMode ? { trade_mode: tradeMode } : {}
            
            // Buscar dados de múltiplas fontes em paralelo
            const [pnlSummary, openPositions] = await Promise.all([
                apiClient.get('/reports/pnl/summary', { params }).catch(() => ({ data: null })),
                apiClient.get('/reports/open-positions/summary', { params }).catch(() => ({ data: null })),
            ])

            // O interceptor já extraiu o data, então acessamos diretamente
            const openPositionsData = openPositions.data || {}
            const pnlData = pnlSummary.data || {}
            const openCount = openPositionsData.totalPositions || 0
            const activeAccounts = openPositionsData.activeAccounts || 0

            return {
                openPositions: openCount,
                dailyPnL: pnlData.dailyPnL || pnlData.netPnL || 0,
                totalBalance: (pnlData.realizedPnL || 0) + (pnlData.unrealizedPnL || 0),
                activeAccounts: activeAccounts,
                positionsTrend: undefined,
                pnlTrend: pnlData.winRate ? (pnlData.winRate > 50 ? 1 : -1) : undefined,
                recentTrades: [],
                topSymbols: [],
            }
        } catch (error) {
            // Retornar valores padrão se houver erro
            return {
                openPositions: 0,
                dailyPnL: 0,
                totalBalance: 0,
                activeAccounts: 0,
                recentTrades: [],
                topSymbols: [],
            }
        }
    },

    getDetailedDashboardSummary: async (
        tradeMode?: string,
        from?: Date,
        to?: Date
    ): Promise<DetailedDashboardSummary> => {
        const params: any = {}
        if (tradeMode) params.trade_mode = tradeMode
        if (from) params.from = from.toISOString()
        if (to) params.to = to.toISOString()
        
        const response = await apiClient.get<DetailedDashboardSummary>('/reports/dashboard/detailed', {
            params,
        })
        return response.data
    },

    // Métodos adicionais para relatórios de admin
    getOpenPositions: async (filters?: ReportFilters): Promise<any[]> => {
        const response = await apiClient.get('/positions', {
            params: { ...filters, status: 'OPEN' },
        })
        return response.data?.data || response.data || []
    },

    getDrawdown: async (filters?: ReportFilters): Promise<{
        max_drawdown: number
        current_drawdown: number
        recovery_days: number
        history: Array<{ date: string; drawdown: number }>
    }> => {
        // Endpoint de drawdown - calcular a partir do PnL por dia
        const byDay = await reportsService.getPnLByDay(filters)
        
        let peak = 0
        let maxDrawdown = 0
        let currentDrawdown = 0
        const history: Array<{ date: string; drawdown: number }> = []
        
        byDay.forEach((day: any) => {
            const cumPnl = day.cumulative_pnl || 0
            if (cumPnl > peak) peak = cumPnl
            const drawdown = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0
            if (drawdown > maxDrawdown) maxDrawdown = drawdown
            currentDrawdown = drawdown
            history.push({ date: day.date, drawdown: -drawdown })
        })
        
        return {
            max_drawdown: maxDrawdown,
            current_drawdown: currentDrawdown,
            recovery_days: 0,
            history,
        }
    },

    getHourlyPerformance: async (filters?: ReportFilters): Promise<Array<{ hour: number; pnl: number; trades: number }>> => {
        const response = await apiClient.get('/reports/hourly-performance', {
            params: filters,
        }).catch(() => ({ data: [] }))
        return response.data || []
    },

    getFees: async (filters?: ReportFilters): Promise<{
        total_fees: number
        avg_fee_percent: number
        by_type: Array<{ type: string; amount: number; percent: number; count: number }>
    }> => {
        const response = await apiClient.get('/reports/fees', {
            params: filters,
        }).catch(() => ({ data: { total_fees: 0, avg_fee_percent: 0, by_type: [] } }))
        return response.data
    },
}
