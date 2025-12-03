'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { jobsService } from '@/lib/api/jobs.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import {
    ArrowLeft,
    Lock,
    Unlock,
    TrendingUp,
    TrendingDown,
    Settings,
    DollarSign,
    Package,
    Target,
    AlertTriangle,
    Activity,
    Link as LinkIcon,
    Calendar,
    RefreshCw,
    Loader2,
} from 'lucide-react'
import { formatCurrency, formatDateTime, formatAssetAmount, formatPercentage } from '@/lib/utils/format'
import { toast } from 'sonner'
import { useState } from 'react'
import { UpdateSLTPModal } from '@/components/positions/UpdateSLTPModal'
import { ClosePositionModal } from '@/components/positions/ClosePositionModal'
import { SellLimitModal } from '@/components/positions/SellLimitModal'
import type { Position, PositionFill, TradeJob, TradeExecution } from '@/lib/types'

// Estender o tipo Position para incluir dados relacionados que podem vir da API
interface PositionWithRelations extends Position {
    exchange_account?: {
        id: number
        label: string
        exchange: string
        is_simulation: boolean
    }
    fills?: PositionFill[]
    open_job?: TradeJob
    sell_jobs?: TradeJob[]
}

export default function PositionDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const positionId = parseInt(params.id as string)

    const [showUpdateSLTPModal, setShowUpdateSLTPModal] = useState(false)
    const [showCloseModal, setShowCloseModal] = useState(false)
    const [showSellLimitModal, setShowSellLimitModal] = useState(false)

    const { data: position, isLoading, refetch } = useQuery<PositionWithRelations>({
        queryKey: ['position', positionId],
        queryFn: () => positionsService.getOne(positionId),
        enabled: !isNaN(positionId),
        refetchInterval: 30000, // Atualizar a cada 30 segundos
    })

    // Buscar trade job de abertura
    const { data: openJob } = useQuery({
        queryKey: ['trade-job', position?.trade_job_id_open],
        queryFn: () => jobsService.getJob(position!.trade_job_id_open),
        enabled: !!position?.trade_job_id_open,
    })

    // Mutation para lock/unlock webhook
    const lockMutation = useMutation({
        mutationFn: (lock: boolean) => positionsService.lockSellByWebhook(positionId, lock),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['position', positionId] })
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success(position?.lock_sell_by_webhook ? 'Webhook desbloqueado!' : 'Webhook bloqueado!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao atualizar bloqueio de webhook')
        },
    })

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

    if (!position) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Posição não encontrada</h2>
                <Button onClick={() => router.push('/positions')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Posições
                </Button>
            </div>
        )
    }

    // Calcular métricas
    const qtyClosed = Number(position.qty_total || 0) - Number(position.qty_remaining || 0)
    const qtyClosedPct = Number(position.qty_total || 0) > 0 ? (qtyClosed / Number(position.qty_total || 0)) * 100 : 0

    // Calcular preços de SL/TP
    const priceOpen = Number(position.price_open || 0)
    const slPrice = position.sl_enabled && position.sl_pct
        ? priceOpen * (1 - Number(position.sl_pct || 0) / 100)
        : null
    const tpPrice = position.tp_enabled && position.tp_pct
        ? priceOpen * (1 + Number(position.tp_pct || 0) / 100)
        : null

    // Colunas para tabela de fills
    const fillsColumns: Column<PositionFill>[] = [
        {
            key: 'side',
            label: 'Lado',
            render: (fill) => (
                <Badge variant={fill.side === 'BUY' ? 'default' : 'destructive'}>
                    {fill.side}
                </Badge>
            ),
        },
        {
            key: 'qty',
            label: 'Quantidade',
            render: (fill) => <span className="font-mono">{formatAssetAmount(fill.qty)}</span>,
        },
        {
            key: 'price',
            label: 'Preço',
            render: (fill) => formatCurrency(fill.price),
        },
        {
            key: 'created_at',
            label: 'Data',
            render: (fill) => formatDateTime(fill.created_at),
        },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/positions')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{position.symbol}</h1>
                        <p className="text-muted-foreground">
                            {position.exchange_account?.label || `Conta #${position.exchange_account_id}`} •{' '}
                            {position.trade_mode} • Posição #{position.id}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Atualizar
                    </Button>
                    <Badge variant={position.status === 'OPEN' ? 'default' : 'secondary'}>
                        {position.status === 'OPEN' ? 'ABERTA' : 'FECHADA'}
                    </Badge>
                    <Badge variant={position.side === 'LONG' ? 'default' : 'destructive'}>
                        {position.side === 'LONG' ? 'COMPRA' : position.side}
                    </Badge>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            PnL Realizado
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            {Number(position.realized_profit_usd || 0) >= 0 ? (
                                <TrendingUp className="h-5 w-5 text-green-500" />
                            ) : (
                                <TrendingDown className="h-5 w-5 text-red-500" />
                            )}
                            <span
                                className={`text-2xl font-bold ${
                                    Number(position.realized_profit_usd || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                                }`}
                            >
                                {formatCurrency(Number(position.realized_profit_usd || 0))}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            {qtyClosed > 0 ? `${formatAssetAmount(qtyClosed)} (${qtyClosedPct.toFixed(1)}%) fechado` : 'Nenhuma venda realizada'}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            PnL Não Realizado
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {position.unrealized_pnl !== null && position.unrealized_pnl !== undefined ? (
                            <>
                                <div className="flex items-center gap-2">
                                    {position.unrealized_pnl >= 0 ? (
                                        <TrendingUp className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <TrendingDown className="h-5 w-5 text-red-500" />
                                    )}
                                    <span
                                        className={`text-2xl font-bold ${
                                            position.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500'
                                        }`}
                                    >
                                        {formatCurrency(position.unrealized_pnl)}
                                    </span>
                                </div>
                                {position.unrealized_pnl_pct !== null && position.unrealized_pnl_pct !== undefined && (
                                    <p className={`text-sm mt-1 ${position.unrealized_pnl_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {position.unrealized_pnl_pct >= 0 ? '+' : ''}{position.unrealized_pnl_pct.toFixed(2)}%
                                    </p>
                                )}
                                {position.current_price && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Preço atual: {formatCurrency(position.current_price)}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">Carregando...</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Valor Comprado
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {position.invested_value_usd ? formatCurrency(position.invested_value_usd) : '-'}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            {position.current_value_usd ? (
                                <>
                                    Valor atual: {formatCurrency(position.current_value_usd)}
                                </>
                            ) : (
                                'Total investido na posição'
                            )}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Quantidade
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatAssetAmount(Number(position.qty_total || 0))}</div>
                        <p className="text-sm text-muted-foreground">
                            {formatAssetAmount(Number(position.qty_remaining || 0))} restante
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Preço médio: {formatCurrency(Number(position.price_open || 0))}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Stop Loss
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {position.sl_enabled && position.sl_pct ? (
                            <>
                                <div className="text-2xl font-bold">
                                    {slPrice ? formatCurrency(slPrice) : 'N/A'}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {formatPercentage(-position.sl_pct)}
                                </p>
                                {position.sl_triggered && (
                                    <Badge variant="destructive" className="mt-2">
                                        Triggered
                                    </Badge>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground">Não configurado</span>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Take Profit
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {position.tp_enabled && position.tp_pct ? (
                            <>
                                <div className="text-2xl font-bold">
                                    {tpPrice ? formatCurrency(tpPrice) : 'N/A'}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {formatPercentage(position.tp_pct)}
                                </p>
                                {position.tp_triggered && (
                                    <Badge variant="default" className="mt-2 bg-green-500">
                                        Triggered
                                    </Badge>
                                )}
                                {position.partial_tp_triggered && (
                                    <Badge variant="outline" className="mt-2">
                                        Partial TP
                                    </Badge>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground">Não configurado</span>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Lucro Mínimo
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {position.min_profit_pct !== null && position.min_profit_pct !== undefined ? (
                            <>
                                <div className="text-2xl font-bold text-blue-500">
                                    {formatPercentage(Number(position.min_profit_pct))}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Preço mínimo de venda: {formatCurrency(
                                        Number(position.price_open || 0) * (1 + Number(position.min_profit_pct) / 100)
                                    )}
                                </p>
                                {position.current_price && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Preço atual: {formatCurrency(position.current_price)}
                                        {(() => {
                                            const minProfitPctNum = Number(position.min_profit_pct);
                                            const priceOpenNum = Number(position.price_open || 0);
                                            const currentPriceNum = Number(position.current_price);
                                            const minSellPrice = priceOpenNum * (1 + minProfitPctNum / 100);
                                            const profitPct = ((currentPriceNum - priceOpenNum) / priceOpenNum) * 100;
                                            const meetsMinProfit = profitPct >= minProfitPctNum;
                                            return (
                                                <span className={`ml-2 ${meetsMinProfit ? 'text-green-500' : 'text-orange-500'}`}>
                                                    ({meetsMinProfit ? '✓' : '✗'} {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                                                </span>
                                            );
                                        })()}
                                    </p>
                                )}
                            </>
                        ) : (
                            <span className="text-muted-foreground">Não configurado</span>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="overview">
                        <Settings className="h-4 w-4 mr-2" />
                        Visão Geral
                    </TabsTrigger>
                    <TabsTrigger value="fills">
                        <Activity className="h-4 w-4 mr-2" />
                        Fills ({position.fills?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="job">
                        <LinkIcon className="h-4 w-4 mr-2" />
                        Trade Job
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    {/* Actions */}
                    {position.status === 'OPEN' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Ações</CardTitle>
                                <CardDescription>Gerencie sua posição</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                <Button onClick={() => setShowUpdateSLTPModal(true)}>
                                    <Settings className="h-4 w-4 mr-2" />
                                    Atualizar SL/TP
                                </Button>
                                <Button variant="destructive" onClick={() => setShowCloseModal(true)}>
                                    Fechar Posição
                                </Button>
                                <Button variant="outline" onClick={() => setShowSellLimitModal(true)}>
                                    Ordem Limite
                                </Button>
                                {position.lock_sell_by_webhook ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => lockMutation.mutate(false)}
                                        disabled={lockMutation.isPending}
                                    >
                                        <Unlock className="h-4 w-4 mr-2" />
                                        Desbloquear Webhook
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        onClick={() => lockMutation.mutate(true)}
                                        disabled={lockMutation.isPending}
                                    >
                                        <Lock className="h-4 w-4 mr-2" />
                                        Bloquear Webhook
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Position Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Informações da Posição</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <p className="text-sm text-muted-foreground">ID da Posição</p>
                                    <p className="font-mono font-medium">#{position.id}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Status</p>
                                    <Badge variant={position.status === 'OPEN' ? 'default' : 'secondary'}>
                                        {position.status}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Símbolo</p>
                                    <p className="font-medium">{position.symbol}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Lado</p>
                                    <Badge variant={position.side === 'LONG' ? 'default' : 'destructive'}>
                                        {position.side}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Modo de Trade</p>
                                    <Badge variant={position.trade_mode === 'REAL' ? 'default' : 'secondary'}>
                                        {position.trade_mode}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Conta de Exchange</p>
                                    <p className="font-medium">
                                        {position.exchange_account?.label || `Conta #${position.exchange_account_id}`}
                                    </p>
                                    {position.exchange_account?.exchange && (
                                        <p className="text-xs text-muted-foreground">
                                            {position.exchange_account.exchange}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Quantidade Total</p>
                                    <p className="font-medium">{formatAssetAmount(Number(position.qty_total || 0))}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Quantidade Restante</p>
                                    <p className="font-medium">{formatAssetAmount(Number(position.qty_remaining || 0))}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Preço de Abertura</p>
                                    <p className="font-medium">{formatCurrency(Number(position.price_open || 0))}</p>
                                </div>
                                {position.status === 'CLOSED' && position.price_close ? (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Preço de Venda</p>
                                        <p className="font-medium">{formatCurrency(position.price_close)}</p>
                                    </div>
                                ) : position.current_price ? (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Preço Atual</p>
                                        <p className="font-medium">{formatCurrency(position.current_price)}</p>
                                    </div>
                                ) : null}
                                {position.invested_value_usd && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Valor Comprado</p>
                                        <p className="font-medium">{formatCurrency(position.invested_value_usd)}</p>
                                    </div>
                                )}
                                {position.current_value_usd && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Valor Atual</p>
                                        <p className="font-medium">{formatCurrency(position.current_value_usd)}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm text-muted-foreground">PnL Realizado</p>
                                    <p
                                        className={`font-medium ${
                                            Number(position.realized_profit_usd || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                                        }`}
                                    >
                                        {formatCurrency(Number(position.realized_profit_usd || 0))}
                                    </p>
                                </div>
                                {position.unrealized_pnl !== null && position.unrealized_pnl !== undefined && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">PnL Não Realizado</p>
                                        <p
                                            className={`font-medium ${
                                                position.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500'
                                            }`}
                                        >
                                            {formatCurrency(position.unrealized_pnl)}
                                            {position.unrealized_pnl_pct !== null && position.unrealized_pnl_pct !== undefined && (
                                                <span className="ml-2 text-sm">
                                                    ({position.unrealized_pnl_pct >= 0 ? '+' : ''}{position.unrealized_pnl_pct.toFixed(2)}%)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm text-muted-foreground">Criada em</p>
                                    <p className="font-medium">{formatDateTime(position.created_at)}</p>
                                </div>
                                {position.closed_at && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Fechada em</p>
                                        <p className="font-medium">{formatDateTime(position.closed_at)}</p>
                                    </div>
                                )}
                                {position.close_reason && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Motivo do Fechamento</p>
                                        <p className="font-medium">{position.close_reason}</p>
                                    </div>
                                )}
                            </div>

                            <Separator />

                            {/* SL/TP Configuration */}
                            <div>
                                <h3 className="text-lg font-semibold mb-3">Configuração SL/TP</h3>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Stop Loss</p>
                                        {position.sl_enabled ? (
                                            <div>
                                                <p className="font-medium">
                                                    {slPrice ? formatCurrency(slPrice) : 'N/A'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {position.sl_pct ? formatPercentage(-position.sl_pct) : ''}
                                                </p>
                                                {position.sl_triggered && (
                                                    <Badge variant="destructive" className="mt-1">
                                                        Triggered
                                                    </Badge>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-muted-foreground">Desabilitado</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Take Profit</p>
                                        {position.tp_enabled ? (
                                            <div>
                                                <p className="font-medium">
                                                    {tpPrice ? formatCurrency(tpPrice) : 'N/A'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {position.tp_pct ? formatPercentage(position.tp_pct) : ''}
                                                </p>
                                                {position.tp_triggered && (
                                                    <Badge variant="default" className="mt-1 bg-green-500">
                                                        Triggered
                                                    </Badge>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-muted-foreground">Desabilitado</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Trailing Stop</p>
                                        {position.trailing_enabled ? (
                                            <div>
                                                <p className="font-medium">
                                                    {position.trailing_distance_pct
                                                        ? formatPercentage(position.trailing_distance_pct)
                                                        : 'N/A'}
                                                </p>
                                                {position.trailing_max_price && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Max: {formatCurrency(position.trailing_max_price)}
                                                    </p>
                                                )}
                                                {position.trailing_triggered && (
                                                    <Badge variant="outline" className="mt-1">
                                                        Triggered
                                                    </Badge>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-muted-foreground">Desabilitado</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Webhook Lock */}
                            <div>
                                <p className="text-sm text-muted-foreground">Bloqueio de Webhook</p>
                                <Badge variant={position.lock_sell_by_webhook ? 'destructive' : 'secondary'}>
                                    {position.lock_sell_by_webhook ? 'Bloqueado' : 'Desbloqueado'}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {position.lock_sell_by_webhook
                                        ? 'Esta posição não pode ser fechada automaticamente por webhooks'
                                        : 'Esta posição pode ser fechada automaticamente por webhooks'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Fills Tab */}
                <TabsContent value="fills">
                    <Card>
                        <CardHeader>
                            <CardTitle>Histórico de Fills</CardTitle>
                            <CardDescription>
                                Execuções de compra e venda associadas a esta posição
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {position.fills && position.fills.length > 0 ? (
                                <DataTable data={position.fills} columns={fillsColumns} />
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Nenhum fill registrado</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Trade Jobs Tab */}
                <TabsContent value="job">
                    <div className="space-y-4">
                        {/* Job de Abertura */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Trade Job de Abertura</CardTitle>
                                <CardDescription>
                                    Job que criou esta posição (ID: {position.trade_job_id_open})
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {openJob ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <p className="text-sm text-muted-foreground">ID do Job</p>
                                                <p className="font-mono font-medium">#{openJob.id}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Status</p>
                                                <Badge variant={openJob.status === 'FILLED' ? 'default' : 'secondary'}>
                                                    {openJob.status}
                                                </Badge>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Lado</p>
                                                <Badge variant={openJob.side === 'BUY' ? 'default' : 'destructive'}>
                                                    {openJob.side}
                                                </Badge>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Tipo de Ordem</p>
                                                <p className="font-medium">{openJob.order_type}</p>
                                            </div>
                                            {openJob.quote_amount && (
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Valor em Quote</p>
                                                    <p className="font-medium">{formatCurrency(openJob.quote_amount)}</p>
                                                </div>
                                            )}
                                            {openJob.base_quantity && (
                                                <div>
                                                    <p className="text-sm text-muted-foreground">Quantidade Base</p>
                                                    <p className="font-medium">{formatAssetAmount(openJob.base_quantity)}</p>
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-sm text-muted-foreground">Criado em</p>
                                                <p className="font-medium">{formatDateTime(openJob.created_at)}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={() => router.push(`/operations/${openJob.id}`)}
                                            >
                                                Ver Detalhes do Job
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <LinkIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Carregando informações do job...</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Jobs de Venda */}
                        {position.sell_jobs && position.sell_jobs.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Jobs de Venda</CardTitle>
                                    <CardDescription>
                                        Jobs que fecharam (parcialmente ou totalmente) esta posição ({position.sell_jobs.length})
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {position.sell_jobs.map((sellJob: any) => (
                                            <div key={sellJob.id} className="border rounded-lg p-4 space-y-3">
                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">ID do Job</p>
                                                        <p className="font-mono font-medium">#{sellJob.id}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Status</p>
                                                        <Badge variant={sellJob.status === 'FILLED' ? 'default' : 'secondary'}>
                                                            {sellJob.status}
                                                        </Badge>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Tipo de Ordem</p>
                                                        <p className="font-medium">{sellJob.order_type}</p>
                                                    </div>
                                                    {sellJob.limit_price && (
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Preço Limite</p>
                                                            <p className="font-medium">{formatCurrency(sellJob.limit_price)}</p>
                                                        </div>
                                                    )}
                                                    {sellJob.base_quantity && (
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Quantidade Base</p>
                                                            <p className="font-medium">{formatAssetAmount(sellJob.base_quantity)}</p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Criado em</p>
                                                        <p className="font-medium">{formatDateTime(sellJob.created_at)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => router.push(`/operations/${sellJob.id}`)}
                                                    >
                                                        Ver Detalhes do Job
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Modals */}
            {showUpdateSLTPModal && (
                <UpdateSLTPModal
                    position={position}
                    open={showUpdateSLTPModal}
                    onClose={() => setShowUpdateSLTPModal(false)}
                />
            )}
            {showCloseModal && (
                <ClosePositionModal
                    position={position}
                    open={showCloseModal}
                    onClose={() => setShowCloseModal(false)}
                />
            )}
            {showSellLimitModal && (
                <SellLimitModal
                    position={position}
                    open={showSellLimitModal}
                    onClose={() => setShowSellLimitModal(false)}
                />
            )}
        </div>
    )
}
