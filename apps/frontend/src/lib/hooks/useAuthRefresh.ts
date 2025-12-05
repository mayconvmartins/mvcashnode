import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'
import { authService } from '@/lib/api/auth.service'

/**
 * Hook para fazer refresh automático periódico dos tokens quando "Lembrar de mim" estiver ativo.
 * Faz refresh a cada 50 minutos (antes do token expirar em 1 hora).
 */
export function useAuthRefresh() {
    const { isAuthenticated, getRememberMe, setTokens, setUser } = useAuthStore()
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        // Só fazer refresh se estiver autenticado e rememberMe estiver ativo
        if (!isAuthenticated) {
            return
        }

        const rememberMe = getRememberMe()
        if (!rememberMe) {
            return
        }

        // Função para fazer refresh dos tokens
        const refreshTokens = async () => {
            try {
                const refreshToken = localStorage.getItem('refreshToken')
                if (!refreshToken) {
                    console.warn('[AUTH-REFRESH] Nenhum refresh token encontrado')
                    return
                }

                // Verificar se o access token está próximo de expirar antes de fazer refresh
                const accessToken = localStorage.getItem('accessToken')
                if (accessToken) {
                    try {
                        const parts = accessToken.split('.')
                        if (parts.length === 3) {
                            const payload = JSON.parse(atob(parts[1]))
                            const exp = payload.exp * 1000 // Converter para milissegundos
                            const now = Date.now()
                            const timeUntilExpiry = exp - now

                            // Se ainda tem mais de 10 minutos, não precisa fazer refresh ainda
                            if (timeUntilExpiry > 10 * 60 * 1000) {
                                console.log('[AUTH-REFRESH] Token ainda válido, aguardando...')
                                return
                            }
                        }
                    } catch (e) {
                        console.warn('[AUTH-REFRESH] Erro ao verificar expiração do token:', e)
                        // Continuar com o refresh mesmo se não conseguir verificar
                    }
                }

                console.log('[AUTH-REFRESH] Fazendo refresh automático dos tokens...')
                const response = await authService.refresh(refreshToken)

                if (response.accessToken && response.refreshToken) {
                    // Atualizar tokens mantendo rememberMe ativo
                    setTokens(response.accessToken, response.refreshToken, true)

                    // Atualizar dados do usuário
                    try {
                        const userData = await authService.getMe()
                        if (userData) {
                            setUser(userData)
                        }
                    } catch (error) {
                        console.warn('[AUTH-REFRESH] Erro ao buscar dados do usuário:', error)
                    }

                    console.log('[AUTH-REFRESH] Tokens renovados com sucesso')
                }
            } catch (error) {
                console.error('[AUTH-REFRESH] Erro ao fazer refresh automático:', error)
                // Não fazer nada aqui - o interceptor do API client vai lidar com o erro
            }
        }

        // Fazer refresh imediatamente se o token estiver próximo de expirar
        refreshTokens()

        // Configurar intervalo para refresh a cada 50 minutos (3000000 ms)
        // Isso garante que o token seja renovado antes de expirar (1 hora = 3600s)
        intervalRef.current = setInterval(() => {
            refreshTokens()
        }, 50 * 60 * 1000) // 50 minutos

        // Limpar intervalo quando componente desmonta ou rememberMe é desativado
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
    }, [isAuthenticated, getRememberMe, setTokens, setUser])

    // Limpar intervalo se rememberMe for desativado
    useEffect(() => {
        const rememberMe = getRememberMe()
        if (!rememberMe && intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
    }, [getRememberMe])
}
