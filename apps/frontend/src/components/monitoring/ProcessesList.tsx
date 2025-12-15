'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ProcessMetrics } from '@/lib/api/monitoring.service'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface ProcessesListProps {
    processes: ProcessMetrics[]
}

export function ProcessesList({ processes }: ProcessesListProps) {
    const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set())

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes === 0) return 'Aguardando...'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
    }

    const formatUptime = (seconds: number) => {
        if (seconds < 60) return `${Math.floor(seconds)}s`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        return `${hours}h ${minutes}m`
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

    const toggleExpand = (processName: string) => {
        const newExpanded = new Set(expandedProcesses)
        if (newExpanded.has(processName)) {
            newExpanded.delete(processName)
        } else {
            newExpanded.add(processName)
        }
        setExpandedProcesses(newExpanded)
    }

    const getProcessDisplayName = (name: string) => {
        const nameMap: Record<string, string> = {
            'mvcashnode-api': 'API',
            'mvcashnode-executor': 'Executor',
            'mvcashnode-monitors': 'Monitors',
            'mvcashnode-frontend': 'Frontend',
            'mvcashnode-site': 'Site',
            'mvcashnode-backup': 'Backup',
        }
        return nameMap[name] || name
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Processos PM2</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {processes.map((process) => {
                        const isExpanded = expandedProcesses.has(process.name)
                        const isCluster = process.exec_mode === 'cluster' && (process.instances || 0) > 1
                        const displayName = getProcessDisplayName(process.name)

                        return (
                            <div key={`${process.name}-${process.pid}`} className="border-b pb-4 last:border-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center space-x-2">
                                            {isCluster && (
                                                <button
                                                    onClick={() => toggleExpand(process.name)}
                                                    className="p-0.5 hover:bg-muted rounded"
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                </button>
                                            )}
                                            <p className="text-sm font-medium">{displayName}</p>
                                            {getStatusBadge(process.status)}
                                            {isCluster && (
                                                <Badge variant="outline" className="ml-2">
                                                    Cluster ({process.instances} instâncias)
                                                </Badge>
                                            )}
                                            {process.exec_mode && !isCluster && (
                                                <Badge variant="outline" className="ml-2 text-xs">
                                                    {process.exec_mode}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                            <span>PID: {process.pid}</span>
                                            {process.pm2_id !== undefined && (
                                                <span>PM2 ID: {process.pm2_id}</span>
                                            )}
                                            <span>
                                                Última atualização: {formatDistanceToNow(new Date(process.lastUpdate), { 
                                                    addSuffix: true,
                                                    locale: ptBR 
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-sm font-medium">
                                            CPU: {process.cpu > 0 ? process.cpu.toFixed(2) + '%' : 'Coletando...'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">{formatBytes(process.memory)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Uptime: {process.uptime > 0 ? formatUptime(process.uptime) : 'Iniciando...'}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Detalhes de cluster */}
                                {isCluster && isExpanded && process.cluster_instances && (
                                    <div className="mt-3 ml-6 space-y-2 border-l-2 border-muted pl-4">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">
                                            Instâncias do Cluster:
                                        </p>
                                        {process.cluster_instances.map((instance, idx) => (
                                            <div key={instance.pid} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center space-x-2">
                                                    <span className="font-mono">#{idx + 1}</span>
                                                    <span className="text-muted-foreground">PID: {instance.pid}</span>
                                                    <Badge 
                                                        variant={instance.status === 'online' ? 'default' : 'secondary'}
                                                        className={instance.status === 'online' ? 'bg-green-500' : ''}
                                                    >
                                                        {instance.status}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center space-x-3 text-muted-foreground">
                                                    <span>CPU: {instance.cpu.toFixed(1)}%</span>
                                                    <span>{formatBytes(instance.memory)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

