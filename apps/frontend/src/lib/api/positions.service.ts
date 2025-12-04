import { apiClient } from './client'
import type {
    Position,
    PositionFilters,
    UpdateSLTPDto,
    ClosePositionDto,
    SellLimitDto,
    PaginatedResponse,
    PositionSummary,
} from '@/lib/types'

export const positionsService = {
    list: async (filters?: PositionFilters): Promise<Position[] | PaginatedResponse<Position>> => {
        const response = await apiClient.get<PaginatedResponse<Position>>('/positions', { params: filters })
        // O interceptor já mantém o formato { data: [...], pagination: {...}, summary: {...} } quando detecta pagination
        // Retornar o objeto completo para ter acesso ao summary
        if (response.data && 'data' in response.data && Array.isArray(response.data.data)) {
            return response.data
        }
        // Fallback: se não tiver o formato esperado, retornar array vazio ou o próprio response.data se for array
        return Array.isArray(response.data) ? response.data : []
    },

    getOne: async (id: number): Promise<Position> => {
        const response = await apiClient.get<Position>(`/positions/${id}`)
        return response.data
    },

    updateSLTP: async (id: number, data: UpdateSLTPDto): Promise<Position> => {
        const response = await apiClient.put<Position>(`/positions/${id}/sltp`, data)
        return response.data
    },

    lockSellByWebhook: async (id: number, lock: boolean): Promise<Position> => {
        const response = await apiClient.put<Position>(`/positions/${id}/lock-sell-by-webhook`, {
            lock_sell_by_webhook: lock,
        })
        return response.data
    },

    close: async (id: number, data?: ClosePositionDto): Promise<any> => {
        const response = await apiClient.post(`/positions/${id}/close`, data || {})
        return response.data
    },

    sellLimit: async (id: number, data: SellLimitDto): Promise<any> => {
        const response = await apiClient.post(`/positions/${id}/sell-limit`, data)
        return response.data
    },

    getMonitoringTPSL: async (filters?: { trade_mode?: string; exchange_account_id?: number }): Promise<any> => {
        const response = await apiClient.get('/positions/monitoring-tp-sl', { params: filters })
        return response.data
    },

    syncMissing: async (): Promise<{
        total_checked: number
        positions_created: number
        executions_updated: number
        errors: Array<{ jobId: number; error: string }>
    }> => {
        const response = await apiClient.post('/positions/sync-missing')
        return response.data
    },

    bulkUpdateSLTP: async (data: {
        positionIds: number[]
        slEnabled?: boolean
        slPct?: number
        tpEnabled?: boolean
        tpPct?: number
    }): Promise<{
        updated: number
        errors: Array<{ positionId: number; error: string }>
    }> => {
        const response = await apiClient.post('/positions/bulk-update-sltp', data)
        return response.data
    },

    createManual: async (data: {
        method: 'EXCHANGE_ORDER' | 'MANUAL'
        exchange_account_id: number
        exchange_order_id?: string
        symbol?: string
        manual_symbol?: string
        qty_total?: number
        price_open?: number
        trade_mode?: 'REAL' | 'SIMULATION'
        manual_exchange_order_id?: string
        created_at?: string
    }): Promise<Position> => {
        const response = await apiClient.post<Position>('/positions/manual', data)
        return response.data
    },
}
