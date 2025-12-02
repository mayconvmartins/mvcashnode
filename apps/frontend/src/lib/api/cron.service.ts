import { apiClient } from './client'

export interface CronJobConfig {
    id: number
    name: string
    description: string
    queue_name: string
    job_id: string
    interval_ms: number
    status: 'ACTIVE' | 'PAUSED' | 'DISABLED'
    enabled: boolean
    timeout_ms?: number
    max_retries: number
    config_json?: any
    created_at: string
    updated_at: string
    updated_by?: number
    statistics?: {
        total_runs: number
        success_count: number
        failure_count: number
        avg_duration_ms: number
        success_rate?: number
    }
    last_execution?: {
        started_at: string
        duration_ms: number
        status: string
        result_json?: any
    }
    next_execution?: string
    bullmq_status?: string
}

export interface CronJobExecution {
    id: number
    job_config_id: number
    started_at: string
    finished_at?: string
    duration_ms?: number
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'RUNNING'
    result_json?: any
    error_message?: string
    triggered_by: 'SCHEDULED' | 'MANUAL'
    job_config?: {
        name: string
        description: string
    }
}

export interface UpdateCronJobDto {
    description?: string
    interval_ms?: number
    status?: 'ACTIVE' | 'PAUSED' | 'DISABLED'
    enabled?: boolean
    timeout_ms?: number
    max_retries?: number
    config_json?: any
}

class CronService {
    async getAllJobs(): Promise<CronJobConfig[]> {
        const { data } = await apiClient.get('/monitoring/cron/jobs')
        return data
    }

    async getJobByName(name: string): Promise<{
        job: CronJobConfig
        statistics: any
        executions: CronJobExecution[]
    }> {
        const { data } = await apiClient.get(`/monitoring/cron/jobs/${name}`)
        return data
    }

    async updateJob(name: string, dto: UpdateCronJobDto): Promise<CronJobConfig> {
        const { data } = await apiClient.put(`/monitoring/cron/jobs/${name}`, dto)
        return data
    }

    async pauseJob(name: string): Promise<CronJobConfig> {
        const { data } = await apiClient.post(`/monitoring/cron/jobs/${name}/pause`)
        return data
    }

    async resumeJob(name: string): Promise<CronJobConfig> {
        const { data } = await apiClient.post(`/monitoring/cron/jobs/${name}/resume`)
        return data
    }

    async executeManually(name: string): Promise<any> {
        const { data } = await apiClient.post(`/monitoring/cron/jobs/${name}/execute`)
        return data
    }

    async getExecutionHistory(name?: string, limit?: number): Promise<CronJobExecution[]> {
        const { data } = await apiClient.get('/monitoring/cron/history', {
            params: { name, limit },
        })
        return data
    }

    async initializeJobs(): Promise<any> {
        const { data } = await apiClient.post('/monitoring/cron/initialize')
        return data
    }
}

export const cronService = new CronService()

