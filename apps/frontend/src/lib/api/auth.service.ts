import { apiClient } from './client'
import type { LoginResponse, RefreshTokenResponse, User } from '@/lib/types'

export interface LoginDto {
    email: string
    password: string
    twoFactorCode?: string
    rememberMe?: boolean
}

export interface Verify2FADto {
    token: string
}

export interface ChangePasswordRequiredDto {
    email: string
    currentPassword: string
    newPassword: string
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

    setup2FA: async (): Promise<{ secret: string; qrCode: string; qrCodeUrl?: string; backupCodes?: string[] }> => {
        const response = await apiClient.post('/auth/2fa/setup')
        return response.data
    },

    verify2FA: async (data: Verify2FADto): Promise<{ valid: boolean; message: string }> => {
        const response = await apiClient.post('/auth/2fa/verify', data)
        return response.data
    },

    getMe: async (): Promise<User> => {
        const response = await apiClient.get<User>('/users/me')
        return response.data
    },

    updateMe: async (data: Partial<User>): Promise<User> => {
        const response = await apiClient.put<User>('/users/me', data)
        return response.data
    },

    getLoginHistory: async (): Promise<any[]> => {
        const response = await apiClient.get('/users/me/login-history')
        return response.data
    },

    changePasswordRequired: async (data: ChangePasswordRequiredDto): Promise<{ message: string }> => {
        const response = await apiClient.post('/auth/change-password-required', data)
        return response.data
    },

    forgotPassword: async (email: string): Promise<{ message: string }> => {
        const response = await apiClient.post('/auth/forgot-password', { email })
        return response.data
    },

    resetPassword: async (data: { token: string; newPassword: string }): Promise<{ message: string }> => {
        const response = await apiClient.post('/auth/reset-password', data)
        return response.data
    },
}
