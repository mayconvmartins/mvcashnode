import { apiClient } from './client'

export interface WebhookMonitorAlert {
  id: number
  webhook_source_id: number
  webhook_event_id: number
  exchange_account_id: number | null
  symbol: string
  trade_mode: string
  price_alert: number
  price_minimum: number
  current_price: number | null
  state: 'MONITORING' | 'EXECUTED' | 'CANCELLED'
  monitoring_status: 'FALLING' | 'LATERAL' | 'RISING' | null
  cycles_without_new_low: number
  last_price_check_at: string | null
  executed_trade_job_id: number | null
  cancel_reason: string | null
  exit_reason: string | null
  created_at: string
  updated_at: string
  webhook_source?: {
    id: number
    label: string
    webhook_code: string
  }
  exchange_account?: {
    id: number
    label: string
    exchange: string
  }
  webhook_event?: {
    id: number
    action: string
    created_at: string
  }
}

export interface WebhookMonitorConfig {
  monitor_enabled: boolean
  check_interval_sec: number
  lateral_tolerance_pct: number
  lateral_cycles_min: number
  rise_trigger_pct: number
  rise_cycles_min: number
  max_fall_pct: number
  max_monitoring_time_min: number
  cooldown_after_execution_min: number
}

export const webhookMonitorService = {
  async listAlerts(): Promise<WebhookMonitorAlert[]> {
    const response = await apiClient.get<WebhookMonitorAlert[]>('/webhooks/monitor/alerts')
    return response.data
  },

  async getAlert(id: number): Promise<WebhookMonitorAlert> {
    const response = await apiClient.get<WebhookMonitorAlert>(`/webhooks/monitor/alerts/${id}`)
    return response.data
  },

  async cancelAlert(id: number, reason?: string): Promise<void> {
    await apiClient.post(`/webhooks/monitor/alerts/${id}/cancel`, { reason })
  },

  async getHistory(filters?: {
    symbol?: string
    state?: 'EXECUTED' | 'CANCELLED'
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<WebhookMonitorAlert[]> {
    const params = new URLSearchParams()
    if (filters?.symbol) params.append('symbol', filters.symbol)
    if (filters?.state) params.append('state', filters.state)
    if (filters?.startDate) params.append('startDate', filters.startDate)
    if (filters?.endDate) params.append('endDate', filters.endDate)
    if (filters?.limit) params.append('limit', filters.limit.toString())

    const response = await apiClient.get<WebhookMonitorAlert[]>(`/webhooks/monitor/history?${params.toString()}`)
    return response.data
  },

  async getConfig(): Promise<WebhookMonitorConfig> {
    const response = await apiClient.get<WebhookMonitorConfig>('/webhooks/monitor/config')
    return response.data
  },

  async updateConfig(config: Partial<WebhookMonitorConfig>): Promise<WebhookMonitorConfig> {
    const response = await apiClient.put<WebhookMonitorConfig>('/webhooks/monitor/config', config)
    return response.data
  },
}

