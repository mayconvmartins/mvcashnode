import { apiClient } from './client'

export interface ProcessMetrics {
    pid: number
    name: string
    cpu: number
    memory: number
    uptime: number
    status: 'running' | 'stopped' | 'error'
    lastUpdate: string
    // Informações de cluster PM2
    pm2_id?: number
    instances?: number
    exec_mode?: 'cluster' | 'fork'
    cluster_instances?: Array<{
        pid: number
        cpu: number
        memory: number
        status: string
    }>
}

export interface SystemMetrics {
    cpu: {
        usage: number
        cores: number
        speed: number
    }
    memory: {
        total: number
        used: number
        free: number
        usagePercent: number
    }
    disk: {
        total: number
        used: number
        free: number
        usagePercent: number
    }
    uptime: number
    timestamp: string
}

export interface JobMetrics {
    name: string
    description: string
    status: 'active' | 'paused' | 'disabled'
    lastExecution?: {
        timestamp: string
        duration: number
        result: 'success' | 'failed'
        data?: any
    }
    nextExecution?: string
    statistics: {
        totalRuns: number
        successCount: number
        failureCount: number
        avgDuration: number
    }
}

export interface SystemAlert {
    id: number
    alert_type: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    service_name?: string
    metadata_json?: any
    created_at: string
    resolved_at?: string
    resolved_by?: number
}

export interface SystemStatus {
    services: {
        api?: ProcessMetrics
        executor?: ProcessMetrics
        monitors?: ProcessMetrics
        frontend?: ProcessMetrics
        site?: ProcessMetrics
        backup?: ProcessMetrics
        [key: string]: ProcessMetrics | undefined
    }
    resources: {
        database: { status: string; responseTime?: number }
        redis: { status: string; responseTime?: number }
    }
    system: SystemMetrics
    alerts: {
        critical: number
        high: number
        medium: number
        low: number
    }
}

class MonitoringService {
    async getStatus(): Promise<SystemStatus> {
        const { data } = await apiClient.get('/monitoring/status')
        return data
    }

    async getProcesses(): Promise<ProcessMetrics[]> {
        const { data } = await apiClient.get('/monitoring/processes')
        return data
    }

    async getJobs(): Promise<JobMetrics[]> {
        const { data } = await apiClient.get('/monitoring/jobs')
        return data
    }

    async getAlerts(): Promise<SystemAlert[]> {
        const { data } = await apiClient.get('/monitoring/alerts')
        return data
    }

    async resolveAlert(alertId: number): Promise<void> {
        await apiClient.post(`/monitoring/alerts/${alertId}/resolve`)
    }

    async getHistory(service?: string, limit?: number): Promise<any[]> {
        const { data } = await apiClient.get('/monitoring/history', {
            params: { service, limit },
        })
        return data
    }

    async getMetrics(hours?: number): Promise<Record<string, any[]>> {
        const { data } = await apiClient.get('/monitoring/metrics', {
            params: { hours },
        })
        return data
    }

    async getBackendLogs(options?: {
        level?: string
        from?: string
        to?: string
        search?: string
        limit?: number
    }): Promise<any[]> {
        const response = await apiClient.get<{ data: any[] }>('/monitoring/backend-logs', {
            params: options,
        })
        // O endpoint retorna { data: logs[] }, então extrair o array
        return response.data?.data || response.data || []
    }

    async cleanupOrphanedPositions(): Promise<{
        checked: number
        deleted: number
        errors: string[]
    }> {
        const { data } = await apiClient.post('/monitoring/cleanup-orphaned-positions')
        return data
    }
}

export const monitoringService = new MonitoringService()

