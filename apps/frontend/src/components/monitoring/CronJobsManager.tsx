'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cronService, type CronJobConfig } from '@/lib/api/cron.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
    Clock,
    Play,
    Pause,
    Settings,
    CheckCircle,
    XCircle,
    AlertTriangle,
    TrendingUp,
} from 'lucide-react'
import { CleanupOrphanedPositions } from './CleanupOrphanedPositions'

export function CronJobsManager() {
    const queryClient = useQueryClient()
    const [editingJob, setEditingJob] = useState<CronJobConfig | null>(null)
    const [editInterval, setEditInterval] = useState<number>(0)

    // Query para buscar todos os jobs
    const { data: jobs, isLoading } = useQuery({
        queryKey: ['cron', 'jobs'],
        queryFn: () => cronService.getAllJobs(),
        refetchInterval: 10000, // Atualizar a cada 10s
    })

    // Mutation para pausar job
    const pauseMutation = useMutation({
        mutationFn: (name: string) => cronService.pauseJob(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cron', 'jobs'] })
            toast.success('Job pausado com sucesso')
        },
        onError: () => {
            toast.error('Erro ao pausar job')
        },
    })

    // Mutation para retomar job
    const resumeMutation = useMutation({
        mutationFn: (name: string) => cronService.resumeJob(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cron', 'jobs'] })
            toast.success('Job retomado com sucesso')
        },
        onError: () => {
            toast.error('Erro ao retomar job')
        },
    })

    // Mutation para executar manualmente
    const executeMutation = useMutation({
        mutationFn: (name: string) => cronService.executeManually(name),
        onSuccess: () => {
            toast.success('Job adicionado à fila para execução')
        },
        onError: () => {
            toast.error('Erro ao executar job')
        },
    })

    // Mutation para atualizar job
    const updateMutation = useMutation({
        mutationFn: ({ name, interval_ms }: { name: string; interval_ms: number }) =>
            cronService.updateJob(name, { interval_ms }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cron', 'jobs'] })
            toast.success('Job atualizado com sucesso')
            setEditingJob(null)
        },
        onError: () => {
            toast.error('Erro ao atualizar job')
        },
    })

    const disableMutation = useMutation({
        mutationFn: (name: string) => cronService.updateJob(name, { enabled: false, status: 'DISABLED' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cron', 'jobs'] })
            toast.success('Job desabilitado com sucesso')
        },
        onError: () => {
            toast.error('Erro ao desabilitar job')
        },
    })

    const enableMutation = useMutation({
        mutationFn: (name: string) => cronService.updateJob(name, { enabled: true, status: 'ACTIVE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cron', 'jobs'] })
            toast.success('Job habilitado com sucesso')
        },
        onError: () => {
            toast.error('Erro ao habilitar job')
        },
    })

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return (
                    <Badge className="bg-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Ativo
                    </Badge>
                )
            case 'PAUSED':
                return (
                    <Badge variant="secondary">
                        <Pause className="h-3 w-3 mr-1" />
                        Pausado
                    </Badge>
                )
            case 'DISABLED':
                return (
                    <Badge variant="outline">
                        <XCircle className="h-3 w-3 mr-1" />
                        Desabilitado
                    </Badge>
                )
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    const formatInterval = (ms: number) => {
        if (ms < 60000) return `${ms / 1000}s`
        if (ms < 3600000) return `${ms / 60000}m`
        return `${ms / 3600000}h`
    }

    const handleOpenEdit = (job: CronJobConfig) => {
        setEditingJob(job)
        setEditInterval(job.interval_ms)
    }

    const handleSaveEdit = () => {
        if (editingJob && editInterval >= 1000) {
            updateMutation.mutate({
                name: editingJob.name,
                interval_ms: editInterval,
            })
        }
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    <p>Carregando jobs...</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Clock className="h-5 w-5" />
                            <span>Jobs Agendados (Cron)</span>
                        </div>
                        <Badge variant="outline">{jobs?.length || 0} jobs</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {jobs?.map((job) => (
                            <div key={job.id} className="border rounded-lg p-4 space-y-3">
                                {/* Header */}
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1 flex-1">
                                        <div className="flex items-center space-x-2">
                                            <h3 className="font-medium text-sm">{job.name}</h3>
                                            {getStatusBadge(job.status)}
                                            {job.bullmq_status === 'not_found' && (
                                                <Badge variant="destructive" className="text-xs">
                                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                                    Não encontrado no BullMQ
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{job.description}</p>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        {job.enabled === false || job.status === 'DISABLED' ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => enableMutation.mutate(job.name)}
                                                disabled={enableMutation.isPending}
                                            >
                                                <Play className="h-3 w-3 mr-1" />
                                                Habilitar
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => disableMutation.mutate(job.name)}
                                                disabled={disableMutation.isPending}
                                            >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                Desabilitar
                                            </Button>
                                        )}
                                        {job.status === 'PAUSED' ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => resumeMutation.mutate(job.name)}
                                                disabled={resumeMutation.isPending}
                                            >
                                                <Play className="h-3 w-3 mr-1" />
                                                Retomar
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => pauseMutation.mutate(job.name)}
                                                disabled={pauseMutation.isPending || job.enabled === false || job.status === 'DISABLED'}
                                            >
                                                <Pause className="h-3 w-3 mr-1" />
                                                Pausar
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => executeMutation.mutate(job.name)}
                                            disabled={executeMutation.isPending || job.enabled === false || job.status === 'DISABLED'}
                                        >
                                            <Play className="h-3 w-3 mr-1" />
                                            Executar
                                        </Button>
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(job)}
                                                >
                                                    <Settings className="h-3 w-3" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Editar Job: {job.name}</DialogTitle>
                                                    <DialogDescription>
                                                        Altere o intervalo de execução do job
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 py-4">
                                                    <div className="space-y-2">
                                                        <Label>Intervalo (milissegundos)</Label>
                                                        <Input
                                                            type="number"
                                                            value={editInterval}
                                                            onChange={(e) =>
                                                                setEditInterval(parseInt(e.target.value) || 0)
                                                            }
                                                            min={1000}
                                                            step={1000}
                                                        />
                                                        <p className="text-xs text-muted-foreground">
                                                            Equivale a: {formatInterval(editInterval)}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        onClick={handleSaveEdit}
                                                        disabled={
                                                            editInterval < 1000 || updateMutation.isPending
                                                        }
                                                        className="w-full"
                                                    >
                                                        Salvar Alterações
                                                    </Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                                    <div>
                                        <p className="text-muted-foreground">Intervalo</p>
                                        <p className="font-medium">{formatInterval(job.interval_ms)}</p>
                                    </div>
                                    {job.statistics && (
                                        <>
                                            <div>
                                                <p className="text-muted-foreground">Total Execuções</p>
                                                <p className="font-medium">{job.statistics.total_runs}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Taxa Sucesso</p>
                                                <p className="font-medium text-green-500">
                                                    {job.statistics.success_rate?.toFixed(1) || 0}%
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Falhas</p>
                                                <p className="font-medium text-red-500">
                                                    {job.statistics.failure_count}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Duração Média</p>
                                                <p className="font-medium">
                                                    {job.statistics.avg_duration_ms}ms
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Last & Next Execution */}
                                <div className="flex items-center justify-between text-xs pt-2 border-t">
                                    {job.last_execution && (
                                        <div className="flex items-center space-x-2">
                                            <span className="text-muted-foreground">Última execução:</span>
                                            <span>
                                                {formatDistanceToNow(new Date(job.last_execution.started_at), {
                                                    addSuffix: true,
                                                    locale: ptBR,
                                                })}
                                            </span>
                                            <Badge
                                                variant={
                                                    job.last_execution.status === 'SUCCESS'
                                                        ? 'default'
                                                        : 'destructive'
                                                }
                                                className={
                                                    job.last_execution.status === 'SUCCESS'
                                                        ? 'bg-green-500'
                                                        : ''
                                                }
                                            >
                                                {job.last_execution.status}
                                            </Badge>
                                        </div>
                                    )}
                                    {job.next_execution && (
                                        <div className="flex items-center space-x-2 text-muted-foreground">
                                            <TrendingUp className="h-3 w-3" />
                                            <span>
                                                Próxima:{' '}
                                                {formatDistanceToNow(new Date(job.next_execution), {
                                                    addSuffix: true,
                                                    locale: ptBR,
                                                })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {(!jobs || jobs.length === 0) && (
                            <div className="text-center py-8 text-muted-foreground">
                                <p className="text-sm">Nenhum job configurado</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Ações Manuais */}
            <CleanupOrphanedPositions />
        </div>
    )
}

