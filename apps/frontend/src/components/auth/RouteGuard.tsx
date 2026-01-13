'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'
import { authService } from '@/lib/api/auth.service'
import { apiClient } from '@/lib/api/client'
import { Spinner } from '@/components/ui/spinner'
import { UserRole } from '@/lib/types'
import { subscriptionsService } from '@/lib/api/subscriptions.service'

interface RouteGuardProps {
    children: React.ReactNode
    requireAuth?: boolean
    requireAdmin?: boolean
}

function RouteGuardContent({ children, requireAuth = true, requireAdmin = false }: RouteGuardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { isAuthenticated, user, setTokens, setUser, getRememberMe } = useAuthStore()
    const [isLoading, setIsLoading] = useState(true)
    const [hasToken, setHasToken] = useState(false)
    const [processingImpersonation, setProcessingImpersonation] = useState(false)
    const [subscriptionStatus, setSubscriptionStatus] = useState<'checking' | 'active' | 'inactive' | null>(null)

    useEffect(() => {
        // Verificar se há token de impersonation na URL
        const impersonateToken = searchParams.get('impersonate_token')
        
        if (impersonateToken && typeof window !== 'undefined') {
            setProcessingImpersonation(true)
            
            // Salvar o token temporariamente do admin
            const originalToken = localStorage.getItem('accessToken')
            const originalRefreshToken = localStorage.getItem('refreshToken')
            
            // Limpar tokens anteriores
            localStorage.removeItem('accessToken')
            localStorage.removeItem('refreshToken')
            
            // Aguardar um pouco para garantir que o localStorage foi limpo
            setTimeout(() => {
                // Usar o token de impersonation para fazer requisições
                localStorage.setItem('accessToken', impersonateToken)
                // Não salvar refresh token para impersonation (token expira em 1h)
                
                // Buscar dados do usuário com o token de impersonation
                // Usar apiClient diretamente com o token no header
                apiClient.get('/users/me', {
                    headers: {
                        Authorization: `Bearer ${impersonateToken}`
                    }
                })
                    .then((response) => {
                        const userData = response.data
                        
                        // Marcar que está em modo impersonation
                        localStorage.setItem('isImpersonating', 'true')
                        if (originalToken) {
                            localStorage.setItem('originalAdminToken', originalToken)
                        }
                        
                        // Salvar token e usuário
                        setTokens(impersonateToken, impersonateToken) // Usar o mesmo token como refresh temporário
                        setUser(userData)
                        
                        // Remover o token da URL
                        const newUrl = new URL(window.location.href)
                        newUrl.searchParams.delete('impersonate_token')
                        window.history.replaceState({}, '', newUrl.toString())
                        
                        setProcessingImpersonation(false)
                        setIsLoading(false)
                    })
                    .catch((error) => {
                        console.error('Erro ao processar token de impersonation:', error)
                        // Restaurar token original se houver
                        if (originalToken) {
                            localStorage.setItem('accessToken', originalToken)
                        }
                        if (originalRefreshToken) {
                            localStorage.setItem('refreshToken', originalRefreshToken)
                        }
                        setProcessingImpersonation(false)
                        setIsLoading(false)
                        router.push('/login?error=invalid_impersonation_token')
                    })
            }, 100)
            
            return
        }

        // Verificar se há token nos cookies ou localStorage
        const checkAuth = () => {
            if (typeof window === 'undefined') return

            // Verificar cookie
            const cookies = document.cookie.split('; ')
            const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='))
            
            // Verificar localStorage
            const accessTokenLS = localStorage.getItem('accessToken')
            const refreshTokenLS = localStorage.getItem('refreshToken')
            
            // Verificar se o token atual é de impersonation (sem flag isImpersonating no localStorage)
            // Se não há flag mas o token tem isImpersonation=true, limpar tudo
            if (accessTokenLS) {
                try {
                    const parts = accessTokenLS.split('.')
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]))
                        const isImpersonationToken = payload.isImpersonation === true
                        const hasImpersonationFlag = localStorage.getItem('isImpersonating') === 'true'
                        
                        // Se é token de impersonation mas não há flag (sessão anterior), limpar
                        if (isImpersonationToken && !hasImpersonationFlag) {
                            console.warn('[AUTH] Token de impersonation detectado sem flag, limpando sessão...')
                            localStorage.removeItem('accessToken')
                            localStorage.removeItem('refreshToken')
                            localStorage.removeItem('isImpersonating')
                            localStorage.removeItem('originalAdminToken')
                            document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
                            document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
                            setIsLoading(false)
                            router.push('/login?error=impersonation_session_expired')
                            return
                        }
                    }
                } catch (e) {
                    // Se não conseguir decodificar, continuar normalmente
                    console.warn('[AUTH] Erro ao verificar token:', e)
                }
            }
            
            const hasAuthToken = !!(accessTokenCookie || accessTokenLS)
            setHasToken(hasAuthToken)

            // Se tem token mas o store não está autenticado, restaurar do localStorage
            if (hasAuthToken && !isAuthenticated && accessTokenLS && refreshTokenLS) {
                const rememberMeActive = getRememberMe()
                
                // Verificar se o token está próximo de expirar ou expirado
                let shouldRefresh = false
                if (accessTokenLS) {
                    try {
                        const parts = accessTokenLS.split('.')
                        if (parts.length === 3) {
                            const payload = JSON.parse(atob(parts[1]))
                            const exp = payload.exp * 1000 // Converter para milissegundos
                            const now = Date.now()
                            const timeUntilExpiry = exp - now
                            
                            // Se rememberMe está ativo e o token está próximo de expirar (menos de 10 minutos) ou já expirou
                            if (rememberMeActive && timeUntilExpiry < 10 * 60 * 1000) {
                                shouldRefresh = true
                            }
                        }
                    } catch (e) {
                        console.warn('[AUTH] Erro ao verificar expiração do token:', e)
                    }
                }
                
                // Se rememberMe está ativo e precisa fazer refresh, tentar renovar tokens
                if (shouldRefresh && rememberMeActive && refreshTokenLS) {
                    console.log('[AUTH] Token próximo de expirar, tentando refresh automático...')
                    authService.refresh(refreshTokenLS)
                        .then((response) => {
                            if (response.accessToken && response.refreshToken) {
                                // Atualizar tokens mantendo rememberMe
                                setTokens(response.accessToken, response.refreshToken, rememberMeActive)
                                
                                // Buscar dados do usuário
                                return authService.getMe()
                            }
                            throw new Error('Resposta de refresh inválida')
                        })
                        .then((userData) => {
                            if (userData) {
                                setUser(userData)
                            }
                        })
                        .catch((error) => {
                            console.warn('[AUTH] Erro ao fazer refresh automático, tentando restaurar sessão:', error)
                            // Se o refresh falhar, tentar restaurar com tokens existentes
                            setTokens(accessTokenLS, refreshTokenLS, rememberMeActive)
                            
                            // Buscar dados do usuário da API
                            authService.getMe()
                                .then((userData) => {
                                    setUser(userData)
                                })
                                .catch(() => {
                                    // Se falhar, tentar carregar do localStorage
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
                                })
                        })
                } else {
                    // Restaurar normalmente sem refresh
                    setTokens(accessTokenLS, refreshTokenLS, rememberMeActive)
                    
                    // Buscar dados do usuário da API
                    authService.getMe()
                        .then((userData) => {
                            setUser(userData)
                        })
                        .catch(() => {
                            // Se falhar, tentar carregar do localStorage
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
                        })
                }
            }

            setIsLoading(false)
        }

        // Aguardar um pouco para o store hidratar
        const timer = setTimeout(checkAuth, 100)
        return () => clearTimeout(timer)
    }, [isAuthenticated, setTokens, setUser, getRememberMe, router, searchParams])

    // Verificar assinatura ativa para assinantes
    useEffect(() => {
        if (isLoading || processingImpersonation || !isAuthenticated || !user) return

        const isSubscriber = user.roles?.some((role: any) => {
            const roleValue = typeof role === 'object' && role !== null ? role.role : role
            return roleValue === UserRole.SUBSCRIBER || roleValue === 'subscriber'
        })

        // Se não é assinante, não precisa verificar
        if (!isSubscriber) {
            setSubscriptionStatus('active') // Considerar ativo para não-assinantes
            return
        }

        // Se é admin, não precisa verificar assinatura
        const isAdmin = user.roles?.some((role: any) => {
            const roleValue = typeof role === 'object' && role !== null ? role.role : role
            return roleValue === UserRole.ADMIN || roleValue === 'admin'
        })
        if (isAdmin) {
            setSubscriptionStatus('active')
            return
        }

        // Verificar assinatura ativa
        // Permitir acesso a /my-plan mesmo se assinatura estiver inativa
        const isMyPlanPage = pathname === '/my-plan'
        const isSubscribePage = pathname.startsWith('/subscribe')
        
        if (isMyPlanPage || isSubscribePage) {
            // Permitir acesso sem verificar assinatura
            setSubscriptionStatus('active')
            return
        }
        
        setSubscriptionStatus('checking')
        subscriptionsService.getMySubscription()
            .then((subscription) => {
                // Se não há assinatura, permitir acesso apenas a /my-plan
                if (!subscription) {
                    setSubscriptionStatus('inactive')
                    if (!isMyPlanPage && !isSubscribePage) {
                        router.push('/my-plan?no_subscription=true')
                    }
                    return
                }
                
                const isActive = subscription.status === 'ACTIVE' && 
                    (!subscription.end_date || new Date(subscription.end_date) > new Date())
                setSubscriptionStatus(isActive ? 'active' : 'inactive')
                
                if (!isActive && !isMyPlanPage && !isSubscribePage) {
                    router.push('/my-plan?expired=true')
                }
            })
            .catch(() => {
                setSubscriptionStatus('inactive')
                // Se não conseguir verificar e não estiver em /my-plan, redirecionar
                if (!isMyPlanPage && !isSubscribePage) {
                    router.push('/my-plan?expired=true')
                }
            })
    }, [isLoading, processingImpersonation, isAuthenticated, user, pathname, router])

    useEffect(() => {
        if (isLoading || processingImpersonation) return

        if (requireAuth && !isAuthenticated && !hasToken) {
            router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
            return
        }

        if (requireAdmin && (!user || !user.roles?.includes(UserRole.ADMIN))) {
            router.push('/')
            return
        }
    }, [isLoading, processingImpersonation, isAuthenticated, hasToken, user, requireAuth, requireAdmin, router, pathname])

    // Permitir acesso a /my-plan mesmo se assinatura estiver inativa
    const isMyPlanPage = pathname === '/my-plan'
    
    if (isLoading || processingImpersonation || (subscriptionStatus === 'checking' && !isMyPlanPage)) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <Spinner size="lg" />
                    {processingImpersonation && (
                        <p className="mt-4 text-sm text-muted-foreground">
                            Fazendo login como outro usuário...
                        </p>
                    )}
                    {subscriptionStatus === 'checking' && !isMyPlanPage && (
                        <p className="mt-4 text-sm text-muted-foreground">
                            Verificando assinatura...
                        </p>
                    )}
                </div>
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

    if (requireAdmin && (!user || !user.roles?.includes(UserRole.ADMIN))) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    // Bloquear assinantes de acessar rotas não permitidas
    const isSubscriber = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === UserRole.SUBSCRIBER || roleValue === 'subscriber'
    })
    
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === UserRole.ADMIN || roleValue === 'admin'
    })
    
    // SUBSCRIBER (não-admin): allowlist estrita (fecha bypass por URL direta)
    const allowedRoutesForSubscribers = [
        '/subscriber-dashboard',
        '/accounts',
        '/heatmap',
        '/reports',
        '/settings/position-value',
        '/my-plan',
    ]

    if (isSubscriber && !isAdmin) {
        const isAllowed = allowedRoutesForSubscribers.some((route) => pathname === route || pathname.startsWith(route + '/'))
        if (!isAllowed) {
            router.push('/my-plan?error=access_denied')
            return (
                <div className="flex min-h-screen items-center justify-center">
                    <Spinner size="lg" />
                </div>
            )
        }
    }

    return <>{children}</>
}

export function RouteGuard({ children, requireAuth = true, requireAdmin = false }: RouteGuardProps) {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        }>
            <RouteGuardContent requireAuth={requireAuth} requireAdmin={requireAdmin}>
                {children}
            </RouteGuardContent>
        </Suspense>
    )
}

