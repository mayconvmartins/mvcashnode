import { apiClient } from './client'
import type {
    ExchangeAccount,
    CreateExchangeAccountDto,
    UpdateExchangeAccountDto,
    TestConnectionResponse,
} from '@/lib/types'

export const accountsService = {
    list: async (): Promise<ExchangeAccount[]> => {
        const response = await apiClient.get<ExchangeAccount[]>('/exchange-accounts')
        return response.data
    },

    getOne: async (id: number): Promise<ExchangeAccount> => {
        const response = await apiClient.get<ExchangeAccount>(`/exchange-accounts/${id}`)
        return response.data
    },

    create: async (data: CreateExchangeAccountDto): Promise<ExchangeAccount> => {
        const response = await apiClient.post<ExchangeAccount>('/exchange-accounts', data)
        return response.data
    },

    update: async (id: number, data: UpdateExchangeAccountDto): Promise<ExchangeAccount> => {
        const response = await apiClient.put<ExchangeAccount>(`/exchange-accounts/${id}`, data)
        return response.data
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/exchange-accounts/${id}`)
    },

    testConnection: async (id: number): Promise<TestConnectionResponse> => {
        const response = await apiClient.post<TestConnectionResponse>(
            `/exchange-accounts/${id}/test-connection`
        )
        // Backend retorna { success, message }, não { data: { success, message } }
        return response.data
    },

    // Novos métodos para ações da conta
    getBalances: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/exchange-accounts/${id}/balances`)
        return response.data
    },

    syncBalances: async (id: number): Promise<any> => {
        const response = await apiClient.post(`/exchange-accounts/${id}/sync-balances`)
        return response.data
    },

    getPositions: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/exchange-accounts/${id}/positions`)
        return response.data
    },

    syncPositions: async (id: number): Promise<any> => {
        const response = await apiClient.post(`/exchange-accounts/${id}/sync-positions`)
        return response.data
    },
}
