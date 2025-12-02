import { apiClient } from './client'
import type { TradeJob, LimitOrderFilters } from '@/lib/types'

export const limitOrdersService = {
    list: async (filters?: LimitOrderFilters): Promise<TradeJob[]> => {
        const response = await apiClient.get<TradeJob[]>('/limit-orders', {
            params: filters,
        })
        return response.data
    },

    getOne: async (id: number): Promise<TradeJob> => {
        const response = await apiClient.get<TradeJob>(`/limit-orders/${id}`)
        return response.data
    },

    cancel: async (id: number): Promise<void> => {
        await apiClient.delete(`/limit-orders/${id}`)
    },

    getHistory: async (from?: string, to?: string): Promise<TradeJob[]> => {
        const response = await apiClient.get<TradeJob[]>('/limit-orders/history', {
            params: { from, to },
        })
        return response.data
    },
}

