import { apiClient } from './client'
import type { User, UserRole, PaginatedResponse } from '@/lib/types'

export interface AdminUserFilters {
    role?: UserRole
    is_active?: boolean
    email?: string
    page?: number
    limit?: number
}

export interface CreateUserDto {
    email: string
    password: string
    roles: UserRole[]
    profile?: {
        full_name: string
        phone?: string
        whatsapp_phone?: string
    }
}

export interface UpdateUserDto {
    email?: string
    roles?: UserRole[]
    is_active?: boolean
    profile?: {
        full_name?: string
        phone?: string
        whatsapp_phone?: string
        position_alerts_enabled?: boolean
    }
}

export interface AuditLogFilters {
    user_id?: number
    entity_type?: string
    action?: string
    from?: string
    to?: string
    page?: number
    limit?: number
    search?: string
}

export interface SystemAuditLogFilters {
    service?: string
    severity?: string
    from?: string
    to?: string
    page: number
    limit: number
}

export const adminService = {
    // Users
    listUsers: async (filters?: AdminUserFilters): Promise<PaginatedResponse<User>> => {
        const response = await apiClient.get<PaginatedResponse<User>>('/admin/users', {
            params: filters,
        })
        return response.data
    },

    getUser: async (id: number): Promise<User> => {
        const response = await apiClient.get<User>(`/admin/users/${id}`)
        return response.data
    },

    createUser: async (data: CreateUserDto): Promise<User> => {
        const response = await apiClient.post<User>('/admin/users', data)
        return response.data
    },

    updateUser: async (id: number, data: UpdateUserDto): Promise<User> => {
        const response = await apiClient.put<User>(`/admin/users/${id}`, data)
        return response.data
    },

    deleteUser: async (id: number): Promise<void> => {
        await apiClient.delete(`/admin/users/${id}`)
    },

    activateUser: async (id: number): Promise<User> => {
        const response = await apiClient.post<User>(`/admin/users/${id}/activate`)
        return response.data
    },

    resetPassword: async (id: number): Promise<{ message: string }> => {
        const response = await apiClient.post(`/admin/users/${id}/reset-password`)
        return response.data
    },

    resetUserPassword: async (userId: string | number, data: { newPassword: string }): Promise<{ message: string }> => {
        const response = await apiClient.post(`/admin/users/${userId}/reset-password`, data)
        return response.data
    },

    changeUserPassword: async (
        userId: string | number,
        data: { newPassword: string; mustChangePassword?: boolean }
    ): Promise<{ message: string }> => {
        const response = await apiClient.put(`/admin/users/${userId}/change-password`, data)
        return response.data
    },

    resetUser2FA: async (userId: string | number): Promise<{ message: string }> => {
        const response = await apiClient.post(`/admin/users/${userId}/reset-2fa`)
        return response.data
    },

    getUserAuditLogs: async (
        id: number,
        page: number,
        limit: number
    ): Promise<PaginatedResponse<any>> => {
        const response = await apiClient.get<PaginatedResponse<any>>(
            `/admin/users/${id}/audit-logs`,
            {
                params: { page, limit },
            }
        )
        return response.data
    },

    // System Health
    getHealth: async (): Promise<any> => {
        const response = await apiClient.get('/admin/health')
        return response.data
    },

    getMetrics: async (): Promise<any> => {
        const response = await apiClient.get('/admin/metrics')
        return response.data
    },

    // Admin Dashboard Stats
    getStats: async (): Promise<{
        totalUsers: number
        activeUsers: number
        activeSessions: number
        auditEvents: number
        uptime: string
        openPositions: number
        totalTrades: number
        recentActivity: Array<{
            id: number
            action: string
            user: string
            timestamp: string
            entityType?: string
            entityId?: number
        }>
        alerts: Array<{
            id: number
            level: string
            title: string
            message: string
            timestamp: string
        }>
    }> => {
        const response = await apiClient.get('/admin/stats')
        return response.data
    },

    // Audit Logs
    getAuditLogs: async (filters?: AuditLogFilters): Promise<PaginatedResponse<any>> => {
        const response = await apiClient.get<PaginatedResponse<any>>('/admin/audit-logs', {
            params: filters,
        })
        return response.data
    },

    getSystemAuditLogs: async (
        filters: SystemAuditLogFilters
    ): Promise<PaginatedResponse<any>> => {
        const response = await apiClient.get<PaginatedResponse<any>>('/admin/audit-logs/system', {
            params: filters,
        })
        return response.data
    },

    getAuditLog: async (id: number): Promise<any> => {
        const response = await apiClient.get(`/admin/audit-logs/${id}`)
        return response.data
    },

    // User Impersonation
    impersonateUser: async (id: number): Promise<{
        message: string
        accessToken: string
        user: {
            id: number
            email: string
            full_name: string
            roles: string[]
        }
        expiresIn: number
        impersonatedBy: {
            id: number
            email: string
        }
    }> => {
        const response = await apiClient.post(`/admin/users/${id}/impersonate`)
        return response.data
    },

    // System Operations
    syncExecutionFees: async (): Promise<{
        total_checked: number
        updated: number
        errors: number
        error_details?: Array<{ executionId: number; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/sync-execution-fees', {}, {
            timeout: 300000, // 5 minutos para sincronização (pode processar muitas execuções)
        })
        return response.data
    },

    fixIncorrectFees: async (): Promise<{
        total_checked: number
        fixed: number
        errors: number
        error_details?: Array<{ executionId: number; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/fix-incorrect-fees', {}, {
            timeout: 300000, // 5 minutos para correção
        })
        return response.data
    },

    auditAll: async (): Promise<{
        total_positions_checked: number
        total_executions_checked: number
        discrepancies_found: number
        discrepancies: Array<{
            type: string
            entityType: 'EXECUTION' | 'POSITION'
            entityId: number
            field: string
            currentValue: number | string
            expectedValue: number | string
            canAutoFix: boolean
            fixDescription: string
        }>
        errors: number
        error_details?: Array<{ positionId?: number; executionId?: number; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/audit-all', {}, {
            timeout: 1800000, // 30 minutos para auditoria completa (pode processar muitas posições)
        })
        return response.data
    },

    auditFix: async (corrections: Array<{
        type: string
        entityType: 'EXECUTION' | 'POSITION'
        entityId: number
        field: string
        expectedValue: number | string
    }>): Promise<{
        total_corrections: number
        fixed: number
        errors: number
        error_details?: Array<{ correction: any; error: string }>
        duration_ms?: number
    }> => {
        const response = await apiClient.post('/admin/system/audit-fix', { corrections }, {
            timeout: 300000, // 5 minutos para correção
        })
        return response.data
    },
}

