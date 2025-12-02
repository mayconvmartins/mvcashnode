'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function ImpersonationBanner() {
    const { accessToken, logout } = useAuthStore()
    const router = useRouter()
    const [isImpersonating, setIsImpersonating] = useState(false)
    const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null)

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
        }
        logout()
        router.push('/login')
    }

    if (!isImpersonating) return null

    return (
        <Alert className="border-yellow-500 bg-yellow-500/10 mb-4">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-200">
                Modo Impersonation Ativo
            </AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-300 flex items-center justify-between">
                <span>
                    Você está visualizando o sistema como outro usuário. 
                    {impersonatedBy && ` Impersonado por admin ID: ${impersonatedBy}`}
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExit}
                    className="ml-4 border-yellow-500 text-yellow-700 hover:bg-yellow-500/20"
                >
                    <X className="h-4 w-4 mr-1" />
                    Sair do Modo Impersonation
                </Button>
            </AlertDescription>
        </Alert>
    )
}

