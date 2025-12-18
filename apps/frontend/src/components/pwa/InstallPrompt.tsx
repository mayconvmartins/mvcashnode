'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
    const [showPrompt, setShowPrompt] = useState(false)
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [isIOS, setIsIOS] = useState(false)
    const [isStandalone, setIsStandalone] = useState(false)

    useEffect(() => {
        // Check if already installed
        const standalone = window.matchMedia('(display-mode: standalone)').matches
        setIsStandalone(standalone)
        
        // Check if iOS
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
        setIsIOS(ios)

        // Check if user dismissed prompt before
        const dismissed = localStorage.getItem('pwa-install-dismissed')
        const dismissedTime = dismissed ? parseInt(dismissed) : 0
        const oneWeek = 7 * 24 * 60 * 60 * 1000
        
        if (dismissed && Date.now() - dismissedTime < oneWeek) {
            return
        }

        // Listen for install prompt
        const handler = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            
            // Show prompt after a delay
            setTimeout(() => {
                setShowPrompt(true)
            }, 3000)
        }

        window.addEventListener('beforeinstallprompt', handler)

        // For iOS, show prompt after delay if not standalone
        if (ios && !standalone) {
            setTimeout(() => {
                setShowPrompt(true)
            }, 5000)
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handler)
        }
    }, [])

    const handleInstall = async () => {
        if (deferredPrompt) {
            await deferredPrompt.prompt()
            const { outcome } = await deferredPrompt.userChoice
            
            if (outcome === 'accepted') {
                setShowPrompt(false)
            }
            
            setDeferredPrompt(null)
        }
    }

    const handleDismiss = () => {
        localStorage.setItem('pwa-install-dismissed', Date.now().toString())
        setShowPrompt(false)
    }

    // Don't show if already installed
    if (isStandalone || !showPrompt) return null

    // iOS-specific prompt
    if (isIOS) {
        return (
            <div className={cn(
                'fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50',
                'bg-card border rounded-xl shadow-lg p-4',
                'animate-slide-in-bottom'
            )}>
                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Smartphone className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">Instalar App</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Toque em <span className="inline-flex items-center">
                                <svg className="h-4 w-4 mx-1" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 16L16 12H13V4H11V12H8L12 16Z"/>
                                    <path d="M20 18H4V11H2V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V11H20V18Z"/>
                                </svg>
                            </span> e depois &quot;Adicionar à Tela de Início&quot;
                        </p>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 -mt-1 -mr-1"
                        onClick={handleDismiss}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )
    }

    // Android/Desktop prompt
    if (!deferredPrompt) return null

    return (
        <div className={cn(
            'fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50',
            'bg-card border rounded-xl shadow-lg p-4',
            'animate-slide-in-bottom'
        )}>
            <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Download className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">Instalar MVCash</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Instale o app para acesso rápido e notificações
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" onClick={handleInstall} className="h-8 gap-1">
                            <Download className="h-3 w-3" />
                            Instalar
                        </Button>
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={handleDismiss}
                            className="h-8"
                        >
                            Agora não
                        </Button>
                    </div>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 -mt-1 -mr-1"
                    onClick={handleDismiss}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

