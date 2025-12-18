import { apiClient } from './client'

export interface PositionSettings {
    current_value: number;
    min_value: number;
    max_value: number | null;
    default_value: number;
    message: string;
}

export interface SymbolPerformance {
    symbol: string;
    pnl: number;
    pnlPct: number;
}

export interface PositionBySymbol {
    symbol: string;
    open: number;
    closed: number;
}

export interface SubscriberDashboard {
    // Resumo principal
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalInvestment: number;
    totalPnL: number;
    realizedPnL: number;
    unrealizedPnL: number;
    capitalInvested: number;
    
    // ROI
    roiAccumulated: number;
    roiRealized: number;
    roiUnrealized: number;
    
    // Top símbolos
    topProfitable: SymbolPerformance[];
    topLosses: SymbolPerformance[];
    
    // Gráficos
    positionsBySymbol: PositionBySymbol[];
}

export type PeriodOption = 'today' | 'last7days' | 'currentMonth' | 'previousMonth';

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

    getDashboard: async (tradeMode: 'REAL' | 'SIMULATION', period: PeriodOption = 'today'): Promise<SubscriberDashboard> => {
        const response = await apiClient.get<SubscriberDashboard>('/subscriber/dashboard', {
            params: { trade_mode: tradeMode, period }
        })
        return response.data
    },
}

