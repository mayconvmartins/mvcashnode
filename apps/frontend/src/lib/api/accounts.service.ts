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
        return response.data
    },
}
