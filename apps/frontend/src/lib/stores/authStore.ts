import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/types'

interface AuthState {
    user: User | null
    accessToken: string | null
    refreshToken: string | null
    isAuthenticated: boolean
    rememberMe: boolean
    setTokens: (accessToken: string, refreshToken: string, rememberMe?: boolean) => void
    setUser: (user: User) => void
    logout: () => void
    getRememberMe: () => boolean
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            rememberMe: false,

            setTokens: (accessToken, refreshToken, rememberMe = false) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('accessToken', accessToken)
                    localStorage.setItem('refreshToken', refreshToken)
                    
                    // Salvar preferência rememberMe
                    if (rememberMe) {
                        localStorage.setItem('rememberMe', 'true')
                    } else {
                        localStorage.removeItem('rememberMe')
                    }
                    
                    // Salvar nos cookies para o middleware do Next.js
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
                set({ accessToken, refreshToken, isAuthenticated: true, rememberMe })
            },

            getRememberMe: () => {
                if (typeof window !== 'undefined') {
                    return localStorage.getItem('rememberMe') === 'true'
                }
                return false
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
                })
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
            }),
        }
    )
)
