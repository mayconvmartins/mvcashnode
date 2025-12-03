import { apiClient } from './client'
import type {
    PnLSummary,
    PnLBySymbol,
    PnLByDay,
    OpenPositionsSummary,
    VaultSummary,
    WebhookSummary,
    ReportFilters,
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

    getOpenPositionsSummary: async (filters?: ReportFilters): Promise<OpenPositionsSummary[]> => {
        const response = await apiClient.get<OpenPositionsSummary[]>(
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

            // open-positions/summary retorna um objeto, não um array
            const openPositionsData = openPositions.data || {}
            const openCount = openPositionsData.totalPositions || 0
            const activeAccounts = openPositionsData.bySymbol?.length || 0

            return {
                openPositions: openCount,
                dailyPnL: pnlSummary.data?.dailyPnL || pnlSummary.data?.netPnL || 0,
                totalBalance: (pnlSummary.data?.realizedPnL || 0) + (pnlSummary.data?.unrealizedPnL || 0),
                activeAccounts: activeAccounts,
                positionsTrend: undefined,
                pnlTrend: pnlSummary.data?.winRate ? (pnlSummary.data.winRate > 50 ? 1 : -1) : undefined,
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
}
