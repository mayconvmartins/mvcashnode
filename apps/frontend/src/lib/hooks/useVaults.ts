import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vaultsService } from '@/lib/api/vaults.service'
import type { Vault, VaultBalance, VaultTransaction, CreateVaultDto, DepositDto, WithdrawDto } from '@/lib/types'
import { toast } from 'sonner'

export function useVaults() {
    return useQuery({
        queryKey: ['vaults'],
        queryFn: vaultsService.list,
    })
}

export function useVault(id: number) {
    return useQuery({
        queryKey: ['vaults', id],
        queryFn: () => vaultsService.getOne(id),
        enabled: !!id,
    })
}

export function useVaultBalances(id: number) {
    return useQuery({
        queryKey: ['vaults', id, 'balances'],
        queryFn: () => vaultsService.getBalances(id),
        enabled: !!id,
        refetchInterval: 30000,
    })
}

export function useVaultTransactions(id: number, page = 1, limit = 20) {
    return useQuery({
        queryKey: ['vaults', id, 'transactions', page, limit],
        queryFn: () => vaultsService.getTransactions(id, page, limit),
        enabled: !!id,
    })
}

export function useCreateVault() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateVaultDto) => vaultsService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vaults'] })
            toast.success('Cofre criado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao criar cofre')
        },
    })
}

export function useDeposit() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: DepositDto }) =>
            vaultsService.deposit(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['vaults', variables.id, 'balances'] })
            queryClient.invalidateQueries({ queryKey: ['vaults', variables.id, 'transactions'] })
            queryClient.invalidateQueries({ queryKey: ['vaults'] })
            toast.success('Depósito realizado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao realizar depósito')
        },
    })
}

export function useWithdraw() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: WithdrawDto }) =>
            vaultsService.withdraw(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['vaults', variables.id, 'balances'] })
            queryClient.invalidateQueries({ queryKey: ['vaults', variables.id, 'transactions'] })
            queryClient.invalidateQueries({ queryKey: ['vaults'] })
            toast.success('Saque realizado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao realizar saque')
        },
    })
}

