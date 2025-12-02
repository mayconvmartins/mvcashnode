'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/format'
import { useRouter } from 'next/navigation'
import { EventFilters } from '@/components/webhooks/EventFilters'

export default function WebhookEventsPage() {
    const router = useRouter()
    const [filters, setFilters] = useState({
        source: 'all',
        status: 'all',
        search: '',
    })

    const { data: events, isLoading } = useQuery({
        queryKey: ['webhook-events', filters],
        queryFn: () => webhooksService.getEvents(filters),
    })

    const handleFilterChange = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Eventos de Webhooks</h1>
                <p className="text-muted-foreground">
                    Histórico de todos os eventos recebidos
                </p>
            </div>

            {/* Filters */}
            <EventFilters filters={filters} onFilterChange={handleFilterChange} />

            {/* Events List */}
            <div className="space-y-4">
                {isLoading ? (
                    <>
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                    </>
                ) : events && events.length > 0 ? (
                    events.map((event: any) => (
                        <Card 
                            key={event.id}
                            className="cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => router.push(`/webhooks/events/${event.id}`)}
                        >
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">{event.source}</CardTitle>
                                        <CardDescription>
                                            {formatDate(event.receivedAt)}
                                        </CardDescription>
                                    </div>
                                    <Badge variant={event.processed ? 'default' : 'secondary'}>
                                        {event.processed ? 'Processado' : 'Pendente'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Webhook:</span>
                                        <span>{event.webhook?.name || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Jobs Criados:</span>
                                        <span>{event.jobsCreated || 0}</span>
                                    </div>
                                    {event.error && (
                                        <div className="pt-2 text-destructive text-xs">
                                            Erro: {event.error}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <p className="text-muted-foreground mb-4">
                                Nenhum evento encontrado
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}

