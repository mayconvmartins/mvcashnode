'use client'

import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'

export default function HealthCheckPage() {
    const { data: health, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['admin', 'health'],
        queryFn: () => adminService.getHealth(),
        refetchInterval: 30000, // Auto-refresh a cada 30s
    })

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'healthy':
                return <CheckCircle className="h-5 w-5 text-green-500" />
            case 'degraded':
                return <AlertCircle className="h-5 w-5 text-yellow-500" />
            case 'unhealthy':
                return <XCircle className="h-5 w-5 text-destructive" />
            default:
                return <AlertCircle className="h-5 w-5 text-muted-foreground" />
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'healthy':
                return <Badge variant="default" className="bg-green-500">Saudável</Badge>
            case 'degraded':
                return <Badge variant="default" className="bg-yellow-500">Degradado</Badge>
            case 'unhealthy':
                return <Badge variant="destructive">Não Saudável</Badge>
            default:
                return <Badge variant="secondary">Desconhecido</Badge>
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    // Backend retorna: { status: "ok", database: "connected", timestamp: "..." }
    const status = health?.status || 'unknown'
    const isHealthy = status === 'ok'
    const databaseStatus = health?.database || 'unknown'
    const timestamp = health?.timestamp

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">System Health</h1>
                    <p className="text-muted-foreground">
                        Monitoramento de serviços e métricas do sistema
                    </p>
                </div>
                <Button
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    variant="outline"
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>

            {/* Overall Status */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Status Geral</CardTitle>
                            <CardDescription>
                                Última verificação: {timestamp ? formatDate(timestamp) : 'N/A'}
                            </CardDescription>
                        </div>
                        {isHealthy ? (
                            <Badge variant="default" className="bg-green-500">Operacional</Badge>
                        ) : (
                            <Badge variant="destructive">Erro</Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Status da API</p>
                            <div className="flex items-center gap-2">
                                {isHealthy ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-destructive" />
                                )}
                                <p className="text-2xl font-bold">{status.toUpperCase()}</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Banco de Dados</p>
                            <div className="flex items-center gap-2">
                                {databaseStatus === 'connected' ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-destructive" />
                                )}
                                <p className="text-2xl font-bold capitalize">{databaseStatus}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Services */}
            <Card>
                <CardHeader>
                    <CardTitle>Serviços</CardTitle>
                    <CardDescription>Status dos serviços do sistema</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* API Service */}
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                                {isHealthy ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-destructive" />
                                )}
                                <div>
                                    <h4 className="font-medium">API Backend</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Serviço principal da aplicação
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                {isHealthy ? (
                                    <Badge variant="default" className="bg-green-500">Operacional</Badge>
                                ) : (
                                    <Badge variant="destructive">Erro</Badge>
                                )}
                            </div>
                        </div>

                        {/* Database Service */}
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-3">
                                {databaseStatus === 'connected' ? (
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                ) : (
                                    <XCircle className="h-5 w-5 text-destructive" />
                                )}
                                <div>
                                    <h4 className="font-medium">Banco de Dados</h4>
                                    <p className="text-sm text-muted-foreground">
                                        PostgreSQL
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                {databaseStatus === 'connected' ? (
                                    <Badge variant="default" className="bg-green-500">Conectado</Badge>
                                ) : (
                                    <Badge variant="destructive">Desconectado</Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Informações Adicionais</CardTitle>
                    <CardDescription>
                        Para visualizar métricas detalhadas de CPU, memória e conexões, 
                        implemente o endpoint de monitoramento completo no backend.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-muted-foreground">
                        <p>O health check básico está funcionando. Para adicionar mais métricas:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Métricas de CPU e memória</li>
                            <li>Estatísticas de conexões ativas</li>
                            <li>Uptime do sistema</li>
                            <li>Monitoramento de filas</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

