import { apiClient } from './client'
import type { TradeJob, TradeExecution, PaginatedResponse } from '@/lib/types'

export interface TradeJobWithRelations extends TradeJob {
    webhook_event?: {
        id: number
        event_uid: string
        symbol_raw: string
        symbol_normalized: string
        action: string
        raw_text: string | null
        webhook_source?: {
            id: number
            label: string
            webhook_code: string
        }
    }
    exchange_account?: {
        id: number
        label: string
        exchange: string
    }
    executions?: TradeExecution[]
    position_open?: {
        id: number
        status: string
        qty_total: number
        qty_remaining: number
        price_open: number
    }
}

export const jobsService = {
    getJob: async (id: number): Promise<TradeJobWithRelations> => {
        const response = await apiClient.get<TradeJobWithRelations>(`/trade-jobs/${id}`)
        return response.data
    },

    listJobs: async (filters?: {
        status?: string
        trade_mode?: string
        exchange_account_id?: number
        symbol?: string
        page?: number
        limit?: number
    }): Promise<PaginatedResponse<TradeJob>> => {
        const response = await apiClient.get<PaginatedResponse<TradeJob>>('/trade-jobs', {
            params: filters,
        })
        return response.data
    },
}

