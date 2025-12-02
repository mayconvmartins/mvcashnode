'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDateTime } from '@/lib/utils/format'
import { Calendar, Clock, Activity, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface JobDetailsData {
    id: number
    type: string
    status: string
    priority: number
    webhookEventId?: number
    tradeParameterId?: number
    payload: any
    result?: any
    error?: string
    attempts: number
    maxAttempts: number
    createdAt: string
    startedAt?: string
    completedAt?: string
    processingTime?: number
}

interface JobDetailsProps {
    job: JobDetailsData
}

export function JobDetails({ job }: JobDetailsProps) {
    const getStatusIcon = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed':
                return <CheckCircle className="h-5 w-5 text-green-500" />
            case 'failed':
                return <XCircle className="h-5 w-5 text-destructive" />
            case 'pending':
                return <Clock className="h-5 w-5 text-yellow-500" />
            case 'processing':
                return <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
            default:
                return <AlertCircle className="h-5 w-5 text-muted-foreground" />
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed':
                return <Badge className="bg-green-500">Concluído</Badge>
            case 'failed':
                return <Badge variant="destructive">Falhou</Badge>
            case 'pending':
                return <Badge className="bg-yellow-500">Pendente</Badge>
            case 'processing':
                return <Badge className="bg-blue-500">Processando</Badge>
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    return (
        <div className="space-y-6">
            {/* Header Info */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            {getStatusIcon(job.status)}
                            <div>
                                <CardTitle className="text-lg">Job #{job.id}</CardTitle>
                                <CardDescription>Tipo: {job.type}</CardDescription>
                            </div>
                        </div>
                        {getStatusBadge(job.status)}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                <span>Criado em</span>
                            </div>
                            <p className="text-sm font-medium">{formatDateTime(job.createdAt)}</p>
                        </div>

                        {job.startedAt && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Activity className="h-4 w-4" />
                                    <span>Iniciado em</span>
                                </div>
                                <p className="text-sm font-medium">{formatDateTime(job.startedAt)}</p>
                            </div>
                        )}

                        {job.completedAt && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CheckCircle className="h-4 w-4" />
                                    <span>Concluído em</span>
                                </div>
                                <p className="text-sm font-medium">{formatDateTime(job.completedAt)}</p>
                            </div>
                        )}

                        {job.processingTime && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="h-4 w-4" />
                                    <span>Tempo de processamento</span>
                                </div>
                                <p className="text-sm font-medium">{job.processingTime}ms</p>
                            </div>
                        )}
                    </div>

                    <Separator />

                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Prioridade</p>
                            <p className="text-sm font-medium">
                                <Badge variant="outline">{job.priority}</Badge>
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Tentativas</p>
                            <p className="text-sm font-medium">
                                {job.attempts} / {job.maxAttempts}
                            </p>
                        </div>
                        {job.webhookEventId && (
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">Webhook Event</p>
                                <p className="text-sm font-medium">#{job.webhookEventId}</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Payload */}
            {job.payload && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Payload</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
                            {JSON.stringify(job.payload, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Result */}
            {job.result && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Resultado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="p-4 rounded-lg bg-muted text-sm overflow-x-auto">
                            {JSON.stringify(job.result, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Error */}
            {job.error && (
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <XCircle className="h-5 w-5 text-destructive" />
                            <CardTitle className="text-base text-destructive">Erro</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                            <p className="text-sm text-destructive whitespace-pre-wrap">{job.error}</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
