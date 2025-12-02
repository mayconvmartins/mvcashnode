'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { jobsService, type TradeJobWithRelations } from '@/lib/api/jobs.service'
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
    TrendingUp,
    TrendingDown,
    Database,
    PlayCircle
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'
import { toast } from 'sonner'
import Link from 'next/link'
import { EmptyState } from '@/components/shared/EmptyState'

export default function JobDetailPage() {
    const params = useParams()
    const router = useRouter()
    const jobId = parseInt(params.id as string)

    const { data: job, isLoading, refetch } = useQuery({
        queryKey: ['trade-job', jobId],
        queryFn: () => jobsService.getJob(jobId),
        enabled: !isNaN(jobId),
    })

    const getStatusBadge = (status: string) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'success'> = {
            PENDING: 'secondary',
            EXECUTING: 'default',
            FILLED: 'success',
            FAILED: 'destructive',
            CANCELLED: 'destructive',
        }

        const icons: Record<string, any> = {
            PENDING: Clock,
            EXECUTING: PlayCircle,
            FILLED: CheckCircle,
            FAILED: XCircle,
            CANCELLED: XCircle,
        }

        const labels: Record<string, string> = {
            PENDING: 'Pendente',
            EXECUTING: 'Executando',
            FILLED: 'Preenchido',
            FAILED: 'Falhou',
            CANCELLED: 'Cancelado',
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

    const getSideBadge = (side: string) => {
        if (side === 'BUY') {
            return <Badge variant="success" className="bg-green-500">COMPRA</Badge>
        } else if (side === 'SELL') {
            return <Badge variant="destructive">VENDA</Badge>
        }
        return <Badge variant="secondary">{side}</Badge>
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

    if (!job) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <EmptyState
                    icon={AlertCircle}
                    title="Job não encontrado"
                    description="O job que você está procurando não existe ou foi removido."
                />
                <Button onClick={() => router.push('/jobs')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Jobs
                </Button>
            </div>
        )
    }

    // Definir etapas do fluxo
    const flowSteps = [
        {
            id: 'webhook',
            title: 'Webhook Recebido',
            icon: Zap,
            data: job.webhook_event,
            link: job.webhook_event ? `/webhooks/events/${job.webhook_event.id}` : null,
            status: job.webhook_event ? 'success' : 'skipped',
        },
        {
            id: 'job',
            title: 'Job Criado',
            icon: Activity,
            data: job,
            link: null,
            status: job.status === 'FILLED' ? 'success' : job.status === 'FAILED' ? 'error' : 'pending',
        },
        {
            id: 'executions',
            title: 'Execuções',
            icon: PlayCircle,
            data: job.executions,
            link: null,
            status: job.executions && job.executions.length > 0 ? 'success' : 'pending',
        },
        {
            id: 'position',
            title: 'Posição',
            icon: Database,
            data: job.position_open,
            link: job.position_open ? `/positions/${job.position_open.id}` : null,
            status: job.position_open ? 'success' : 'skipped',
        },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">Job #{job.id}</h1>
                        <p className="text-muted-foreground mt-1">
                            {job.exchange_account?.label || 'Conta desconhecida'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                    {getStatusBadge(job.status)}
                </div>
            </div>

            {/* Informações Principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Operação</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {getSideBadge(job.side)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Símbolo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold font-mono">{job.symbol}</div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Modo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge variant={job.trade_mode === 'REAL' ? 'destructive' : 'secondary'} className="text-lg px-3 py-1">
                            {job.trade_mode}
                        </Badge>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Execuções</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {job.executions?.length || 0}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Visualização de Fluxo */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Fluxo de Execução</CardTitle>
                    <CardDescription>Visualização completa desde o webhook até a operação final</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto pb-8">
                        <div className="flex items-center gap-4 min-w-max px-4">
                            {flowSteps.map((step, index) => {
                                const Icon = step.icon
                                const isLast = index === flowSteps.length - 1
                                const stepData = step.data
                                const hasData = stepData !== null && stepData !== undefined

                                return (
                                    <div key={step.id} className="flex items-center gap-4">
                                        {/* Nó do Fluxo */}
                                        <div className="flex-shrink-0">
                                            <div
                                                className={`
                                                    relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 min-w-[200px]
                                                    ${
                                                        step.status === 'success'
                                                            ? 'border-green-500 bg-green-500/10'
                                                            : step.status === 'error'
                                                            ? 'border-red-500 bg-red-500/10'
                                                            : step.status === 'skipped'
                                                            ? 'border-gray-300 bg-gray-100/50 opacity-50'
                                                            : 'border-blue-500 bg-blue-500/10'
                                                    }
                                                `}
                                            >
                                                <div
                                                    className={`
                                                        p-3 rounded-full
                                                        ${
                                                            step.status === 'success'
                                                                ? 'bg-green-500 text-white'
                                                                : step.status === 'error'
                                                                ? 'bg-red-500 text-white'
                                                                : step.status === 'skipped'
                                                                ? 'bg-gray-300 text-gray-600'
                                                                : 'bg-blue-500 text-white'
                                                        }
                                                    `}
                                                >
                                                    <Icon className="h-6 w-6" />
                                                </div>
                                                <div className="text-center">
                                                    <h3 className="font-semibold text-sm">{step.title}</h3>
                                                    {step.id === 'webhook' && job.webhook_event && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {job.webhook_event.webhook_source?.label}
                                                        </p>
                                                    )}
                                                    {step.id === 'job' && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {job.order_type} • {job.symbol}
                                                        </p>
                                                    )}
                                                    {step.id === 'executions' && job.executions && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {job.executions.length} execução(ões)
                                                        </p>
                                                    )}
                                                    {step.id === 'position' && job.position_open && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {job.position_open.status}
                                                        </p>
                                                    )}
                                                </div>
                                                {step.link && (
                                                    <Link href={step.link}>
                                                        <Button variant="ghost" size="sm" className="mt-2">
                                                            <ExternalLink className="h-3 w-3 mr-1" />
                                                            Ver Detalhes
                                                        </Button>
                                                    </Link>
                                                )}
                                            </div>
                                        </div>

                                        {/* Seta de Conexão */}
                                        {!isLast && (
                                            <div className="flex-shrink-0 flex items-center">
                                                <ArrowRight className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Detalhes do Job */}
            <Tabs defaultValue="details" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="executions">
                        Execuções ({job.executions?.length || 0})
                    </TabsTrigger>
                    {job.webhook_event && (
                        <TabsTrigger value="webhook">Webhook Event</TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="details">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Detalhes do Job</CardTitle>
                            <CardDescription>Informações completas sobre o job de trading</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">ID do Job</label>
                                    <div className="mt-1 font-mono text-sm">#{job.id}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                                    <div className="mt-1">{getStatusBadge(job.status)}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Símbolo</label>
                                    <div className="mt-1 font-mono text-sm">{job.symbol}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Operação</label>
                                    <div className="mt-1">{getSideBadge(job.side)}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Tipo de Ordem</label>
                                    <div className="mt-1">
                                        <Badge variant="outline">{job.order_type}</Badge>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Modo</label>
                                    <div className="mt-1">
                                        <Badge variant={job.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                                            {job.trade_mode}
                                        </Badge>
                                    </div>
                                </div>

                                {job.quote_amount && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Quantidade (Quote)</label>
                                        <div className="mt-1 font-mono text-sm">${Number(job.quote_amount).toFixed(2)}</div>
                                    </div>
                                )}

                                {job.base_quantity && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Quantidade (Base)</label>
                                        <div className="mt-1 font-mono text-sm">{Number(job.base_quantity).toFixed(8)}</div>
                                    </div>
                                )}

                                {job.limit_price && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Preço Limite</label>
                                        <div className="mt-1 font-mono text-sm">${Number(job.limit_price).toFixed(2)}</div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Conta de Exchange</label>
                                    <div className="mt-1">
                                        {job.exchange_account ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{job.exchange_account.label}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    {job.exchange_account.exchange}
                                                </Badge>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">N/A</span>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Criado em</label>
                                    <div className="mt-1 text-sm">{formatDateTime(job.created_at)}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Atualizado em</label>
                                    <div className="mt-1 text-sm">{formatDateTime(job.updated_at)}</div>
                                </div>
                            </div>

                            {job.reason_message && (
                                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                                        <div className="flex-1">
                                            <label className="text-sm font-medium text-destructive">Mensagem de Erro</label>
                                            <p className="text-sm text-destructive mt-1">{job.reason_message}</p>
                                            {job.reason_code && (
                                                <p className="text-xs text-muted-foreground mt-1">Código: {job.reason_code}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {job.position_open && (
                                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <label className="text-sm font-medium">Posição Aberta</label>
                                            <div className="mt-2 space-y-1 text-sm">
                                                <div>Quantidade Total: <span className="font-mono">{Number(job.position_open.qty_total).toFixed(8)}</span></div>
                                                <div>Quantidade Restante: <span className="font-mono">{Number(job.position_open.qty_remaining).toFixed(8)}</span></div>
                                                <div>Preço de Abertura: <span className="font-mono">${Number(job.position_open.price_open).toFixed(2)}</span></div>
                                                <div>Status: <Badge variant="outline">{job.position_open.status}</Badge></div>
                                            </div>
                                        </div>
                                        <Link href={`/positions/${job.position_open.id}`}>
                                            <Button variant="outline" size="sm">
                                                <ExternalLink className="h-4 w-4 mr-2" />
                                                Ver Posição
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="executions">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Execuções</CardTitle>
                            <CardDescription>
                                {job.executions?.length || 0} execução(ões) relacionada(s) a este job
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {job.executions && job.executions.length > 0 ? (
                                <div className="space-y-4">
                                    {job.executions.map((execution) => (
                                        <div
                                            key={execution.id}
                                            className="p-4 bg-muted rounded-lg border"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <div className="font-medium">Execução #{execution.id}</div>
                                                    <div className="text-sm text-muted-foreground mt-1">
                                                        {formatDateTime(execution.created_at)}
                                                    </div>
                                                </div>
                                                <Badge variant={execution.status_exchange === 'FILLED' ? 'success' : 'secondary'}>
                                                    {execution.status_exchange}
                                                </Badge>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Quantidade Executada</label>
                                                    <div className="font-mono text-sm mt-1">{Number(execution.executed_qty).toFixed(8)}</div>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Valor Total</label>
                                                    <div className="font-mono text-sm mt-1">${Number(execution.cumm_quote_qty).toFixed(2)}</div>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Preço Médio</label>
                                                    <div className="font-mono text-sm mt-1">${Number(execution.avg_price).toFixed(2)}</div>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-muted-foreground">Order ID</label>
                                                    <div className="font-mono text-xs mt-1 truncate">
                                                        {execution.exchange_order_id || execution.client_order_id}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon={Activity}
                                    title="Nenhuma execução"
                                    description="Ainda não há execuções para este job."
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {job.webhook_event && (
                    <TabsContent value="webhook">
                        <Card className="glass">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Webhook Event</CardTitle>
                                        <CardDescription>Evento que originou este job</CardDescription>
                                    </div>
                                    <Link href={`/webhooks/events/${job.webhook_event.id}`}>
                                        <Button variant="outline" size="sm">
                                            <ExternalLink className="h-4 w-4 mr-2" />
                                            Ver Evento Completo
                                        </Button>
                                    </Link>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Event UID</label>
                                        <div className="mt-1 flex items-center gap-2">
                                            <code className="text-sm bg-muted px-2 py-1 rounded flex-1 font-mono">
                                                {job.webhook_event.event_uid}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(job.webhook_event!.event_uid, 'Event UID')}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Webhook Source</label>
                                        <div className="mt-1">
                                            {job.webhook_event.webhook_source ? (
                                                <Link 
                                                    href={`/webhooks/${job.webhook_event.webhook_source.id}`}
                                                    className="text-sm font-medium hover:underline flex items-center gap-1"
                                                >
                                                    {job.webhook_event.webhook_source.label}
                                                    <ExternalLink className="h-3 w-3" />
                                                </Link>
                                            ) : (
                                                <span className="text-sm">N/A</span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Ação</label>
                                        <div className="mt-1">
                                            {job.webhook_event.action === 'BUY_SIGNAL' ? (
                                                <Badge variant="success" className="bg-green-500">COMPRA</Badge>
                                            ) : job.webhook_event.action === 'SELL_SIGNAL' ? (
                                                <Badge variant="destructive">VENDA</Badge>
                                            ) : (
                                                <Badge variant="secondary">{job.webhook_event.action}</Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Símbolo</label>
                                        <div className="mt-1 font-mono text-sm">
                                            {job.webhook_event.symbol_normalized || job.webhook_event.symbol_raw}
                                        </div>
                                    </div>
                                </div>

                                {job.webhook_event.raw_text && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Payload Raw</label>
                                        <pre className="mt-1 bg-muted p-3 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap">
                                            {job.webhook_event.raw_text}
                                        </pre>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
}

