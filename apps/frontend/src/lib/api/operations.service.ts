import { apiClient } from './client'
import type { TradeJob, TradeExecution, TradeMode, JobStatus } from '@/lib/types'

export interface Operation {
    id: string
    type: 'job' | 'execution'
    data: TradeJob | TradeExecution
    created_at: string
    updated_at: string
}

export interface OperationsFilters {
    trade_mode?: TradeMode
    status?: JobStatus
    from?: string
    to?: string
}

export const operationsService = {
    list: async (filters?: OperationsFilters): Promise<Operation[]> => {
        const response = await apiClient.get<Operation[]>('/operations', {
            params: filters,
        })
        return response.data
    },

    getJob: async (id: number): Promise<TradeJob> => {
        const response = await apiClient.get<TradeJob>(`/trade-jobs/${id}`)
        return response.data
    },

    listJobs: async (status?: string, trade_mode?: TradeMode): Promise<TradeJob[]> => {
        const response = await apiClient.get<TradeJob[]>('/trade-jobs', {
            params: { status, trade_mode },
        })
        return response.data
    },

    getExecution: async (id: number): Promise<TradeExecution> => {
        const response = await apiClient.get<TradeExecution>(`/trade-executions/${id}`)
        return response.data
    },

    listExecutions: async (): Promise<TradeExecution[]> => {
        const response = await apiClient.get<TradeExecution[]>('/trade-executions')
        return response.data
    },
}

