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

export interface LoginPreflightResponse {
    email: string
    provider: 'native' | 'mvm_pay'
    exists_local: boolean
    has_mvm_access: boolean
    pending_activation: boolean
    allow_password: boolean
    allow_passkey: boolean
    has_passkeys: boolean
    suggested_action: 'activate' | 'passkey' | 'password'
}

export interface ChangePasswordRequiredDto {
    email: string
    currentPassword: string
    newPassword: string
}

export interface PasskeyInfo {
    id: number
    deviceName: string | null
    createdAt: string
    lastUsedAt: string | null
    transports: string | null
}

export interface SessionInfo {
    id: number
    deviceName: string | null
    deviceType: string | null
    browser: string | null
    os: string | null
    ipAddress: string | null
    isPasskeyAuth: boolean
    lastActivityAt: string
    createdAt: string
    isCurrent: boolean
}

export const authService = {
    login: async (data: LoginDto): Promise<LoginResponse> => {
        const response = await apiClient.post<LoginResponse>('/auth/login', data)
        return response.data
    },

    loginPreflight: async (email: string): Promise<LoginPreflightResponse> => {
        const response = await apiClient.post<LoginPreflightResponse>('/auth/login-preflight', { email })
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

    // ============================================
    // PASSKEYS
    // ============================================

    checkEmailHasPasskeys: async (email: string): Promise<{ hasPasskeys: boolean }> => {
        const response = await apiClient.post('/auth/passkeys/check-email', { email })
        return response.data
    },

    passkeyRegisterStart: async (deviceName?: string): Promise<any> => {
        const response = await apiClient.post('/auth/passkeys/register/start', { deviceName })
        return response.data
    },

    passkeyRegisterFinish: async (response: any, deviceName?: string): Promise<PasskeyInfo> => {
        const result = await apiClient.post('/auth/passkeys/register/finish', { response, deviceName })
        return result.data
    },

    passkeyAuthenticateStart: async (email?: string): Promise<any> => {
        const response = await apiClient.post('/auth/passkeys/authenticate/start', { email })
        return response.data
    },

    passkeyAuthenticateFinish: async (response: any, email?: string, rememberMe?: boolean): Promise<LoginResponse> => {
        const result = await apiClient.post('/auth/passkeys/authenticate/finish', { response, email, rememberMe })
        return result.data
    },

    listPasskeys: async (): Promise<PasskeyInfo[]> => {
        const response = await apiClient.get('/auth/passkeys')
        return response.data
    },

    updatePasskeyName: async (id: number, deviceName: string): Promise<PasskeyInfo> => {
        const response = await apiClient.put(`/auth/passkeys/${id}`, { deviceName })
        return response.data
    },

    deletePasskey: async (id: number): Promise<void> => {
        await apiClient.delete(`/auth/passkeys/${id}`)
    },

    // ============================================
    // SESSIONS
    // ============================================

    listSessions: async (): Promise<SessionInfo[]> => {
        const response = await apiClient.get('/auth/sessions')
        return response.data
    },

    terminateSession: async (id: number): Promise<void> => {
        await apiClient.delete(`/auth/sessions/${id}`)
    },

    terminateOtherSessions: async (): Promise<{ terminatedCount: number }> => {
        const response = await apiClient.delete('/auth/sessions/others')
        return response.data
    },

    terminateAllSessions: async (): Promise<{ terminatedCount: number }> => {
        const response = await apiClient.delete('/auth/sessions/all')
        return response.data
    },
}
