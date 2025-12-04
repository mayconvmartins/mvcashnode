import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/types'

interface AuthState {
    user: User | null
    accessToken: string | null
    refreshToken: string | null
    isAuthenticated: boolean
    setTokens: (accessToken: string, refreshToken: string) => void
    setUser: (user: User) => void
    logout: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,

            setTokens: (accessToken, refreshToken) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('accessToken', accessToken)
                    localStorage.setItem('refreshToken', refreshToken)
                    
                    // Salvar nos cookies para o middleware do Next.js
                    const expiresAccess = new Date()
                    expiresAccess.setDate(expiresAccess.getDate() + 7) // 7 dias
                    document.cookie = `accessToken=${accessToken}; path=/; expires=${expiresAccess.toUTCString()}; SameSite=Lax`
                    
                    const expiresRefresh = new Date()
                    expiresRefresh.setDate(expiresRefresh.getDate() + 30) // 30 dias
                    document.cookie = `refreshToken=${refreshToken}; path=/; expires=${expiresRefresh.toUTCString()}; SameSite=Lax`
                }
                set({ accessToken, refreshToken, isAuthenticated: true })
            },

            setUser: (user) => {
                set({ user, isAuthenticated: true })
            },

            logout: () => {
                if (typeof window !== 'undefined') {
                    // Limpar todos os tokens e flags de impersonation
                    localStorage.removeItem('accessToken')
                    localStorage.removeItem('refreshToken')
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
