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

    getDashboardSummary: async (): Promise<{
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
            // Buscar dados de múltiplas fontes em paralelo
            const [pnlSummary, openPositions] = await Promise.all([
                apiClient.get('/reports/pnl/summary').catch(() => ({ data: null })),
                apiClient.get('/reports/open-positions/summary').catch(() => ({ data: [] })),
            ])

            const openCount = Array.isArray(openPositions.data) 
                ? openPositions.data.reduce((sum: number, p: any) => sum + (p.total_positions || 0), 0)
                : 0

            return {
                openPositions: openCount,
                dailyPnL: pnlSummary.data?.net_pnl || 0,
                totalBalance: pnlSummary.data?.total_profit || 0,
                activeAccounts: Array.isArray(openPositions.data) ? openPositions.data.length : 0,
                positionsTrend: undefined,
                pnlTrend: pnlSummary.data?.win_rate ? (pnlSummary.data.win_rate > 50 ? 1 : -1) : undefined,
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
