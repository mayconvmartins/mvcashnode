import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import type {
    WebhookSource,
    AccountWebhookBinding,
    WebhookEvent,
    CreateWebhookSourceDto,
    CreateBindingDto,
    WebhookEventFilters,
} from '@/lib/types'
import { toast } from 'sonner'

export function useWebhookSources() {
    return useQuery({
        queryKey: ['webhook-sources'],
        queryFn: webhooksService.listSources,
    })
}

export function useWebhookSource(id: number) {
    return useQuery({
        queryKey: ['webhook-sources', id],
        queryFn: () => webhooksService.getSource(id),
        enabled: !!id,
    })
}

export function useWebhookBindings(sourceId: number) {
    return useQuery({
        queryKey: ['webhook-sources', sourceId, 'bindings'],
        queryFn: () => webhooksService.listBindings(sourceId),
        enabled: !!sourceId,
    })
}

export function useWebhookEvents(filters?: WebhookEventFilters) {
    return useQuery({
        queryKey: ['webhook-events', filters],
        queryFn: () => webhooksService.listEvents(filters),
        refetchInterval: 30000,
    })
}

export function useWebhookEvent(id: number) {
    return useQuery({
        queryKey: ['webhook-events', id],
        queryFn: () => webhooksService.getEvent(id),
        enabled: !!id,
    })
}

export function useCreateWebhookSource() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (data: CreateWebhookSourceDto) => webhooksService.createSource(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
            toast.success('Webhook source criado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao criar webhook source')
        },
    })
}

export function useUpdateWebhookSource() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<CreateWebhookSourceDto> }) =>
            webhooksService.updateSource(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['webhook-sources', variables.id] })
            queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
            toast.success('Webhook source atualizado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar webhook source')
        },
    })
}

export function useDeleteWebhookSource() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: number) => webhooksService.deleteSource(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook-sources'] })
            toast.success('Webhook source deletado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao deletar webhook source')
        },
    })
}

export function useCreateBinding() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ sourceId, data }: { sourceId: number; data: CreateBindingDto }) =>
            webhooksService.createBinding(sourceId, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['webhook-sources', variables.sourceId, 'bindings'] })
            queryClient.invalidateQueries({ queryKey: ['webhook-sources', variables.sourceId] })
            toast.success('Binding criado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao criar binding')
        },
    })
}

export function useDeleteBinding() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ sourceId, bindingId }: { sourceId: number; bindingId: number }) =>
            webhooksService.deleteBinding(sourceId, bindingId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['webhook-sources', variables.sourceId, 'bindings'] })
            queryClient.invalidateQueries({ queryKey: ['webhook-sources', variables.sourceId] })
            toast.success('Binding deletado com sucesso')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao deletar binding')
        },
    })
}

