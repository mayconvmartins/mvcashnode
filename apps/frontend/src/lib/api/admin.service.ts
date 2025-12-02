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
}

