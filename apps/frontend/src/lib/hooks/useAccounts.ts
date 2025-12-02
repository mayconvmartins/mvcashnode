import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsService } from '@/lib/api/accounts.service'
import type { ExchangeAccount, CreateExchangeAccountDto, UpdateExchangeAccountDto } from '@/lib/types'
import { toast } from 'sonner'

export function useAccounts() {
    return useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
        refetchInterval: 60000, // Refetch a cada 1 minuto
    })
}

export function useAccount(id: number) {
    return useQuery({
        queryKey: ['accounts', id],
        queryFn: () => accountsService.getOne(id),
        enabled: !!id,
    })
}

export function useCreateAccount() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateExchangeAccountDto) => accountsService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Conta criada com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao criar conta')
        },
    })
}

export function useUpdateAccount() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateExchangeAccountDto }) =>
            accountsService.update(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['accounts', variables.id] })
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Conta atualizada com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar conta')
        },
    })
}

export function useDeleteAccount() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: number) => accountsService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Conta deletada com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao deletar conta')
        },
    })
}

export function useTestConnection() {
    return useMutation({
        mutationFn: (id: number) => accountsService.testConnection(id),
        onSuccess: () => {
            toast.success('Conexão testada com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao testar conexão')
        },
    })
}

