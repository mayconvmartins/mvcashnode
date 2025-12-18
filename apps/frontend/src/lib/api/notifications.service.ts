import { apiClient } from './client'

export interface WhatsAppGlobalConfig {
    id: number | null
    api_url: string
    api_key: string | null
    instance_name: string
    is_active: boolean
    created_at: string | null
    updated_at: string | null
}

export interface WhatsAppUserConfig {
    id: number | null
    user_id: number
    position_opened_enabled: boolean
    position_closed_enabled: boolean
    stop_loss_enabled: boolean
    take_profit_enabled: boolean
    vault_alerts_enabled: boolean
    created_at: string | null
    updated_at: string | null
}

export interface NotificationStats {
    globalConfig: {
        isActive: boolean
        apiUrl: string
        instanceName: string
    }
    alerts: {
        position: {
            total: number
            today: number
        }
        vault: {
            total: number
            today: number
        }
    }
    usersWithConfig: number
    usersWithWhatsApp?: number
}

export interface AlertHistoryItem {
    id: number
    alert_type: string
    sent_at: string
    source: 'position' | 'vault' | 'webhook' | 'other'
    position_id?: number
    vault_id?: number
    webhook_event_id?: number
    recipient?: string
    recipient_type?: 'phone' | 'group'
    status?: 'sent' | 'failed'
    error_message?: string
}

export const notificationsService = {
    // User Config
    getUserConfig: async (): Promise<WhatsAppUserConfig> => {
        const response = await apiClient.get('/notifications/config')
        return response.data
    },

    updateUserConfig: async (data: Partial<WhatsAppUserConfig>): Promise<WhatsAppUserConfig> => {
        const response = await apiClient.put('/notifications/config', data)
        return response.data
    },

    // Admin: Global Config
    getGlobalConfig: async (): Promise<WhatsAppGlobalConfig> => {
        const response = await apiClient.get('/notifications/global-config')
        return response.data
    },

    updateGlobalConfig: async (data: {
        api_url: string
        api_key?: string
        instance_name: string
        is_active: boolean
    }): Promise<WhatsAppGlobalConfig> => {
        const response = await apiClient.put('/notifications/global-config', data)
        return response.data
    },

    testConnection: async (): Promise<{ success: boolean; message: string }> => {
        const response = await apiClient.post('/notifications/test-connection')
        return response.data
    },

    // Admin: Stats & History
    getStats: async (): Promise<NotificationStats> => {
        const response = await apiClient.get('/notifications/stats')
        return response.data
    },

    getAlertHistory: async (filters?: {
        type?: string
        from?: string
        to?: string
        page?: number
        limit?: number
    }): Promise<{
        items: AlertHistoryItem[]
        total: number
        page: number
        limit: number
    }> => {
        const response = await apiClient.get('/notifications/history', { params: filters })
        return response.data
    },

    // Email Config
    getEmailConfig: async (): Promise<{
        id: number | null
        user_id: number
        password_reset_enabled: boolean
        system_alerts_enabled: boolean
        position_opened_enabled: boolean
        position_closed_enabled: boolean
        operations_enabled: boolean
    }> => {
        const response = await apiClient.get('/notifications/email-config')
        return response.data
    },

    updateEmailConfig: async (data: {
        password_reset_enabled?: boolean
        system_alerts_enabled?: boolean
        position_opened_enabled?: boolean
        position_closed_enabled?: boolean
        operations_enabled?: boolean
    }): Promise<any> => {
        const response = await apiClient.put('/notifications/email-config', data)
        return response.data
    },

    sendTestMessage: async (phone: string, message?: string): Promise<{ success: boolean; message: string }> => {
        const response = await apiClient.post('/notifications/send-test', { phone, message })
        return response.data
    },

    // Templates
    getTemplates: async (): Promise<WhatsAppNotificationTemplate[]> => {
        const response = await apiClient.get('/admin/notifications/templates')
        return response.data
    },

    getTemplate: async (id: number): Promise<WhatsAppNotificationTemplate> => {
        const response = await apiClient.get(`/admin/notifications/templates/${id}`)
        return response.data
    },

    getTemplateByType: async (type: NotificationTemplateType): Promise<WhatsAppNotificationTemplate> => {
        const response = await apiClient.get(`/admin/notifications/templates/type/${type}`)
        return response.data
    },

    createTemplate: async (data: CreateTemplateDto): Promise<WhatsAppNotificationTemplate> => {
        const response = await apiClient.post('/admin/notifications/templates', data)
        return response.data
    },

    updateTemplate: async (id: number, data: UpdateTemplateDto): Promise<WhatsAppNotificationTemplate> => {
        const response = await apiClient.put(`/admin/notifications/templates/${id}`, data)
        return response.data
    },

    deleteTemplate: async (id: number): Promise<void> => {
        await apiClient.delete(`/admin/notifications/templates/${id}`)
    },

    previewTemplate: async (id: number, variables?: Record<string, any>): Promise<{
        template: WhatsAppNotificationTemplate
        variables: Record<string, any>
        rendered: string
    }> => {
        const response = await apiClient.post(`/admin/notifications/templates/${id}/preview`, { variables })
        return response.data
    },

    setTemplateActive: async (id: number): Promise<WhatsAppNotificationTemplate> => {
        const response = await apiClient.post(`/admin/notifications/templates/${id}/set-active`)
        return response.data
    },

    // Unified Templates API
    unified: {
        listTemplates: async (channel?: NotificationChannel): Promise<UnifiedTemplateListItem[]> => {
            const params = channel ? { channel } : {}
            const response = await apiClient.get('/admin/notifications/unified-templates', { params })
            return response.data
        },

        getTemplate: async (templateType: NotificationTemplateType, channel: NotificationChannel): Promise<UnifiedTemplate | null> => {
            const response = await apiClient.get(`/admin/notifications/unified-templates/${templateType}/${channel}`)
            return response.data
        },

        saveTemplate: async (data: SaveUnifiedTemplateDto): Promise<UnifiedTemplate> => {
            const response = await apiClient.post('/admin/notifications/unified-templates', data)
            return response.data
        },

        resetTemplate: async (templateType: NotificationTemplateType, channel: NotificationChannel): Promise<{ success: boolean }> => {
            const response = await apiClient.delete(`/admin/notifications/unified-templates/${templateType}/${channel}`)
            return response.data
        },

        previewTemplate: async (
            templateType: NotificationTemplateType, 
            channel: NotificationChannel,
            customBody?: string,
            customSubject?: string
        ): Promise<{
            subject?: string
            body: string
            bodyHtml?: string
            variables: Record<string, any>
        }> => {
            const response = await apiClient.post(`/admin/notifications/unified-templates/${templateType}/${channel}/preview`, {
                customBody,
                customSubject,
            })
            return response.data
        },
    },

    // Web Push
    webpush: {
        getVapidPublicKey: async (): Promise<{ publicKey: string | null; enabled: boolean }> => {
            const response = await apiClient.get('/notifications/webpush/vapid-public-key')
            return response.data
        },

        subscribe: async (subscription: PushSubscription, deviceName?: string): Promise<{ success: boolean }> => {
            const response = await apiClient.post('/notifications/webpush/subscribe', {
                subscription: subscription.toJSON(),
                deviceName,
            })
            return response.data
        },

        unsubscribe: async (endpoint: string): Promise<{ success: boolean }> => {
            const response = await apiClient.delete('/notifications/webpush/unsubscribe', {
                data: { endpoint },
            })
            return response.data
        },

        listSubscriptions: async (): Promise<Array<{
            id: number
            endpoint: string
            deviceName: string | null
            createdAt: string
        }>> => {
            const response = await apiClient.get('/notifications/webpush/subscriptions')
            return response.data
        },

        sendTest: async (): Promise<{ success: boolean; sent: number; failed: number }> => {
            const response = await apiClient.post('/notifications/webpush/test')
            return response.data
        },
    },
}

