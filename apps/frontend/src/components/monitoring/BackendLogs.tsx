'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileCode, Search, RefreshCw, AlertCircle, Info, AlertTriangle, Bug } from 'lucide-react'
import { monitoringService } from '@/lib/api/monitoring.service'

export interface BackendLog {
    timestamp: string
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    service?: string
    metadata?: any
    stack?: string
}

interface BackendLogsProps {
    autoRefresh?: boolean
}

export function BackendLogs({ autoRefresh = false }: BackendLogsProps) {
    const [logs, setLogs] = useState<BackendLog[]>([])
    const [loading, setLoading] = useState(true)
    const [level, setLevel] = useState<string>('all')
    const [search, setSearch] = useState('')
    const [limit, setLimit] = useState(500)

    const fetchLogs = async () => {
        try {
            setLoading(true)
            const data = await monitoringService.getBackendLogs({
                level: level !== 'all' ? level : undefined,
                search: search || undefined,
                limit,
            })
            // Garantir que sempre seja um array
            setLogs(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error('Erro ao buscar logs:', error)
            setLogs([]) // Em caso de erro, definir como array vazio
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchLogs()
    }, [level, search, limit])

    useEffect(() => {
        if (autoRefresh) {
            const interval = setInterval(fetchLogs, 10000) // Atualizar a cada 10 segundos
            return () => clearInterval(interval)
        }
    }, [autoRefresh, level, search, limit])

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'error':
                return <AlertCircle className="h-4 w-4 text-red-500" />
            case 'warn':
                return <AlertTriangle className="h-4 w-4 text-yellow-500" />
            case 'debug':
                return <Bug className="h-4 w-4 text-blue-500" />
            default:
                return <Info className="h-4 w-4 text-blue-500" />
        }
    }

    const getLevelBadgeVariant = (level: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
        switch (level) {
            case 'error':
                return 'destructive'
            case 'warn':
                return 'secondary'
            default:
                return 'outline'
        }
    }

    const filteredLogs = logs.filter(log => {
        if (level !== 'all' && log.level !== level) return false
        if (search && !log.message.toLowerCase().includes(search.toLowerCase())) {
            if (!JSON.stringify(log.metadata || {}).toLowerCase().includes(search.toLowerCase())) {
                return false
            }
        }
        return true
    })

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center space-x-2">
                            <FileCode className="h-5 w-5" />
                            <span>Logs do Backend</span>
                        </CardTitle>
                        <CardDescription>
                            Logs de execução do backend (application-*.log e error-*.log)
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {/* Filtros */}
                <div className="flex items-center space-x-2 mb-4">
                    <Select value={level} onValueChange={setLevel}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Nível" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="warn">Warn</SelectItem>
                            <SelectItem value="error">Error</SelectItem>
                            <SelectItem value="debug">Debug</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar em mensagens..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="100">100</SelectItem>
                            <SelectItem value="500">500</SelectItem>
                            <SelectItem value="1000">1000</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Logs */}
                <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                        {loading && logs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <p className="text-sm">Carregando logs...</p>
                            </div>
                        ) : filteredLogs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <p className="text-sm">Nenhum log encontrado</p>
                            </div>
                        ) : (
                            filteredLogs.map((log, index) => (
                                <div
                                    key={index}
                                    className="border rounded-md p-3 bg-card hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-start space-x-2">
                                        {getLevelIcon(log.level)}
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <div className="flex items-center space-x-2 flex-wrap">
                                                <Badge variant={getLevelBadgeVariant(log.level)} className="text-xs">
                                                    {log.level.toUpperCase()}
                                                </Badge>
                                                {log.service && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {log.service}
                                                    </Badge>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({formatDistanceToNow(new Date(log.timestamp), {
                                                        addSuffix: true,
                                                        locale: ptBR,
                                                    })})
                                                </span>
                                            </div>
                                            <div className="text-sm font-mono break-words">
                                                {log.message}
                                            </div>
                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                <details className="text-xs">
                                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                                        Metadata
                                                    </summary>
                                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                                        {JSON.stringify(log.metadata, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                            {log.stack && (
                                                <details className="text-xs">
                                                    <summary className="cursor-pointer text-destructive hover:text-destructive/80">
                                                        Stack Trace
                                                    </summary>
                                                    <pre className="mt-1 p-2 bg-destructive/10 rounded text-xs overflow-x-auto font-mono">
                                                        {log.stack}
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
            </CardContent>
        </Card>
    )
}

