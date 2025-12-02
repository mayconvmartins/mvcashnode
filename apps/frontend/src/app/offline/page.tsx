import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function OfflinePage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="w-full max-w-md glass">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 rounded-full bg-muted">
                            <WifiOff className="h-12 w-12 text-muted-foreground" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl">Você está Offline</CardTitle>
                    <CardDescription>
                        Não foi possível conectar ao servidor. Verifique sua conexão com a internet.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground text-center space-y-2">
                        <p>
                            Algumas funcionalidades podem estar limitadas enquanto você estiver offline.
                        </p>
                        <p>
                            Dados em cache ainda podem estar disponíveis.
                        </p>
                    </div>
                    <Button
                        className="w-full"
                        onClick={() => window.location.reload()}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Tentar Novamente
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}

