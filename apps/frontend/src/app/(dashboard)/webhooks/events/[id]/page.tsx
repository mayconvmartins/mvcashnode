'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'

export default function WebhookEventDetailPage() {
    const params = useParams()
    const router = useRouter()
    const eventId = params.id as string

    const { data: event, isLoading } = useQuery({
        queryKey: ['webhook-event', eventId],
        queryFn: () => webhooksService.getEventById(eventId),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!event) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Evento não encontrado</h2>
                <Button onClick={() => router.push('/webhooks/events')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Eventos
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/webhooks/events')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Evento #{event.id}</h1>
                        <p className="text-muted-foreground">{event.source}</p>
                    </div>
                </div>
                <Badge variant={event.processed ? 'default' : 'secondary'}>
                    {event.processed ? 'Processado' : 'Pendente'}
                </Badge>
            </div>

            {/* Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Informações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Webhook:</span>
                        <span>{event.webhook?.name || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Recebido em:</span>
                        <span>{formatDate(event.receivedAt)}</span>
                    </div>
                    {event.processedAt && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Processado em:</span>
                            <span>{formatDate(event.processedAt)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Jobs Criados:</span>
                        <span>{event.jobsCreated || 0}</span>
                    </div>
                    {event.error && (
                        <div className="pt-2">
                            <span className="text-muted-foreground block mb-1">Erro:</span>
                            <p className="text-sm text-destructive">{event.error}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payload */}
            <Tabs defaultValue="parsed" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="parsed">Payload Parseado</TabsTrigger>
                    <TabsTrigger value="raw">Payload Raw</TabsTrigger>
                </TabsList>

                <TabsContent value="parsed">
                    <Card>
                        <CardHeader>
                            <CardTitle>Payload Parseado</CardTitle>
                            <CardDescription>Dados interpretados do evento</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                                {JSON.stringify(event.parsedPayload || {}, null, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="raw">
                    <Card>
                        <CardHeader>
                            <CardTitle>Payload Raw</CardTitle>
                            <CardDescription>Dados originais recebidos</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                                {JSON.stringify(event.rawPayload || {}, null, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Jobs Created */}
            {event.jobs && event.jobs.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Jobs Criados</CardTitle>
                        <CardDescription>
                            {event.jobs.length} job(s) foram criados a partir deste evento
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {event.jobs.map((job: any) => (
                                <div
                                    key={job.id}
                                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                                >
                                    <div>
                                        <p className="font-medium">{job.type}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {job.account?.name || 'N/A'}
                                        </p>
                                    </div>
                                    <Badge variant={job.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                        {job.status}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

