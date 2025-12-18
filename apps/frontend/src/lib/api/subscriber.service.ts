import { apiClient } from './client'

export interface PositionSettings {
    current_value: number;
    min_value: number;
    max_value: number | null;
    default_value: number;
    message: string;
}

export interface SubscriberDashboard {
    total_positions: number;
    open_positions: number;
    accounts_count: number;
    position_settings: PositionSettings | null;
}

export const subscriberService = {
    // ============================================
    // POSITION SETTINGS
    // ============================================

    getPositionSettings: async (): Promise<PositionSettings> => {
        const response = await apiClient.get<PositionSettings>('/subscriber/position-settings')
        return response.data
    },

    updatePositionSettings: async (data: { quote_amount_fixed: number }): Promise<{
        success: boolean;
        message: string;
        data: {
            current_value: number;
            min_value: number;
            max_value: number | null;
        };
    }> => {
        const response = await apiClient.put('/subscriber/position-settings', data)
        return response.data
    },

    // ============================================
    // DASHBOARD
    // ============================================

    getDashboard: async (): Promise<SubscriberDashboard> => {
        const response = await apiClient.get<SubscriberDashboard>('/subscriber/dashboard')
        return response.data
    },
}

