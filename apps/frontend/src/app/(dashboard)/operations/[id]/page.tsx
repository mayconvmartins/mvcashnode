'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { operationsService } from '@/lib/api/operations.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import { OperationsTimeline } from '@/components/operations/OperationsTimeline'

export default function OperationDetailPage() {
    const params = useParams()
    const router = useRouter()
    const operationId = params.id as string

    const { data: operation, isLoading } = useQuery({
        queryKey: ['operation', operationId],
        queryFn: () => operationsService.getById(operationId),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!operation) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Operação não encontrada</h2>
                <Button onClick={() => router.push('/operations')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Operações
                </Button>
            </div>
        )
    }

    const statusColors: Record<string, string> = {
        PENDING: 'secondary',
        RUNNING: 'default',
        COMPLETED: 'default',
        FAILED: 'destructive',
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/operations')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{operation.type}</h1>
                        <p className="text-muted-foreground">
                            {operation.account?.name || 'N/A'}
                        </p>
                    </div>
                </div>
                <Badge variant={statusColors[operation.status] as any}>
                    {operation.status}
                </Badge>
            </div>

            {/* Timeline */}
            <OperationsTimeline operation={operation} />

            {/* Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-mono">{operation.id}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Tipo:</span>
                        <span>{operation.type}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Criada em:</span>
                        <span>{formatDate(operation.createdAt)}</span>
                    </div>
                    {operation.startedAt && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Iniciada em:</span>
                            <span>{formatDate(operation.startedAt)}</span>
                        </div>
                    )}
                    {operation.completedAt && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Completada em:</span>
                            <span>{formatDate(operation.completedAt)}</span>
                        </div>
                    )}
                    {operation.duration && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Duração:</span>
                            <span>{operation.duration}ms</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payload */}
            {operation.payload && (
                <Card>
                    <CardHeader>
                        <CardTitle>Payload</CardTitle>
                        <CardDescription>Dados da operação</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                            {JSON.stringify(operation.payload, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Result */}
            {operation.result && (
                <Card>
                    <CardHeader>
                        <CardTitle>Resultado</CardTitle>
                        <CardDescription>Resultado da operação</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                            {JSON.stringify(operation.result, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* Error */}
            {operation.error && (
                <Card className="border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive">Erro</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-destructive">{operation.error}</p>
                    </CardContent>
                </Card>
            )}

            {/* Logs */}
            {operation.logs && operation.logs.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Logs</CardTitle>
                        <CardDescription>{operation.logs.length} entrada(s)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-[400px] overflow-auto">
                            {operation.logs.map((log: any, index: number) => (
                                <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                                    <span className="text-muted-foreground">[{formatDate(log.timestamp)}]</span>{' '}
                                    <span className={log.level === 'error' ? 'text-destructive' : ''}>
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