export type NotificationTemplateType = 
    | 'WEBHOOK_RECEIVED'
    | 'TEST_MESSAGE'
    | 'POSITION_OPENED'
    | 'POSITION_CLOSED'
    | 'STOP_LOSS_TRIGGERED'
    | 'PARTIAL_TP_TRIGGERED'
    | 'POSITION_ERROR'
    | 'SL_HIT'
    | 'TP_HIT'
    | 'SG_HIT'
    | 'TSG_HIT'
    | 'TRADE_ERROR'
    | 'PASSWORD_RESET'
    | 'WELCOME'
    | 'SUBSCRIPTION_ACTIVATED'
    | 'SUBSCRIPTION_EXPIRING'
    | 'SUBSCRIPTION_EXPIRED'

export type NotificationChannel = 'whatsapp' | 'email' | 'webpush'

export interface WhatsAppNotificationTemplate {
    id: number
    template_type: NotificationTemplateType
    name: string
    subject: string | null
    body: string
    variables_json: any
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface UnifiedTemplate {
    templateType: NotificationTemplateType
    channel: NotificationChannel
    name: string
    subject?: string
    body: string
    bodyHtml?: string
    iconUrl?: string
    actionUrl?: string
    variables: string[]
    isCustom: boolean
    isActive: boolean
    id?: number
}

export interface UnifiedTemplateListItem {
    templateType: NotificationTemplateType
    channel: NotificationChannel
    name: string
    isCustom: boolean
    isActive: boolean
    id?: number
}

export interface SaveUnifiedTemplateDto {
    templateType: NotificationTemplateType
    channel: NotificationChannel
    name: string
    subject?: string
    body: string
    bodyHtml?: string
    iconUrl?: string
    actionUrl?: string
    isActive?: boolean
}

export interface CreateTemplateDto {
    template_type: NotificationTemplateType
    name: string
    subject?: string
    body: string
    variables_json?: any
    is_active?: boolean
}

export interface UpdateTemplateDto {
    name?: string
    subject?: string
    body?: string
    variables_json?: any
    is_active?: boolean
}

