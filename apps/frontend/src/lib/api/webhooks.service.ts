import { apiClient } from './client'
import type {
    WebhookSource,
    AccountWebhookBinding,
    WebhookEvent,
    CreateWebhookSourceDto,
    CreateBindingDto,
    WebhookEventFilters,
    PaginatedResponse,
} from '@/lib/types'

export const webhooksService = {
    // Webhook Sources
    list: async (): Promise<WebhookSource[]> => {
        const response = await apiClient.get<WebhookSource[]>('/webhook-sources')
        return response.data
    },

    listSources: async (): Promise<WebhookSource[]> => {
        const response = await apiClient.get<WebhookSource[]>('/webhook-sources')
        return response.data
    },

    getSource: async (id: number): Promise<WebhookSource> => {
        const response = await apiClient.get<WebhookSource>(`/webhook-sources/${id}`)
        return response.data
    },

    createSource: async (data: CreateWebhookSourceDto): Promise<WebhookSource> => {
        const response = await apiClient.post<WebhookSource>('/webhook-sources', data)
        return response.data
    },

    updateSource: async (id: number, data: Partial<CreateWebhookSourceDto>): Promise<WebhookSource> => {
        const response = await apiClient.put<WebhookSource>(`/webhook-sources/${id}`, data)
        return response.data
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/webhook-sources/${id}`)
    },

    deleteSource: async (id: number): Promise<void> => {
        await apiClient.delete(`/webhook-sources/${id}`)
    },

    // Bindings
    listBindings: async (sourceId: number): Promise<AccountWebhookBinding[]> => {
        const response = await apiClient.get<AccountWebhookBinding[]>(
            `/webhook-sources/${sourceId}/bindings`
        )
        return response.data
    },

    createBinding: async (sourceId: number, data: CreateBindingDto): Promise<AccountWebhookBinding> => {
        const response = await apiClient.post<AccountWebhookBinding>(
            `/webhook-sources/${sourceId}/bindings`,
            data
        )
        return response.data
    },

    deleteBinding: async (sourceId: number, bindingId: number): Promise<void> => {
        await apiClient.delete(`/webhook-sources/${sourceId}/bindings/${bindingId}`)
    },

    // Events
    listEvents: async (filters?: WebhookEventFilters): Promise<PaginatedResponse<WebhookEvent>> => {
        const response = await apiClient.get<PaginatedResponse<WebhookEvent>>('/webhook-events', {
            params: filters,
        })
        // O interceptor do Axios agora preserva respostas paginadas
        return response.data
    },

    getEvent: async (id: number): Promise<WebhookEvent> => {
        const response = await apiClient.get<WebhookEvent>(`/webhook-events/${id}`)
        return response.data
    },

    getEventById: async (id: number): Promise<WebhookEvent> => {
        const response = await apiClient.get<WebhookEvent>(`/webhook-events/${id}`)
        return response.data
    },
}

