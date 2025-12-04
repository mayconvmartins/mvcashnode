'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'
import { apiClient } from '@/lib/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

export function ImpersonationBanner() {
    const { accessToken, logout, setTokens, setUser } = useAuthStore()
    const router = useRouter()
    const queryClient = useQueryClient()
    const [isImpersonating, setIsImpersonating] = useState(false)
    const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null)
    const [isRestoring, setIsRestoring] = useState(false)

    useEffect(() => {
        if (!accessToken) {
            setIsImpersonating(false)
            return
        }

        try {
            // Decodificar JWT (sem verificar assinatura, apenas para ler payload)
            const parts = accessToken.split('.')
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]))
                if (payload.isImpersonation) {
                    setIsImpersonating(true)
                    // Tentar buscar email do admin que está impersonando
                    if (payload.impersonatedBy) {
                        // Poderia buscar do backend, mas por enquanto só mostramos o aviso
                        setImpersonatedBy(payload.impersonatedBy.toString())
                    }
                } else {
                    setIsImpersonating(false)
                }
            }
        } catch (error) {
            // Se não conseguir decodificar, não está em impersonation
            setIsImpersonating(false)
        }
    }, [accessToken])

    const handleExit = () => {
        // Limpar flag de impersonation antes de fazer logout
        if (typeof window !== 'undefined') {
            localStorage.removeItem('isImpersonating')
            localStorage.removeItem('originalAdminToken')
            localStorage.removeItem('originalAdminRefreshToken')
        }
        logout()
        router.push('/login')
    }

    const handleRestoreAdmin = async () => {
        if (typeof window === 'undefined') return

        const originalToken = localStorage.getItem('originalAdminToken')
        const originalRefreshToken = localStorage.getItem('originalAdminRefreshToken')

        if (!originalToken) {
            toast.error('Token original do admin não encontrado')
            handleExit()
            return
        }

        setIsRestoring(true)

        try {
            // Remover a query do cache ANTES de setar os novos tokens
            queryClient.removeQueries({ queryKey: ['auth', 'me'] })
            
            // Buscar dados do admin com o token original
            const response = await apiClient.get('/users/me', {
                headers: {
                    Authorization: `Bearer ${originalToken}`
                }
            })
            
            const adminData = response.data
            
            // Restaurar token e usuário do admin
            setTokens(originalToken, originalRefreshToken || originalToken)
            setUser(adminData)
            
            // Limpar flags de impersonation
            localStorage.removeItem('isImpersonating')
            localStorage.removeItem('originalAdminToken')
            localStorage.removeItem('originalAdminRefreshToken')
            
            // Invalidar todas as queries para forçar atualização
            queryClient.clear()
            // Invalidar especificamente a query do useAuth para forçar re-execução
            queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
            // NÃO setar queryData - deixar a query ser re-executada naturalmente com o novo token
            
            toast.success('Voltou ao modo admin')
            
            // Aguardar um pouco mais para garantir que o estado foi atualizado e o apiClient usa o novo token
            setTimeout(() => {
                router.push('/admin')
                // Forçar reload da página para garantir que tudo seja atualizado
                window.location.href = '/admin'
            }, 500)
        } catch (error: any) {
            console.error('Erro ao restaurar token do admin:', error)
            toast.error('Erro ao restaurar modo admin. Fazendo logout...')
            handleExit()
        } finally {
            setIsRestoring(false)
        }
    }

    if (!isImpersonating) return null

    return (
        <Alert className="border-yellow-500 bg-yellow-500/10 mb-4">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-200">
                Modo Impersonation Ativo
            </AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <span>
                        Você está visualizando o sistema como outro usuário. 
                        {impersonatedBy && ` Impersonado por admin ID: ${impersonatedBy}`}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRestoreAdmin}
                            disabled={isRestoring}
                            className="border-blue-500 text-blue-700 hover:bg-blue-500/20"
                        >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            {isRestoring ? 'Restaurando...' : 'Voltar ao Admin'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExit}
                            className="border-yellow-500 text-yellow-700 hover:bg-yellow-500/20"
                        >
                            <X className="h-4 w-4 mr-1" />
                            Sair
                        </Button>
                    </div>
                </div>
            </AlertDescription>
        </Alert>
    )
}

