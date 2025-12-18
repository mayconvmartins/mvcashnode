'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'
import { NotificationPermissionPrompt } from '@/components/notifications/NotificationPermissionPrompt'
import { PasskeyEnrollmentPrompt } from '@/components/auth/PasskeyEnrollmentPrompt'

type PromptStage = 'checking' | 'notifications' | 'passkey' | 'done'

/**
 * Componente que gerencia a sequência de prompts pós-login:
 * 1. Primeiro: Permissão para notificações (se não tem)
 * 2. Segundo: Cadastro de Passkey (se não tem nenhuma)
 * 
 * Mostra um prompt de cada vez para não sobrecarregar o usuário.
 */
export function PostLoginPrompts() {
    const { isAuthenticated, user } = useAuthStore()
    const [stage, setStage] = useState<PromptStage>('checking')
    const [hasCheckedOnce, setHasCheckedOnce] = useState(false)

    // Verificar se deve mostrar prompts apenas uma vez por sessão de login
    useEffect(() => {
        if (!isAuthenticated || !user) {
            setStage('checking')
            setHasCheckedOnce(false)
            return
        }

        // Só verificar uma vez por sessão
        if (hasCheckedOnce) {
            return
        }

        // Verificar se é um login recente (última atividade nos últimos 5 segundos)
        // Isso evita mostrar prompts quando usuário navega entre páginas
        const checkRecentLogin = () => {
            if (typeof window === 'undefined') return false
            
            const lastLoginTime = sessionStorage.getItem('mvcash_last_login_time')
            if (!lastLoginTime) return false
            
            const timeSinceLogin = Date.now() - parseInt(lastLoginTime, 10)
            return timeSinceLogin < 10000 // 10 segundos após login
        }

        if (checkRecentLogin()) {
            setHasCheckedOnce(true)
            setStage('notifications')
        } else {
            // Não é login recente, não mostrar prompts
            setStage('done')
        }
    }, [isAuthenticated, user, hasCheckedOnce])

    // Handler quando prompt de notificações é completado
    const handleNotificationsComplete = () => {
        setStage('passkey')
    }

    // Handler quando prompt de passkey é completado
    const handlePasskeyComplete = () => {
        setStage('done')
    }

    // Não renderizar nada se não estiver autenticado ou já completou
    if (!isAuthenticated || stage === 'checking' || stage === 'done') {
        return null
    }

    return (
        <>
            {/* Prompt de Notificações (primeiro) */}
            {stage === 'notifications' && (
                <NotificationPermissionPrompt onComplete={handleNotificationsComplete} />
            )}

            {/* Prompt de Passkey (segundo) */}
            {stage === 'passkey' && (
                <PasskeyEnrollmentPrompt onComplete={handlePasskeyComplete} />
            )}
        </>
    )
}

/**
 * Marca o momento do login para que os prompts sejam exibidos.
 * Deve ser chamada no handleLoginSuccess da página de login.
 */
export function markLoginTime() {
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('mvcash_last_login_time', Date.now().toString())
    }
}

/**
 * Limpa a marcação de login (útil para logout).
 */
export function clearLoginTime() {
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('mvcash_last_login_time')
    }
}

