'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { JobMetrics } from '@/lib/api/monitoring.service'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react'

interface JobsListProps {
    jobs: JobMetrics[]
}

export function JobsList({ jobs }: JobsListProps) {
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge variant="default" className="bg-green-500">Ativo</Badge>
            case 'paused':
                return <Badge variant="secondary">Pausado</Badge>
            case 'disabled':
                return <Badge variant="outline">Desabilitado</Badge>
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    const getSuccessRate = (job: JobMetrics) => {
        const total = job.statistics.totalRuns
        if (total === 0) return 0
        return ((job.statistics.successCount / total) * 100).toFixed(1)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Jobs do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <div key={job.name} className="border rounded-lg p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="space-y-1 flex-1">
                                    <div className="flex items-center space-x-2">
                                        <Activity className="h-4 w-4 text-primary" />
                                        <p className="text-sm font-medium">{job.name}</p>
                                        {getStatusBadge(job.status)}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{job.description}</p>
                                </div>
                            </div>

                            {/* Estatísticas */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                    <p className="text-muted-foreground">Total</p>
                                    <p className="font-medium">{job.statistics.totalRuns}</p>
                                </div>
                                <div>
                                    <div className="flex items-center space-x-1">
                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                        <p className="text-muted-foreground">Sucesso</p>
                                    </div>
                                    <p className="font-medium text-green-500">{job.statistics.successCount}</p>
                                </div>
                                <div>
                                    <div className="flex items-center space-x-1">
                                        <XCircle className="h-3 w-3 text-red-500" />
                                        <p className="text-muted-foreground">Falhas</p>
                                    </div>
                                    <p className="font-medium text-red-500">{job.statistics.failureCount}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Taxa Sucesso</p>
                                    <p className="font-medium">{getSuccessRate(job)}%</p>
                                </div>
                            </div>

                            {/* Última execução */}
                            {job.lastExecution && (
                                <div className="mt-3 pt-3 border-t">
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center space-x-1">
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-muted-foreground">Última execução:</span>
                                            <span>
                                                {formatDistanceToNow(new Date(job.lastExecution.timestamp), {
                                                    addSuffix: true,
                                                    locale: ptBR,
                                                })}
                                            </span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Badge 
                                                variant={job.lastExecution.result === 'success' ? 'default' : 'destructive'}
                                                className={job.lastExecution.result === 'success' ? 'bg-green-500' : ''}
                                            >
                                                {job.lastExecution.result === 'success' ? 'Sucesso' : 'Falha'}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                                {job.lastExecution.duration}ms
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Próxima execução */}
                            {job.nextExecution && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                    Próxima execução: {formatDistanceToNow(new Date(job.nextExecution), {
                                        addSuffix: true,
                                        locale: ptBR,
                                    })}
                                </div>
                            )}
                        </div>
                    ))}

                    {jobs.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                            <p className="text-sm">Nenhum job configurado</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

