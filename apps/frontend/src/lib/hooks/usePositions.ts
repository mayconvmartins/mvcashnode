import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import type { Position, PositionFilters, UpdateSLTPDto, ClosePositionDto, SellLimitDto } from '@/lib/types'
import { toast } from 'sonner'

export function usePositions(filters?: PositionFilters) {
    return useQuery({
        queryKey: ['positions', filters],
        queryFn: () => positionsService.list(filters),
        refetchInterval: 30000, // Refetch a cada 30s
    })
}

export function usePosition(id: number) {
    return useQuery({
        queryKey: ['positions', id],
        queryFn: () => positionsService.getOne(id),
        enabled: !!id,
        refetchInterval: 30000,
    })
}

export function useUpdatePositionSLTP() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateSLTPDto }) =>
            positionsService.updateSLTP(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['positions', variables.id] })
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success('SL/TP atualizado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar SL/TP')
        },
    })
}

export function useClosePosition() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data?: ClosePositionDto }) =>
            positionsService.close(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['positions', variables.id] })
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success('Posição fechada com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao fechar posição')
        },
    })
}

export function useSellLimit() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: SellLimitDto }) =>
            positionsService.sellLimit(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['positions', variables.id] })
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success('Ordem LIMIT criada com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao criar ordem LIMIT')
        },
    })
}

export function useLockSellByWebhook() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, lock }: { id: number; lock: boolean }) =>
            positionsService.lockSellByWebhook(id, lock),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['positions', variables.id] })
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success(variables.lock ? 'Venda bloqueada por webhook' : 'Venda desbloqueada')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar bloqueio')
        },
    })
}

