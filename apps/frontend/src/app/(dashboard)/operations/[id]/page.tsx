'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { operationsService, type OperationDetail } from '@/lib/api/operations.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    ArrowLeft,
    CheckCircle,
    XCircle,
    Clock,
    Activity,
    TrendingUp,
    TrendingDown,
    Package,
    DollarSign,
    Calendar,
    ExternalLink,
    Copy,
    Webhook,
    History,
} from 'lucide-react'
import { formatCurrency, formatDateTime, formatAssetAmount, formatPercentage } from '@/lib/utils/format'
import { toast } from 'sonner'
import Link from 'next/link'

export default function OperationDetailPage() {
    const params = useParams()
    const router = useRouter()
    const operationId = parseInt(params.id as string)

    const { data: operation, isLoading, refetch } = useQuery<OperationDetail>({
        queryKey: ['operation', operationId],
        queryFn: () => operationsService.getById(operationId),
        enabled: !isNaN(operationId),
        refetchInterval: 30000, // Atualizar a cada 30 segundos
    })

    const getStatusBadge = (status: string) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'success'> = {
            PENDING: 'secondary',
            PENDING_LIMIT: 'secondary',
            EXECUTING: 'default',
            FILLED: 'success',
            FAILED: 'destructive',
            CANCELLED: 'destructive',
        }

        const icons: Record<string, any> = {
            PENDING: Clock,
            PENDING_LIMIT: Clock,
            EXECUTING: Activity,
            FILLED: CheckCircle,
            FAILED: XCircle,
            CANCELLED: XCircle,
        }

        const Icon = icons[status] || Clock

        return (
            <Badge variant={variants[status] || 'secondary'} className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {status}
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
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
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

    const { job, executions, position, positions_closed, sell_jobs, webhook_event, timeline } = operation

    // Debug: verificar se positions_closed está chegando
    if (job.side === 'SELL') {
        console.log('[OperationDetail] Job SELL - positions_closed:', positions_closed)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push('/operations')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">
                            Operação #{job.id}
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {job.symbol} • {getSideBadge(job.side)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {getStatusBadge(job.status)}
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <Activity className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Resumo */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tipo de Ordem</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{job.order_type}</div>
                        {job.limit_price && (
                            <p className="text-xs text-muted-foreground">
                                Limite: {formatCurrency(job.limit_price)}
                            </p>
                    )}
                </CardContent>
            </Card>

                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Quantidade</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {job.base_quantity ? (
                            <div className="text-2xl font-bold">
                                {formatAssetAmount(job.base_quantity, job.symbol.split('/')[0])}
                            </div>
                        ) : job.quote_amount ? (
                            <div className="text-2xl font-bold">
                                {formatCurrency(job.quote_amount)}
                            </div>
                        ) : (
                            <div className="text-2xl font-bold">-</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Execuções</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{executions.length}</div>
                        {executions.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Total: {formatAssetAmount(
                                    executions.reduce((sum, e) => sum + e.executed_qty, 0),
                                    job.symbol.split('/')[0]
                                )}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Posição</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {job.side === 'BUY' && position ? (
                            <>
                                <div className="text-2xl font-bold">
                                    <Badge variant={position.status === 'OPEN' ? 'success' : 'secondary'}>
                                        {position.status}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {formatAssetAmount(position.qty_remaining, job.symbol.split('/')[0])} restante
                                </p>
                            </>
                        ) : job.side === 'SELL' && positions_closed && positions_closed.length > 0 ? (
                            <>
                                <div className="text-2xl font-bold">
                                    <Badge variant="secondary">
                                        {positions_closed.length} posição(ões) fechada(s)
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {positions_closed.map((p: any) => `#${p.id}`).join(', ')}
                                </p>
                            </>
                        ) : (
                            <div className="text-2xl font-bold text-muted-foreground">-</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="details" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="executions">
                        Execuções ({executions.length})
                    </TabsTrigger>
                    {(position || (positions_closed && positions_closed.length > 0)) && (
                        <TabsTrigger value="position">
                            {job.side === 'BUY' ? 'Posição' : 'Posições Fechadas'}
                        </TabsTrigger>
                    )}
                    {sell_jobs && sell_jobs.length > 0 && (
                        <TabsTrigger value="sell-jobs">
                            Jobs de Venda ({sell_jobs.length})
                        </TabsTrigger>
                    )}
                    {webhook_event && (
                        <TabsTrigger value="webhook">Webhook Event</TabsTrigger>
                    )}
                    {timeline && timeline.length > 0 && (
                        <TabsTrigger value="timeline">
                            Timeline ({timeline.length})
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* Detalhes */}
                <TabsContent value="details">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Detalhes do Job</CardTitle>
                            <CardDescription>Informações completas sobre o job de trading</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">ID</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="font-mono">#{job.id}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(String(job.id), 'ID')}
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                                    <div className="mt-1">{getStatusBadge(job.status)}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Símbolo</label>
                                    <div className="mt-1 font-mono">{job.symbol}</div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Lado</label>
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

                                {job.base_quantity && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Quantidade Base</label>
                                        <div className="mt-1 font-mono">
                                            {formatAssetAmount(job.base_quantity, job.symbol.split('/')[0])}
                                        </div>
                                    </div>
                                )}

                                {job.quote_amount && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Valor em Quote</label>
                                        <div className="mt-1 font-mono">{formatCurrency(job.quote_amount)}</div>
                                    </div>
                                )}

                                {job.limit_price && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Preço Limite</label>
                                        <div className="mt-1 font-mono">{formatCurrency(job.limit_price)}</div>
                                    </div>
                                )}

                                {job.exchange_account && (
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Conta de Exchange</label>
                                        <div className="mt-1">
                                            <Link
                                                href={`/exchange-accounts/${job.exchange_account.id}`}
                                                className="text-primary hover:underline"
                                            >
                                                {job.exchange_account.label || `Conta #${job.exchange_account.id}`}
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Criado em</label>
                                    <div className="mt-1 flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span>{formatDateTime(job.created_at)}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">Atualizado em</label>
                                    <div className="mt-1 flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span>{formatDateTime(job.updated_at)}</span>
                                    </div>
                                </div>

                                {job.reason_code && (
                                    <div className="md:col-span-2">
                                        <label className="text-sm font-medium text-muted-foreground">Motivo</label>
                                        <div className="mt-1">
                                            <Badge variant="outline">{job.reason_code}</Badge>
                                            {job.reason_message && (
                                                <p className="text-sm text-muted-foreground mt-1">{job.reason_message}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Execuções */}
                <TabsContent value="executions">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Execuções</CardTitle>
                            <CardDescription>Histórico de execuções na exchange</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {executions.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-muted-foreground">Nenhuma execução encontrada</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {executions.map((exec, index) => (
                                        <Card key={exec.id} className="bg-muted/50">
                                            <CardContent className="pt-6">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">Execução #{index + 1}</Badge>
                                                        <Badge variant={exec.status_exchange === 'FILLED' ? 'success' : 'secondary'}>
                                                            {exec.status_exchange}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatDateTime(exec.created_at)}
                                                    </span>
                                                </div>
                                                <div className="grid gap-4 md:grid-cols-3">
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Quantidade Executada</label>
                                                        <div className="mt-1 font-mono">
                                                            {formatAssetAmount(exec.executed_qty, job.symbol.split('/')[0])}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Preço Médio</label>
                                                        <div className="mt-1 font-mono">{formatCurrency(exec.avg_price)}</div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Valor Total</label>
                                                        <div className="mt-1 font-mono">{formatCurrency(exec.cumm_quote_qty)}</div>
                                                    </div>
                                                    {exec.exchange_order_id && (
                                                        <div>
                                                            <label className="text-sm font-medium text-muted-foreground">ID da Ordem</label>
                                                            <div className="mt-1 flex items-center gap-2">
                                                                <span className="font-mono text-xs">{exec.exchange_order_id}</span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => copyToClipboard(exec.exchange_order_id!, 'ID da Ordem')}
                                                                >
                                                                    <Copy className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Posição */}
                {(position || (positions_closed && positions_closed.length > 0)) && (
                    <TabsContent value="position">
                        {job.side === 'BUY' && position ? (
                            <Card className="glass">
                                <CardHeader>
                                    <CardTitle>Posição Relacionada</CardTitle>
                                    <CardDescription>Informações da posição aberta/fechada</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">ID da Posição</label>
                                            <div className="mt-1">
                                                <Link
                                                    href={`/positions/${position.id}`}
                                                    className="text-primary hover:underline font-mono"
                                                >
                                                    #{position.id}
                                                </Link>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Status</label>
                                            <div className="mt-1">
                                                <Badge variant={position.status === 'OPEN' ? 'success' : 'secondary'}>
                                                    {position.status}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Quantidade Total</label>
                                            <div className="mt-1 font-mono">
                                                {formatAssetAmount(position.qty_total, job.symbol.split('/')[0])}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Quantidade Restante</label>
                                            <div className="mt-1 font-mono">
                                                {formatAssetAmount(position.qty_remaining, job.symbol.split('/')[0])}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Preço de Abertura</label>
                                            <div className="mt-1 font-mono">{formatCurrency(position.price_open)}</div>
                                        </div>
                                    </div>

                                    {position.fills && position.fills.length > 0 && (
                                        <>
                                            <Separator />
                                            <div>
                                                <label className="text-sm font-medium text-muted-foreground mb-2 block">Fills</label>
                                                <div className="space-y-2">
                                                    {position.fills.map((fill) => (
                                                        <div key={fill.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant={fill.side === 'BUY' ? 'success' : 'destructive'}>
                                                                    {fill.side}
                                                                </Badge>
                                                                <span className="text-sm">
                                                                    {formatAssetAmount(fill.qty, job.symbol.split('/')[0])} @ {formatCurrency(fill.price)}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatDateTime(fill.created_at)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        ) : job.side === 'SELL' && positions_closed && positions_closed.length > 0 ? (
                            <Card className="glass">
                                <CardHeader>
                                    <CardTitle>Posições Fechadas</CardTitle>
                                    <CardDescription>
                                        Posições que foram fechadas (parcialmente ou totalmente) por este job de venda
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {positions_closed.map((pos: any) => (
                                        <Card key={pos.id} className="bg-muted/50">
                                            <CardContent className="pt-6">
                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">ID da Posição</label>
                                                        <div className="mt-1">
                                                            <Link
                                                                href={`/positions/${pos.id}`}
                                                                className="text-primary hover:underline font-mono"
                                                            >
                                                                #{pos.id}
                                                            </Link>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Status</label>
                                                        <div className="mt-1">
                                                            <Badge variant={pos.status === 'CLOSED' ? 'secondary' : 'success'}>
                                                                {pos.status}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Quantidade Total</label>
                                                        <div className="mt-1 font-mono">
                                                            {formatAssetAmount(pos.qty_total, job.symbol.split('/')[0])}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Quantidade Restante</label>
                                                        <div className="mt-1 font-mono">
                                                            {formatAssetAmount(pos.qty_remaining, job.symbol.split('/')[0])}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium text-muted-foreground">Preço de Abertura</label>
                                                        <div className="mt-1 font-mono">{formatCurrency(pos.price_open)}</div>
                                                    </div>
                                                    {pos.close_reason && (
                                                        <div>
                                                            <label className="text-sm font-medium text-muted-foreground">Motivo do Fechamento</label>
                                                            <div className="mt-1">
                                                                <Badge variant="outline">{pos.close_reason}</Badge>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </CardContent>
                            </Card>
                        ) : null}
                    </TabsContent>
                )}

                {/* Jobs de Venda */}
                {sell_jobs && sell_jobs.length > 0 && (
                    <TabsContent value="sell-jobs">
                        <Card className="glass">
                    <CardHeader>
                                <CardTitle>Jobs de Venda Relacionados</CardTitle>
                                <CardDescription>Jobs de venda que fecharam esta posição</CardDescription>
                    </CardHeader>
                    <CardContent>
                                <div className="space-y-4">
                                    {sell_jobs.map((sellJob) => (
                                        <Card key={sellJob.id} className="bg-muted/50">
                                            <CardContent className="pt-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Link
                                                            href={`/operations/${sellJob.id}`}
                                                            className="text-primary hover:underline font-mono"
                                                        >
                                                            Job #{sellJob.id}
                                                        </Link>
                                                        <Badge variant="destructive">SELL</Badge>
                                                        <Badge variant="outline">{sellJob.order_type}</Badge>
                                                        {getStatusBadge(sellJob.status)}
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatDateTime(sellJob.created_at)}
                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Webhook Event */}
                {webhook_event && (
                    <TabsContent value="webhook">
                        <Card className="glass">
                            <CardHeader>
                                <CardTitle>Webhook Event</CardTitle>
                                <CardDescription>Evento de webhook que originou este job</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">ID do Evento</label>
                                        <div className="mt-1 font-mono">#{webhook_event.id}</div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Event UID</label>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="font-mono text-xs">{webhook_event.event_uid}</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(webhook_event.event_uid, 'Event UID')}
                                            >
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Ação</label>
                                        <div className="mt-1">
                                            <Badge variant="outline">{webhook_event.action}</Badge>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Símbolo</label>
                                        <div className="mt-1 font-mono">{webhook_event.symbol_normalized}</div>
                                    </div>
                                    {webhook_event.price_reference && (
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Preço de Referência</label>
                                            <div className="mt-1 font-mono">{formatCurrency(webhook_event.price_reference)}</div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Criado em</label>
                                        <div className="mt-1 flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <span>{formatDateTime(webhook_event.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {/* Timeline */}
                {timeline && timeline.length > 0 && (
                    <TabsContent value="timeline">
                        <Card className="glass">
                            <CardHeader>
                                <CardTitle>Timeline de Eventos</CardTitle>
                                <CardDescription>Histórico completo de eventos da operação</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {timeline.map((event, index) => (
                                        <div key={index} className="flex gap-4">
                                            <div className="flex flex-col items-center">
                                                <div className="w-2 h-2 rounded-full bg-primary" />
                                                {index < timeline.length - 1 && (
                                                    <div className="w-0.5 h-full bg-border min-h-[60px]" />
                                                )}
                                            </div>
                                            <div className="flex-1 pb-4">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <History className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-medium">{event.type}</span>
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">
                                                        {formatDateTime(event.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                                                {event.data && Object.keys(event.data).length > 0 && (
                                                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                                        <pre className="whitespace-pre-wrap">
                                                            {JSON.stringify(event.data, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                    </TabsContent>
            )}
            </Tabs>
        </div>
    )
}
