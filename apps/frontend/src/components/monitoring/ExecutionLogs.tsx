'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText, AlertCircle, CheckCircle, Info, Clock } from 'lucide-react'
import { cronService, type CronJobExecution } from '@/lib/api/cron.service'

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
    autoRefresh?: boolean
}

export function ExecutionLogs({ logs, autoRefresh = false }: ExecutionLogsProps) {
    const [cronExecutions, setCronExecutions] = useState<CronJobExecution[]>([])
    const [loadingCron, setLoadingCron] = useState(false)

    const fetchCronExecutions = async () => {
        try {
            setLoadingCron(true)
            const executions = await cronService.getExecutionHistory(undefined, 50)
            setCronExecutions(executions || [])
        } catch (error) {
            console.error('Erro ao buscar execuções de cron jobs:', error)
            setCronExecutions([])
        } finally {
            setLoadingCron(false)
        }
    }

    useEffect(() => {
        fetchCronExecutions()
    }, [])

    useEffect(() => {
        if (autoRefresh) {
            const interval = setInterval(fetchCronExecutions, 10000) // Atualizar a cada 10s
            return () => clearInterval(interval)
        }
    }, [autoRefresh])

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running':
            case 'RUNNING':
                return <CheckCircle className="h-4 w-4 text-green-500" />
            case 'error':
            case 'FAILED':
            case 'TIMEOUT':
                return <AlertCircle className="h-4 w-4 text-red-500" />
            case 'SUCCESS':
                return <CheckCircle className="h-4 w-4 text-green-500" />
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

    const formatDuration = (ms?: number) => {
        if (!ms) return 'N/A'
        if (ms < 1000) return `${ms}ms`
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
        return `${(ms / 60000).toFixed(2)}m`
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
                <Tabs defaultValue="processes" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="processes">Processos</TabsTrigger>
                        <TabsTrigger value="crons">Cron Jobs</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="processes" className="mt-4">
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
                                        <p className="text-sm">Nenhum log de processo disponível</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="crons" className="mt-4">
                        <ScrollArea className="h-[400px]">
                            <div className="space-y-2">
                                {loadingCron ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <p className="text-sm">Carregando execuções...</p>
                                    </div>
                                ) : cronExecutions.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <p className="text-sm">Nenhuma execução de cron job disponível</p>
                                    </div>
                                ) : (
                                    cronExecutions.map((execution) => (
                                        <div key={execution.id} className="border-b pb-2 last:border-0">
                                            <div className="flex items-start space-x-2">
                                                {getStatusIcon(execution.status)}
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center space-x-2">
                                                        <Badge 
                                                            variant={execution.status === 'SUCCESS' ? 'default' : execution.status === 'FAILED' ? 'destructive' : 'outline'} 
                                                            className="text-xs"
                                                        >
                                                            {execution.job_config?.name || 'N/A'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-xs">
                                                            {execution.status}
                                                        </Badge>
                                                        {execution.triggered_by === 'MANUAL' && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                Manual
                                                            </Badge>
                                                        )}
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDistanceToNow(new Date(execution.started_at), {
                                                                addSuffix: true,
                                                                locale: ptBR,
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                                        {execution.duration_ms !== null && execution.duration_ms !== undefined && (
                                                            <span className="flex items-center space-x-1">
                                                                <Clock className="h-3 w-3" />
                                                                <span>Duração: {formatDuration(execution.duration_ms)}</span>
                                                            </span>
                                                        )}
                                                        {execution.job_config?.description && (
                                                            <span className="text-xs">{execution.job_config.description}</span>
                                                        )}
                                                    </div>
                                                    {execution.error_message && (
                                                        <div className="text-xs text-red-500 mt-1">
                                                            Erro: {execution.error_message}
                                                        </div>
                                                    )}
                                                    {execution.result_json && Object.keys(execution.result_json).length > 0 && (
                                                        <details className="text-xs mt-1">
                                                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                                                Resultado
                                                            </summary>
                                                            <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                                                {JSON.stringify(execution.result_json, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}

