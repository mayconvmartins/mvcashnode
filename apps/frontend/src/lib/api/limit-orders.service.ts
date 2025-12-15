import { apiClient } from './client'
import type { TradeJob, LimitOrderFilters } from '@/lib/types'
import type { PaginatedResponse } from '@/lib/types'

export const limitOrdersService = {
    list: async (filters?: LimitOrderFilters & { page?: number; limit?: number }): Promise<PaginatedResponse<TradeJob> | TradeJob[]> => {
        const response = await apiClient.get<PaginatedResponse<TradeJob>>('/limit-orders', {
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

    getHistory: async (filters?: { from?: string; to?: string; page?: number; limit?: number }): Promise<PaginatedResponse<TradeJob>> => {
        const response = await apiClient.get<PaginatedResponse<TradeJob>>('/limit-orders/history', {
            params: filters,
        })
        return response.data
    },
}

