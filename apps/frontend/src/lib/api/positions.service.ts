import { apiClient } from './client'
import type {
    Position,
    PositionFilters,
    UpdateSLTPDto,
    ClosePositionDto,
    SellLimitDto,
    PaginatedResponse,
} from '@/lib/types'

export const positionsService = {
    list: async (filters?: PositionFilters): Promise<Position[]> => {
        const response = await apiClient.get<Position[]>('/positions', { params: filters })
        return response.data
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
}
