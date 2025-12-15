import { apiClient } from './client'
import type { TradeParameter, PaginatedResponse } from '@/lib/types'

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
    min_profit_pct?: number
    vault_id?: number
}

export interface UpdateTradeParameterDto extends Partial<CreateTradeParameterDto> {}

export const tradeParametersService = {
    list: async (): Promise<TradeParameter[]> => {
        const response = await apiClient.get<PaginatedResponse<TradeParameter> | TradeParameter[]>('/trade-parameters')
        // Backend agora retorna formato paginado { data: [...], pagination: {...} }
        // Extrair array de dados da resposta paginada
        const isPaginated = response.data && typeof response.data === 'object' && 'data' in response.data
        return isPaginated ? (response.data as PaginatedResponse<TradeParameter>).data : (response.data as TradeParameter[])
    },

    getById: async (id: string | number): Promise<TradeParameter> => {
        const response = await apiClient.get<TradeParameter>(`/trade-parameters/${id}`)
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

