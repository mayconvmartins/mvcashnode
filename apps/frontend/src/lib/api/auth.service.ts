import { apiClient } from './client'
import type { LoginResponse, RefreshTokenResponse, User } from '@/lib/types'

export interface LoginDto {
    email: string
    password: string
    twoFactorCode?: string
}

export interface Verify2FADto {
    token: string
}

export const authService = {
    login: async (data: LoginDto): Promise<LoginResponse> => {
        const response = await apiClient.post<LoginResponse>('/auth/login', data)
        return response.data
    },

    refresh: async (refreshToken: string): Promise<RefreshTokenResponse> => {
        const response = await apiClient.post<RefreshTokenResponse>('/auth/refresh', {
            refreshToken,
        })
        return response.data
    },

    setup2FA: async (): Promise<{ secret: string; qrCode: string; backupCodes: string[] }> => {
        const response = await apiClient.post('/auth/2fa/setup')
        return response.data
    },

    verify2FA: async (data: Verify2FADto): Promise<{ valid: boolean; message: string }> => {
        const response = await apiClient.post('/auth/2fa/verify', data)
        return response.data
    },

    getMe: async (): Promise<User> => {
        const response = await apiClient.get<User>('/me')
        return response.data
    },

    updateMe: async (data: Partial<User>): Promise<User> => {
        const response = await apiClient.put<User>('/me', data)
        return response.data
    },

    getLoginHistory: async (): Promise<any[]> => {
        const response = await apiClient.get('/me/login-history')
        return response.data
    },
}
