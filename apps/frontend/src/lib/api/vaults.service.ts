import { apiClient } from './client'
import type {
    Vault,
    VaultBalance,
    VaultTransaction,
    CreateVaultDto,
    DepositDto,
    WithdrawDto,
    PaginatedResponse,
} from '@/lib/types'

export const vaultsService = {
    list: async (): Promise<Vault[]> => {
        const response = await apiClient.get<Vault[]>('/vaults')
        return response.data
    },

    getOne: async (id: number): Promise<Vault> => {
        const response = await apiClient.get<Vault>(`/vaults/${id}`)
        return response.data
    },

    create: async (data: CreateVaultDto): Promise<Vault> => {
        const response = await apiClient.post<Vault>('/vaults', data)
        return response.data
    },

    getBalances: async (id: number): Promise<VaultBalance[]> => {
        const response = await apiClient.get<VaultBalance[]>(`/vaults/${id}/balances`)
        return response.data
    },

    getTransactions: async (
        id: number,
        page = 1,
        limit = 20
    ): Promise<PaginatedResponse<VaultTransaction>> => {
        const response = await apiClient.get<PaginatedResponse<VaultTransaction>>(
            `/vaults/${id}/transactions`,
            {
                params: { page, limit },
            }
        )
        return response.data
    },

    deposit: async (id: number, data: DepositDto): Promise<VaultBalance> => {
        const response = await apiClient.post<VaultBalance>(`/vaults/${id}/deposit`, data)
        return response.data
    },

    withdraw: async (id: number, data: WithdrawDto): Promise<VaultBalance> => {
        const response = await apiClient.post<VaultBalance>(`/vaults/${id}/withdraw`, data)
        return response.data
    },
}

