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
}

export interface AlertHistoryItem {
    id: number
    alert_type: string
    sent_at: string
    source: 'position' | 'vault'
    position_id?: number
    vault_id?: number
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

    sendTestMessage: async (phone: string, message?: string): Promise<{ success: boolean; message: string }> => {
        const response = await apiClient.post('/notifications/send-test', { phone, message })
        return response.data
    },
}

