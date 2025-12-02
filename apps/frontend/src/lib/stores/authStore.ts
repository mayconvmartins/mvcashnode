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
                }
                set({ accessToken, refreshToken, isAuthenticated: true })
            },

            setUser: (user) => {
                set({ user, isAuthenticated: true })
            },

            logout: () => {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('accessToken')
                    localStorage.removeItem('refreshToken')
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
