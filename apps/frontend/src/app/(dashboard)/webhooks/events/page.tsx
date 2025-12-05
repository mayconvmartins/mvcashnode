'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, RefreshCw, AlertCircle, CheckCircle, XCircle, Clock, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { webhooksService } from '@/lib/api/webhooks.service'
import type { WebhookEvent } from '@/lib/types'
import { formatDateTime } from '@/lib/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'

export default function WebhookEventsPage() {
    const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null)
    const [filters, setFilters] = useState({
        status: 'all',
        trade_mode: 'all',
        webhookSourceId: undefined as number | undefined,
        page: 1,
        limit: 50,
    })

    const { data: eventsData, isLoading, refetch } = useQuery({
        queryKey: ['webhook-events', filters],
        queryFn: () => webhooksService.listEvents({
            status: filters.status !== 'all' ? filters.status : undefined,
            trade_mode: filters.trade_mode !== 'all' ? filters.trade_mode : undefined,
            webhookSourceId: filters.webhookSourceId,
            page: filters.page,
            limit: filters.limit,
        }),
    })

    const getStatusBadge = (event: WebhookEvent) => {
        const status = event.status
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'success'> = {
            RECEIVED: 'secondary',
            JOB_CREATED: 'success',
            SKIPPED: 'destructive',
            FAILED: 'destructive',
        }

        const icons: Record<string, any> = {
            RECEIVED: Clock,
            JOB_CREATED: CheckCircle,
            SKIPPED: XCircle,
            FAILED: AlertCircle,
        }

        const Icon = icons[status] || Clock
        const badge = (
            <Badge variant={variants[status] || 'secondary'} className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {status}
            </Badge>
        )

        // Se for SKIPPED e tiver motivo, adicionar tooltip
        if (status === 'SKIPPED' && event.validation_error) {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                                {badge}
                                <Info className="h-3 w-3 text-muted-foreground" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                            <div className="space-y-1">
                                <p className="font-semibold">Motivo do SKIP:</p>
                                <p className="text-sm whitespace-pre-wrap">{event.validation_error}</p>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )
        }

        return badge
    }

    const getActionBadge = (action: string) => {
        if (action === 'BUY_SIGNAL') {
            return <Badge variant="success" className="bg-green-500">COMPRA</Badge>
        } else if (action === 'SELL_SIGNAL') {
            return <Badge variant="destructive">VENDA</Badge>
        }
        return <Badge variant="secondary">{action}</Badge>
    }

    const columns: Column<WebhookEvent>[] = [
        {
            key: 'id',
            label: 'ID',
            render: (event) => <span className="font-mono text-sm">#{event.id}</span>,
        },
        {
            key: 'webhook_source',
            label: 'Webhook',
            render: (event) => (
                <div>
                    <div className="font-medium">{event.webhook_source?.label || 'N/A'}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                        {event.webhook_source?.webhook_code || 'N/A'}
                    </div>
                </div>
            ),
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (event) => (
                <div>
                    <div className="font-medium">{event.symbol_normalized || event.symbol_raw || 'N/A'}</div>
                    {event.symbol_raw !== event.symbol_normalized && (
                        <div className="text-xs text-muted-foreground">{event.symbol_raw}</div>
                    )}
                </div>
            ),
        },
        {
            key: 'action',
            label: 'Ação',
            render: (event) => getActionBadge(event.action),
        },
        {
            key: 'status',
            label: 'Status',
            render: (event) => getStatusBadge(event),
        },
        {
            key: 'trade_mode',
            label: 'Modo',
            render: (event) => (
                <Badge variant={event.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                    {event.trade_mode}
                </Badge>
            ),
        },
        {
            key: 'created_at',
            label: 'Recebido em',
            render: (event) => (
                <div className="text-sm">
                    <div>{formatDateTime(event.created_at).split(' ')[0]}</div>
                    <div className="text-muted-foreground">{formatDateTime(event.created_at).split(' ')[1]}</div>
                </div>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (event) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEvent(event)}
                >
                    <Eye className="h-4 w-4" />
                </Button>
            ),
        },
    ]

    const events = eventsData?.data || []
    const pagination = eventsData?.pagination

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Eventos de Webhook</h1>
                    <p className="text-muted-foreground mt-1">
                        Histórico de todos os sinais recebidos via webhook
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                </Button>
            </div>

            {/* Filters */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Status</label>
                            <select
                                className="w-full px-3 py-2 border rounded-md bg-background"
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                            >
                                <option value="all">Todos</option>
                                <option value="RECEIVED">Recebido</option>
                                <option value="JOB_CREATED">Job Criado</option>
                                <option value="SKIPPED">Ignorado</option>
                                <option value="FAILED">Falhou</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Modo</label>
                            <select
                                className="w-full px-3 py-2 border rounded-md bg-background"
                                value={filters.trade_mode}
                                onChange={(e) => setFilters({ ...filters, trade_mode: e.target.value, page: 1 })}
                            >
                                <option value="all">Todos</option>
                                <option value="REAL">Real</option>
                                <option value="SIMULATION">Simulação</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Events Table */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Eventos Recebidos</CardTitle>
                    <CardDescription>
                        {pagination?.total_items || 0} evento(s) encontrado(s)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ) : events && Array.isArray(events) && events.length > 0 ? (
                        <>
                            <DataTable
                                data={events}
                                columns={columns}
                                loading={false}
                            />
                            {pagination && pagination.total_pages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                    <div className="text-sm text-muted-foreground">
                                        Página {pagination.current_page} de {pagination.total_pages}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                                            disabled={filters.page <= 1}
                                        >
                                            Anterior
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                                            disabled={filters.page >= pagination.total_pages}
                                        >
                                            Próxima
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <EmptyState
                            icon={AlertCircle}
                            title="Nenhum evento encontrado"
                            description="Ainda não há eventos de webhook registrados. Os eventos aparecerão aqui quando você receber sinais via webhook."
                        />
                    )}
                </CardContent>
            </Card>

            {/* Event Details Modal */}
            {selectedEvent && (
                <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Detalhes do Evento #{selectedEvent.id}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                                    <div className="mt-1">{getStatusBadge(selectedEvent)}</div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Modo</label>
                                    <div className="mt-1">
                                        <Badge variant={selectedEvent.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                                            {selectedEvent.trade_mode}
                                        </Badge>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Ação</label>
                                    <div className="mt-1">{getActionBadge(selectedEvent.action)}</div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Símbolo</label>
                                    <div className="mt-1 font-mono">{selectedEvent.symbol_normalized || selectedEvent.symbol_raw}</div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Timeframe</label>
                                    <div className="mt-1">{selectedEvent.timeframe || 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Preço Referência</label>
                                    <div className="mt-1">{selectedEvent.price_reference ? `$${selectedEvent.price_reference}` : 'N/A'}</div>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Recebido em</label>
                                    <div className="mt-1">{formatDateTime(selectedEvent.created_at)}</div>
                                </div>
                                {selectedEvent.processed_at && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Processado em</label>
                                        <div className="mt-1">{formatDateTime(selectedEvent.processed_at)}</div>
                                    </div>
                                )}
                            </div>
                            {selectedEvent.raw_text && (
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Texto Original</label>
                                    <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm">
                                        {selectedEvent.raw_text}
                                    </div>
                                </div>
                            )}
                            {selectedEvent.raw_payload_json && (
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Payload JSON</label>
                                    <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                                        {JSON.stringify(selectedEvent.raw_payload_json, null, 2)}
                                    </pre>
                                </div>
                            )}
                            {(selectedEvent.validation_error || selectedEvent.status === 'SKIPPED') && (
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">
                                        {selectedEvent.status === 'SKIPPED' ? 'Motivo do SKIP' : 'Erro de Validação'}
                                    </label>
                                    <div className="mt-1 p-3 bg-destructive/10 text-destructive rounded-md text-sm whitespace-pre-wrap">
                                        {selectedEvent.validation_error || 'Nenhum motivo especificado'}
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}
