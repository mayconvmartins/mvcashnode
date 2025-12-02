'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText, AlertCircle, CheckCircle, Info } from 'lucide-react'

interface MonitoringLog {
    id: number
    timestamp: string
    service_name: string
    process_id?: number
    status: string
    cpu_usage?: number
    memory_usage?: number
    metrics_json?: any
}

interface ExecutionLogsProps {
    logs: MonitoringLog[]
}

export function ExecutionLogs({ logs }: ExecutionLogsProps) {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running':
                return <CheckCircle className="h-4 w-4 text-green-500" />
            case 'error':
                return <AlertCircle className="h-4 w-4 text-red-500" />
            default:
                return <Info className="h-4 w-4 text-blue-500" />
        }
    }

    const formatBytes = (bytes?: number) => {
        if (!bytes || bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Logs de Execução</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                        {logs.map((log) => (
                            <div key={log.id} className="border-b pb-2 last:border-0">
                                <div className="flex items-start space-x-2">
                                    {getStatusIcon(log.status)}
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center space-x-2">
                                            <Badge variant="outline" className="text-xs">
                                                {log.service_name}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                PID: {log.process_id || 'N/A'}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(log.timestamp), {
                                                    addSuffix: true,
                                                    locale: ptBR,
                                                })}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                            {log.cpu_usage !== undefined && (
                                                <span>CPU: {Number(log.cpu_usage).toFixed(2)}%</span>
                                            )}
                                            {log.memory_usage !== undefined && (
                                                <span>Mem: {formatBytes(Number(log.memory_usage))}</span>
                                            )}
                                            {log.metrics_json?.uptime !== undefined && (
                                                <span>Uptime: {Math.floor(log.metrics_json.uptime / 60)}m</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {logs.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <p className="text-sm">Nenhum log disponível</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}

