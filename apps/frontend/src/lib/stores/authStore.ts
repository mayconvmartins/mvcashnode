import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/types'

interface AuthState {
    user: User | null
    accessToken: string | null
    refreshToken: string | null
    isAuthenticated: boolean
    rememberMe: boolean
    tokenExpiresAt: number | null // Timestamp de expiração
    setTokens: (accessToken: string, refreshToken: string, rememberMe?: boolean, expiresIn?: number) => void
    setUser: (user: User) => void
    logout: () => void
    getRememberMe: () => boolean
    isTokenExpiringSoon: () => boolean
    initializeFromStorage: () => void
}

// Helper para parsear o JWT e extrair a expiração
function parseJwtExpiration(token: string): number | null {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const payload = JSON.parse(atob(parts[1]))
        return payload.exp ? payload.exp * 1000 : null // Converter para ms
    } catch {
        return null
    }
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            rememberMe: false,
            tokenExpiresAt: null,

            setTokens: (accessToken, refreshToken, rememberMe = false, expiresIn) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('accessToken', accessToken)
                    localStorage.setItem('refreshToken', refreshToken)
                    
                    // Salvar preferência rememberMe
                    if (rememberMe) {
                        localStorage.setItem('rememberMe', 'true')
                    } else {
                        localStorage.removeItem('rememberMe')
                    }
                    
                    // Salvar timestamp de expiração
                    let expiresAt = parseJwtExpiration(accessToken)
                    if (!expiresAt && expiresIn) {
                        expiresAt = Date.now() + expiresIn * 1000
                    }
                    if (expiresAt) {
                        localStorage.setItem('tokenExpiresAt', expiresAt.toString())
                    }
                    
                    // Salvar nos cookies para o middleware do Next.js
                    // Cookies com duração fixa - o refresh automático mantém a sessão
                    const expiresAccess = new Date()
                    if (rememberMe) {
                        expiresAccess.setDate(expiresAccess.getDate() + 30) // 30 dias com rememberMe
                    } else {
                        expiresAccess.setDate(expiresAccess.getDate() + 7) // 7 dias sem rememberMe
                    }
                    document.cookie = `accessToken=${accessToken}; path=/; expires=${expiresAccess.toUTCString()}; SameSite=Lax`
                    
                    const expiresRefresh = new Date()
                    expiresRefresh.setDate(expiresRefresh.getDate() + 30) // 30 dias (sempre)
                    document.cookie = `refreshToken=${refreshToken}; path=/; expires=${expiresRefresh.toUTCString()}; SameSite=Lax`
                }
                set({ 
                    accessToken, 
                    refreshToken, 
                    isAuthenticated: true, 
                    rememberMe,
                    tokenExpiresAt: parseJwtExpiration(accessToken)
                })
            },

            getRememberMe: () => {
                if (typeof window !== 'undefined') {
                    return localStorage.getItem('rememberMe') === 'true'
                }
                return false
            },

            // Verifica se o token vai expirar nos próximos 5 minutos
            isTokenExpiringSoon: () => {
                const state = get()
                if (!state.tokenExpiresAt) return false
                const fiveMinutes = 5 * 60 * 1000
                return Date.now() + fiveMinutes > state.tokenExpiresAt
            },

            // Inicializa o estado a partir do localStorage (útil para SSR/hydration)
            initializeFromStorage: () => {
                if (typeof window !== 'undefined') {
                    const accessToken = localStorage.getItem('accessToken')
                    const refreshToken = localStorage.getItem('refreshToken')
                    const rememberMe = localStorage.getItem('rememberMe') === 'true'
                    const tokenExpiresAtStr = localStorage.getItem('tokenExpiresAt')
                    const tokenExpiresAt = tokenExpiresAtStr ? parseInt(tokenExpiresAtStr) : null
                    
                    if (accessToken && refreshToken) {
                        set({
                            accessToken,
                            refreshToken,
                            isAuthenticated: true,
                            rememberMe,
                            tokenExpiresAt,
                        })
                    }
                }
            },

            setUser: (user) => {
                set({ user, isAuthenticated: true })
            },

            logout: () => {
                if (typeof window !== 'undefined') {
                    // Limpar todos os tokens e flags de impersonation
                    localStorage.removeItem('accessToken')
                    localStorage.removeItem('refreshToken')
                    localStorage.removeItem('rememberMe')
                    localStorage.removeItem('tokenExpiresAt')
                    localStorage.removeItem('isImpersonating')
                    localStorage.removeItem('originalAdminToken')
                    localStorage.removeItem('originalAdminRefreshToken')
                    
                    // Remover dos cookies
                    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
                    document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
                }
                set({
                    user: null,
                    accessToken: null,
                    refreshToken: null,
                    isAuthenticated: false,
                    rememberMe: false,
                    tokenExpiresAt: null,
                })
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                rememberMe: state.rememberMe,
            }),
        }
    )
)
