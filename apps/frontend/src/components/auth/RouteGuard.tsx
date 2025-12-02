'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'
import { Spinner } from '@/components/ui/spinner'

interface RouteGuardProps {
    children: React.ReactNode
    requireAuth?: boolean
    requireAdmin?: boolean
}

export function RouteGuard({ children, requireAuth = true, requireAdmin = false }: RouteGuardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const { isAuthenticated, user, setTokens, setUser } = useAuthStore()
    const [isLoading, setIsLoading] = useState(true)
    const [hasToken, setHasToken] = useState(false)

    useEffect(() => {
        // Verificar se há token nos cookies ou localStorage
        const checkAuth = () => {
            if (typeof window === 'undefined') return

            // Verificar cookie
            const cookies = document.cookie.split('; ')
            const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='))
            
            // Verificar localStorage
            const accessTokenLS = localStorage.getItem('accessToken')
            const refreshTokenLS = localStorage.getItem('refreshToken')
            
            const hasAuthToken = !!(accessTokenCookie || accessTokenLS)
            setHasToken(hasAuthToken)

            // Se tem token mas o store não está autenticado, restaurar do localStorage
            if (hasAuthToken && !isAuthenticated && accessTokenLS && refreshTokenLS) {
                setTokens(accessTokenLS, refreshTokenLS)
                
                // Tentar carregar o usuário do localStorage
                try {
                    const authStorage = localStorage.getItem('auth-storage')
                    if (authStorage) {
                        const parsed = JSON.parse(authStorage)
                        if (parsed.state?.user) {
                            setUser(parsed.state.user)
                        }
                    }
                } catch (e) {
                    console.error('Erro ao restaurar usuário:', e)
                }
            }

            setIsLoading(false)
        }

        // Aguardar um pouco para o store hidratar
        const timer = setTimeout(checkAuth, 100)
        return () => clearTimeout(timer)
    }, [isAuthenticated, setTokens, setUser])

    useEffect(() => {
        if (isLoading) return

        if (requireAuth && !isAuthenticated && !hasToken) {
            router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
            return
        }

        if (requireAdmin && (!user || !user.roles?.includes('admin'))) {
            router.push('/')
            return
        }
    }, [isLoading, isAuthenticated, hasToken, user, requireAuth, requireAdmin, router, pathname])

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    if (requireAuth && !isAuthenticated && !hasToken) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    if (requireAdmin && (!user || !user.roles?.includes('admin'))) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    return <>{children}</>
}

