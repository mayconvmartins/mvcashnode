'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Bell, BellRing, X } from 'lucide-react'
import { useWebPush } from '@/components/providers/WebPushProvider'

const STORAGE_KEY = 'mvcash_skip_notification_prompt'

interface NotificationPermissionPromptProps {
    onComplete?: () => void
}

export function NotificationPermissionPrompt({ onComplete }: NotificationPermissionPromptProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isActivating, setIsActivating] = useState(false)
    const { isSupported, permission, subscribe, isLoading } = useWebPush()

    // Verificar se deve mostrar o prompt
    useEffect(() => {
        // Aguardar um pouco após o login para não sobrecarregar
        const timer = setTimeout(() => {
            checkShouldShow()
        }, 2000)

        return () => clearTimeout(timer)
    }, [permission, isSupported, isLoading])

    const checkShouldShow = () => {
        // Não mostrar se não suporta Web Push
        if (!isSupported) {
            onComplete?.()
            return
        }

        // Não mostrar se está carregando
        if (isLoading) {
            return
        }

        // Não mostrar se já tem permissão (granted ou denied)
        if (permission !== 'default') {
            onComplete?.()
            return
        }

        // Não mostrar se usuário marcou "não perguntar novamente"
        if (typeof window !== 'undefined') {
            const skipPrompt = localStorage.getItem(STORAGE_KEY)
            if (skipPrompt === 'true') {
                onComplete?.()
                return
            }
        }

        // Mostrar prompt
        setIsOpen(true)
    }

    const handleActivate = async () => {
        setIsActivating(true)
        try {
            const success = await subscribe()
            if (success) {
                setIsOpen(false)
                onComplete?.()
            }
        } finally {
            setIsActivating(false)
        }
    }

    const handleLater = () => {
        setIsOpen(false)
        onComplete?.()
    }

    const handleNeverAsk = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true')
        }
        setIsOpen(false)
        onComplete?.()
    }

    if (!isOpen) {
        return null
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                handleLater()
            }
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <BellRing className="h-8 w-8 text-primary" />
                    </div>
                    <DialogTitle className="text-center text-xl">
                        Ativar Notificações?
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        Receba alertas instantâneos sobre suas posições, trades e webhooks mesmo quando o app estiver fechado.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Alertas em tempo real</p>
                            <p className="text-xs text-muted-foreground">
                                Posições abertas, fechadas, SL/TP atingidos
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Funciona offline</p>
                            <p className="text-xs text-muted-foreground">
                                Receba notificações mesmo sem o app aberto
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                        onClick={handleActivate}
                        disabled={isActivating}
                        className="w-full"
                    >
                        {isActivating ? (
                            <>
                                <span className="animate-spin mr-2">⏳</span>
                                Ativando...
                            </>
                        ) : (
                            <>
                                <BellRing className="h-4 w-4 mr-2" />
                                Ativar Notificações
                            </>
                        )}
                    </Button>
                    <div className="flex gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={handleLater}
                            className="flex-1"
                        >
                            Mais Tarde
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleNeverAsk}
                            className="flex-1 text-muted-foreground"
                        >
                            <X className="h-4 w-4 mr-1" />
                            Não perguntar
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// Função para resetar a preferência (útil para testes)
export function resetNotificationPromptPreference() {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
    }
}

