'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { 
    ArrowLeft, 
    CheckCircle, 
    XCircle, 
    Clock, 
    AlertCircle,
    Activity,
    ExternalLink,
    Copy,
    RefreshCw,
    ArrowRight,
    Zap,
    PlayCircle,
    Database,
    Workflow
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'
import { toast } from 'sonner'
import Link from 'next/link'
import { EmptyState } from '@/components/shared/EmptyState'

export default function WebhookEventDetailPage() {
    const params = useParams()
    const router = useRouter()
    const eventId = parseInt(params.id as string)

    const { data: event, isLoading, refetch } = useQuery({
        queryKey: ['webhook-event', eventId],
        queryFn: () => webhooksService.getEvent(eventId),
        enabled: !isNaN(eventId),
    })

    const getStatusBadge = (status: string) => {
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

        const labels: Record<string, string> = {
            RECEIVED: 'Recebido',
            JOB_CREATED: 'Job Criado',
            SKIPPED: 'Ignorado',
            FAILED: 'Falhou',
        }

        const Icon = icons[status] || Clock
        const label = labels[status] || status

        return (
            <Badge variant={variants[status] || 'secondary'} className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {label}
            </Badge>
        )
    }

    const getActionBadge = (action: string) => {
        if (action === 'BUY_SIGNAL') {
            return <Badge variant="success" className="bg-green-500">COMPRA</Badge>
        } else if (action === 'SELL_SIGNAL') {
            return <Badge variant="destructive">VENDA</Badge>
        }
        return <Badge variant="secondary">{action}</Badge>
    }

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        toast.success(`${label} copiado para a área de transferência`)
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!event) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <EmptyState
                    icon={AlertCircle}
                    title="Evento não encontrado"
                    description="O evento que você está procurando não existe ou foi removido."
                />
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
                        <h1 className="text-3xl font-bold gradient-text">Evento #{event.id}</h1>
                        <p className="text-muted-foreground mt-1">
                            {event.webhook_source?.label || 'Webhook desconhecido'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                    {getStatusBadge(event.status)}
                </div>
            </div>

            {/* Informações Principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Ação</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {getActionBadge(event.action)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Símbolo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold font-mono">{event.symbol_normalized || event.symbol_raw}</div>
                        {event.symbol_raw !== event.symbol_normalized && (
                            <div className="text-xs text-muted-foreground mt-1">Original: {event.symbol_raw}</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Modo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge variant={event.trade_mode === 'REAL' ? 'destructive' : 'secondary'} className="text-lg px-3 py-1">
                            {event.trade_mode}
                        </Badge>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Jobs Criados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {event.jobs_created?.length || 0}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Detalhes do Evento */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Detalhes do Evento</CardTitle>
                    <CardDescription>Informações completas sobre o evento recebido</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Event UID</label>
                            <div className="mt-1 flex items-center gap-2">
                                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 font-mono">
                                    {event.event_uid}
                                </code>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => copyToClipboard(event.event_uid, 'Event UID')}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Webhook Source</label>
                            <div className="mt-1">
                                {event.webhook_source ? (
                                    <Link 
                                        href={`/webhooks/${event.webhook_source.id}`}
                                        className="text-sm font-medium hover:underline flex items-center gap-1"
                                    >
                                        {event.webhook_source.label}
                                        <ExternalLink className="h-3 w-3" />
                                    </Link>
                                ) : (
                                    <span className="text-sm">N/A</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Timeframe</label>
                            <div className="mt-1">
                                {event.timeframe ? (
                                    <Badge variant="outline">{event.timeframe}</Badge>
                                ) : (
                                    <span className="text-sm text-muted-foreground">N/A</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Preço Referência</label>
                            <div className="mt-1">
                                {event.price_reference ? (
                                    <span className="text-sm font-mono">
                                        ${typeof event.price_reference === 'string' ? event.price_reference : event.price_reference}
                                    </span>
                                ) : (
                                    <span className="text-sm text-muted-foreground">N/A</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Recebido em</label>
                            <div className="mt-1 text-sm">{formatDateTime(event.created_at)}</div>
                        </div>

                        {event.processed_at && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Processado em</label>
                                <div className="mt-1 text-sm">{formatDateTime(event.processed_at)}</div>
                            </div>
                        )}
                    </div>

                    {event.validation_error && (
                        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                                <div className="flex-1">
                                    <label className="text-sm font-medium text-destructive">Erro de Validação</label>
                                    <p className="text-sm text-destructive mt-1">{event.validation_error}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payload e Fluxo */}
            <Tabs defaultValue="flow" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="flow">
                        <Workflow className="h-4 w-4 mr-2" />
                        Fluxo ({event.jobs?.length || 0} jobs)
                    </TabsTrigger>
                    <TabsTrigger value="raw">Payload Raw</TabsTrigger>
                    <TabsTrigger value="parsed">Dados Parseados</TabsTrigger>
                </TabsList>

                <TabsContent value="flow">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Fluxo de Execução</CardTitle>
                            <CardDescription>
                                Visualização completa desde o webhook até as operações finais em todas as contas
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="relative overflow-x-auto pb-8">
                                {/* Evento Webhook e Jobs em uma linha horizontal */}
                                {event.jobs && event.jobs.length > 0 ? (
                                    <div className="flex items-center gap-4 min-w-max px-4">
                                        {/* Evento Webhook */}
                                        <div className="flex-shrink-0">
                                            <div className="relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-green-500 bg-green-500/10 min-w-[200px]">
                                                <div className="p-3 rounded-full bg-green-500 text-white">
                                                    <Zap className="h-6 w-6" />
                                                </div>
                                                <div className="text-center">
                                                    <h3 className="font-semibold text-sm">Webhook Recebido</h3>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {event.webhook_source?.label || 'Webhook'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {event.symbol_normalized || event.symbol_raw}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Seta para Jobs */}
                                        <div className="flex-shrink-0 flex items-center">
                                            <ArrowRight className="h-6 w-6 text-muted-foreground" />
                                        </div>

                                        {/* Jobs (múltiplos) - todos na mesma linha */}
                                        {event.jobs.map((job, jobIndex) => {
                                            const jobStatus = job.status === 'FILLED' ? 'success' : 
                                                           job.status === 'FAILED' ? 'error' : 'pending'
                                            const hasExecutions = job.executions && job.executions.length > 0
                                            const hasPosition = job.position_open !== null && job.position_open !== undefined

                                            return (
                                                <div key={job.id} className="flex items-center gap-4">
                                                    {/* Seta entre jobs (se não for o primeiro) */}
                                                    {jobIndex > 0 && (
                                                        <div className="flex-shrink-0 flex items-center">
                                                            <div className="h-px w-8 bg-muted-foreground/30"></div>
                                                            <ArrowRight className="h-6 w-6 text-muted-foreground" />
                                                        </div>
                                                    )}

                                                    {/* Job */}
                                                    <div className="flex-shrink-0">
                                                        <div className={`
                                                            relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 min-w-[200px]
                                                            ${
                                                                jobStatus === 'success'
                                                                    ? 'border-blue-500 bg-blue-500/10'
                                                                    : jobStatus === 'error'
                                                                    ? 'border-red-500 bg-red-500/10'
                                                                    : 'border-yellow-500 bg-yellow-500/10'
                                                            }
                                                        `}>
                                                            <div className={`
                                                                p-3 rounded-full
                                                                ${
                                                                    jobStatus === 'success'
                                                                        ? 'bg-blue-500 text-white'
                                                                        : jobStatus === 'error'
                                                                        ? 'bg-red-500 text-white'
                                                                        : 'bg-yellow-500 text-white'
                                                                }
                                                            `}>
                                                                <Activity className="h-6 w-6" />
                                                            </div>
                                                            <div className="text-center">
                                                                <h3 className="font-semibold text-sm">Job #{job.id}</h3>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {job.exchange_account?.label || 'Conta'}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                    {job.symbol} • {job.side}
                                                                </p>
                                                                <Badge 
                                                                    variant={jobStatus === 'success' ? 'success' : jobStatus === 'error' ? 'destructive' : 'secondary'}
                                                                    className="mt-2 text-xs"
                                                                >
                                                                    {job.status}
                                                                </Badge>
                                                            </div>
                                                            <Link href={`/jobs/${job.id}`}>
                                                                <Button variant="ghost" size="sm" className="mt-2">
                                                                    <ExternalLink className="h-3 w-3 mr-1" />
                                                                    Ver Job
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    </div>

                                                    {/* Seta e Execuções */}
                                                    {hasExecutions && (
                                                        <>
                                                            <div className="flex-shrink-0 flex items-center">
                                                                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                                                            </div>

                                                            {/* Execuções */}
                                                            <div className="flex-shrink-0">
                                                                <div className={`
                                                                    relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 min-w-[200px]
                                                                    ${hasExecutions ? 'border-green-500 bg-green-500/10' : 'border-gray-300 bg-gray-100/50 opacity-50'}
                                                                `}>
                                                                    <div className={`
                                                                        p-3 rounded-full
                                                                        ${hasExecutions ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}
                                                                    `}>
                                                                        <PlayCircle className="h-6 w-6" />
                                                                    </div>
                                                                    <div className="text-center">
                                                                        <h3 className="font-semibold text-sm">Execuções</h3>
                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                            {job.executions?.length || 0} execução(ões)
                                                                        </p>
                                                                        {hasExecutions && job.executions && job.executions.length > 0 && (
                                                                            <div className="mt-2 space-y-1">
                                                                                {job.executions.slice(0, 2).map((exec) => (
                                                                                    <div key={exec.id} className="text-xs">
                                                                                        {Number(exec.executed_qty).toFixed(4)} @ ${Number(exec.avg_price).toFixed(2)}
                                                                                    </div>
                                                                                ))}
                                                                                {job.executions.length > 2 && (
                                                                                    <div className="text-xs text-muted-foreground">
                                                                                        +{job.executions.length - 2} mais
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* Seta e Posição */}
                                                    {hasPosition && (
                                                        <>
                                                            <div className="flex-shrink-0 flex items-center">
                                                                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                                                            </div>

                                                            {/* Posição */}
                                                            <div className="flex-shrink-0">
                                                                <div className="relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-purple-500 bg-purple-500/10 min-w-[200px]">
                                                                    <div className="p-3 rounded-full bg-purple-500 text-white">
                                                                        <Database className="h-6 w-6" />
                                                                    </div>
                                                                    <div className="text-center">
                                                                        <h3 className="font-semibold text-sm">Posição</h3>
                                                                        {job.position_open && (
                                                                            <>
                                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                                    {job.position_open.status}
                                                                                </p>
                                                                                <p className="text-xs text-muted-foreground mt-1">
                                                                                    {Number(job.position_open.qty_remaining).toFixed(4)} restante
                                                                                </p>
                                                                                <Badge variant="outline" className="mt-2 text-xs">
                                                                                    ${Number(job.position_open.price_open).toFixed(2)}
                                                                                </Badge>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                    {job.position_open && (
                                                                        <Link href={`/positions/${job.position_open.id}`}>
                                                                            <Button variant="ghost" size="sm" className="mt-2">
                                                                                <ExternalLink className="h-3 w-3 mr-1" />
                                                                                Ver Posição
                                                                            </Button>
                                                                        </Link>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4 min-w-max px-4">
                                        {/* Evento Webhook sem jobs */}
                                        <div className="flex-shrink-0">
                                            <div className="relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-green-500 bg-green-500/10 min-w-[200px]">
                                                <div className="p-3 rounded-full bg-green-500 text-white">
                                                    <Zap className="h-6 w-6" />
                                                </div>
                                                <div className="text-center">
                                                    <h3 className="font-semibold text-sm">Webhook Recebido</h3>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {event.webhook_source?.label || 'Webhook'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {event.symbol_normalized || event.symbol_raw}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="raw">
                    <Card className="glass">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Payload Raw</CardTitle>
                                    <CardDescription>Dados originais recebidos do webhook</CardDescription>
                                </div>
                                {event.raw_text && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(event.raw_text!, 'Payload')}
                                    >
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copiar
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {event.raw_text ? (
                                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap">
                                    {event.raw_text}
                                </pre>
                            ) : event.raw_payload_json ? (
                                <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                                    {JSON.stringify(event.raw_payload_json, null, 2)}
                                </pre>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>Nenhum payload disponível</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="parsed">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Dados Parseados</CardTitle>
                            <CardDescription>Informações extraídas do payload</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Símbolo Raw</label>
                                        <div className="mt-1 font-mono text-sm">{event.symbol_raw || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Símbolo Normalizado</label>
                                        <div className="mt-1 font-mono text-sm">{event.symbol_normalized || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Ação</label>
                                        <div className="mt-1">{getActionBadge(event.action)}</div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Timeframe</label>
                                        <div className="mt-1">{event.timeframe || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Preço Referência</label>
                                        <div className="mt-1">
                                            {event.price_reference 
                                                ? `$${typeof event.price_reference === 'string' ? event.price_reference : event.price_reference}` 
                                                : 'N/A'
                                            }
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Status</label>
                                        <div className="mt-1">{getStatusBadge(event.status)}</div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Jobs Criados */}
            {event.jobs_created && event.jobs_created.length > 0 ? (
                <Card className="glass">
                    <CardHeader>
                        <CardTitle>Jobs Criados</CardTitle>
                        <CardDescription>
                            {event.jobs_created.length} job(s) foram criados a partir deste evento
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {event.jobs_created.map((job) => (
                                <div
                                    key={job.id}
                                    className="flex items-center justify-between p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div>
                                            <div className="font-medium">Job #{job.id}</div>
                                            <div className="text-sm text-muted-foreground mt-1">
                                                <span className="font-mono">{job.symbol}</span>
                                                {' • '}
                                                <span className="uppercase">{job.side}</span>
                                                {job.executions_count !== undefined && (
                                                    <>
                                                        {' • '}
                                                        <span>{job.executions_count} execuções</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge 
                                            variant={
                                                job.status === 'COMPLETED' ? 'success' :
                                                job.status === 'FAILED' ? 'destructive' :
                                                'secondary'
                                            }
                                        >
                                            {job.status}
                                        </Badge>
                                        <Link href={`/jobs/${job.id}`}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="glass">
                    <CardHeader>
                        <CardTitle>Jobs Criados</CardTitle>
                        <CardDescription>Nenhum job foi criado a partir deste evento</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <EmptyState
                            icon={Activity}
                            title="Nenhum job criado"
                            description={
                                event.status === 'SKIPPED' 
                                    ? 'Este evento foi ignorado e nenhum job foi criado.'
                                    : 'Ainda não há jobs criados a partir deste evento.'
                            }
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
