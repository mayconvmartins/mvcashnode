'use client'

import { Button } from '@/components/ui/button'
import { WifiOff, RefreshCw, TrendingUp, Home } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function OfflinePage() {
    const router = useRouter()

    const handleRetry = () => {
        window.location.reload()
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                {/* Icon */}
                <div className="relative inline-flex mb-6">
                    <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                        <WifiOff className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-bold mb-3">
                    Você está offline
                </h1>
                <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                    Parece que você perdeu a conexão com a internet. 
                    Verifique sua conexão e tente novamente.
                </p>

                {/* Tips */}
                <div className="bg-muted/50 rounded-xl p-4 mb-6 text-left">
                    <h3 className="font-medium mb-2 text-sm">Enquanto isso, você pode:</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Verificar sua conexão Wi-Fi ou dados móveis</li>
                        <li>• Desativar o modo avião se estiver ativado</li>
                        <li>• Aguardar alguns segundos e tentar novamente</li>
                    </ul>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                        onClick={handleRetry}
                        className="flex-1 gap-2"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Tentar Novamente
                    </Button>
                    <Button 
                        variant="outline"
                        onClick={() => router.push('/')}
                        className="flex-1 gap-2"
                    >
                        <Home className="h-4 w-4" />
                        Ir para Home
                    </Button>
                </div>

                {/* Footer */}
                <p className="text-xs text-muted-foreground mt-8">
                    MVCash Trading - Alguns recursos podem estar disponíveis offline
                </p>
            </div>
        </div>
    )
}
