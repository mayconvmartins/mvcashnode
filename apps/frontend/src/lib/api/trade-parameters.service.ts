import { apiClient } from './client'
import type { TradeParameter } from '@/lib/types'

export interface CreateTradeParameterDto {
    exchange_account_id: number
    symbol: string
    side: 'BUY' | 'SELL' | 'BOTH'
    quote_amount_fixed?: number
    quote_amount_pct_balance?: number
    max_orders_per_hour?: number
    min_interval_sec?: number
    order_type_default: 'MARKET' | 'LIMIT' | 'STOP_LIMIT'
    slippage_bps?: number
    default_sl_enabled: boolean
    default_sl_pct?: number
    default_tp_enabled: boolean
    default_tp_pct?: number
    trailing_stop_enabled: boolean
    trailing_distance_pct?: number
    vault_id?: number
}

export interface UpdateTradeParameterDto extends Partial<CreateTradeParameterDto> {}

export const tradeParametersService = {
    list: async (): Promise<TradeParameter[]> => {
        const response = await apiClient.get<TradeParameter[]>('/trade-parameters')
        return response.data
    },

    create: async (data: CreateTradeParameterDto): Promise<TradeParameter> => {
        const response = await apiClient.post<TradeParameter>('/trade-parameters', data)
        return response.data
    },

    update: async (id: number, data: UpdateTradeParameterDto): Promise<TradeParameter> => {
        const response = await apiClient.put<TradeParameter>(`/trade-parameters/${id}`, data)
        return response.data
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/trade-parameters/${id}`)
    },
}

