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
}
