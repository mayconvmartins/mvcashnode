'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ProcessMetrics } from '@/lib/api/monitoring.service'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ProcessesListProps {
    processes: ProcessMetrics[]
}

export function ProcessesList({ processes }: ProcessesListProps) {
    const formatBytes = (bytes: number) => {
        if (!bytes || bytes === 0) return 'Aguardando...'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'running':
                return <Badge variant="default" className="bg-green-500">Running</Badge>
            case 'stopped':
                return <Badge variant="secondary">Stopped</Badge>
            case 'error':
                return <Badge variant="destructive">Error</Badge>
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Processes</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {processes.map((process) => (
                        <div key={process.pid} className="flex items-center justify-between border-b pb-4 last:border-0">
                            <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                    <p className="text-sm font-medium">{process.name}</p>
                                    {getStatusBadge(process.status)}
                                </div>
                                <p className="text-xs text-muted-foreground">PID: {process.pid}</p>
                                <p className="text-xs text-muted-foreground">
                                    Última atualização: {formatDistanceToNow(new Date(process.lastUpdate), { 
                                        addSuffix: true,
                                        locale: ptBR 
                                    })}
                                </p>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-sm font-medium">
                                    CPU: {process.cpu > 0 ? process.cpu.toFixed(2) + '%' : 'Coletando...'}
                                </p>
                                <p className="text-sm text-muted-foreground">{formatBytes(process.memory)}</p>
                                <p className="text-xs text-muted-foreground">
                                    Uptime: {process.uptime > 0 ? Math.floor(process.uptime / 60) + 'm' : 'Iniciando...'}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

