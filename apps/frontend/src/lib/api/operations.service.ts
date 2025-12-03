import { apiClient } from './client'
import type { TradeJob, TradeExecution, TradeMode, JobStatus } from '@/lib/types'

export interface Operation {
    job: any
    executions: any[]
    position: any | null
}

export interface OperationDetail {
    job: any
    executions: any[]
    position: any | null
    positions_closed: any[]
    sell_jobs: any[]
    webhook_event: any | null
    timeline: Array<{
        type: string
        timestamp: string
        description: string
        data: any
    }>
}

export interface OperationsResponse {
    data: Operation[]
    pagination: {
        current_page: number
        per_page: number
        total_items: number
        total_pages: number
    }
}

export interface OperationsFilters {
    trade_mode?: TradeMode
    status?: JobStatus
    from?: string
    to?: string
    page?: number
    limit?: number
    exchange_account_id?: number
    symbol?: string
}

export const operationsService = {
    list: async (filters?: OperationsFilters): Promise<OperationsResponse> => {
        const response = await apiClient.get<OperationsResponse>('/operations', {
            params: filters,
        })
        // O axios já extrai data da resposta HTTP, então response.data é { data: [...], pagination: {...} }
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

    getById: async (id: number): Promise<OperationDetail> => {
        const response = await apiClient.get<OperationDetail>(`/operations/${id}`)
        return response.data
    },
}

