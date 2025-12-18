'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UpdatePrompt() {
    const [showPrompt, setShowPrompt] = useState(false)
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
                setRegistration(reg)
                
                // Check for updates
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New content is available
                                setShowPrompt(true)
                            }
                        })
                    }
                })
            })

            // Listen for controller change
            let refreshing = false
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true
                    window.location.reload()
                }
            })
        }
    }, [])

    const handleUpdate = () => {
        if (registration?.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        setShowPrompt(false)
    }

    if (!showPrompt) return null

    return (
        <div className={cn(
            'fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50',
            'bg-card border rounded-xl shadow-lg p-4',
            'animate-slide-in-bottom'
        )}>
            <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">Atualização Disponível</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Uma nova versão do app está disponível
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" onClick={handleUpdate} className="h-8">
                            Atualizar Agora
                        </Button>
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setShowPrompt(false)}
                            className="h-8"
                        >
                            Depois
                        </Button>
                    </div>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 -mt-1 -mr-1"
                    onClick={() => setShowPrompt(false)}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

