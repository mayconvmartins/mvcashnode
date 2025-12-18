'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Target, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Filter, Users, Zap } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { adminService } from '@/lib/api/admin.service'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'

export default function SubscribersMonitoringTPSLPage() {
    const [tradeMode, setTradeMode] = useState<'REAL' | 'SIMULATION'>('REAL')
    const [sortBy, setSortBy] = useState<string>('profit-highest')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [subscriberFilter, setSubscriberFilter] = useState<string>('all')

    // Buscar dados
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'subscribers-monitoring-tp-sl', tradeMode, sortBy],
        queryFn: () => adminService.getSubscribersMonitoringTPSL({ 
            trade_mode: tradeMode,
            sort_by: sortBy as any
        }),
        refetchInterval: autoRefresh ? 15000 : false, // Auto-refresh a cada 15 segundos
        staleTime: 0, // Não usar cache - sempre buscar dados frescos
    })

    const allPositions = data?.data || []
    const summary = data?.summary

    // Extrair lista única de assinantes (formato compatível com SubscriberSelect)
    const subscribers = useMemo(() => {
        const uniqueSubscribers = new Map<number, { id: number; email: string; profile?: { full_name?: string } }>()
        allPositions.forEach((pos: any) => {
            if (pos.subscriber?.id && !uniqueSubscribers.has(pos.subscriber.id)) {
                uniqueSubscribers.set(pos.subscriber.id, {
                    id: pos.subscriber.id,
                    email: pos.subscriber.email || `user-${pos.subscriber.id}`,
                    profile: pos.subscriber.full_name ? { full_name: pos.subscriber.full_name } : undefined
                })
            }
        })
        return Array.from(uniqueSubscribers.values())
    }, [allPositions])

    // Filtrar posições por assinante
    const positions = useMemo(() => {
        if (subscriberFilter === 'all') return allPositions
        return allPositions.filter((pos: any) => pos.subscriber?.id?.toString() === subscriberFilter)
    }, [allPositions, subscriberFilter])

    const handleRefresh = () => {
        refetch()
        toast.success('Dados atualizados')
    }

    const getStatusColor = (pnlPct: number) => {
        if (pnlPct >= 0) return 'text-green-500'
        return 'text-red-500'
    }

    const getStatusBadge = (pnlPct: number) => {
        if (pnlPct >= 0) {
            return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500">Lucro</Badge>
        }
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500">Perda</Badge>
    }

    if (isLoading) {
        return (
            <div className="container mx-auto py-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Monitor TP/SL - Assinantes</h1>
                        <p className="text-muted-foreground mt-1">Acompanhe posições dos assinantes com Take Profit e Stop Loss ativados</p>
                    </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-6 w-32" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-24 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Target className="h-8 w-8" />
                        Monitor TP/SL - Assinantes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Acompanhe posições dos assinantes com Take Profit e Stop Loss ativados
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={tradeMode} onValueChange={(v) => setTradeMode(v as any)}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="REAL">REAL</SelectItem>
                            <SelectItem value="SIMULATION">SIMULAÇÃO</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Ordenar por..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="profit-highest">Maior lucro</SelectItem>
                            <SelectItem value="profit-lowest">Maior perda</SelectItem>
                            <SelectItem value="tp-closest">Mais próximo do TP</SelectItem>
                            <SelectItem value="sl-closest">Mais próximo do SL</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Auto ON' : 'Auto OFF'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
                        <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Filter className="h-5 w-5" />
                                    Filtros
                                </CardTitle>
                            </div>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Assinante</Label>
                                    <SubscriberSelect
                                        subscribers={subscribers}
                                        value={subscriberFilter}
                                        onValueChange={setSubscriberFilter}
                                        placeholder="Todos os assinantes"
                                        allLabel="Todos os assinantes"
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Estatísticas */}
            {summary && (
                <div className="grid gap-4 md:grid-cols-5">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total de Posições</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{summary.total_positions}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-green-500" /> Com TP
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-500">{summary.positions_with_tp}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 text-red-500" /> Com SL
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-500">{summary.positions_with_sl}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-yellow-500" /> Com SG
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-yellow-500">{summary.positions_with_sg}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <Zap className="h-3 w-3 text-purple-500" /> Com TSG
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-500">{summary.positions_with_tsg}</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Lista de Posições */}
            {positions.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                            Nenhuma posição de assinante com TP/SL ativado encontrada
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {positions.map((position: any) => (
                        <Card key={position.id} className="relative">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">
                                            {position.symbol}
                                        </CardTitle>
                                        <CardDescription className="mt-1 flex flex-col gap-0.5">
                                            <span className="flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {position.subscriber?.email || '-'}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {position.exchange_account?.label || position.exchange_account?.exchange || '-'}
                                            </span>
                                        </CardDescription>
                                    </div>
                                    {getStatusBadge(position.pnl_pct)}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Preços */}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Preço Abertura</p>
                                        <p className="font-medium">{formatCurrency(position.price_open)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Preço Atual</p>
                                        <p className="font-medium">
                                            {position.current_price ? formatCurrency(position.current_price) : 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {/* PnL */}
                                {position.pnl_pct !== null && (
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-sm text-muted-foreground">PnL</p>
                                            <p className={`text-sm font-bold ${getStatusColor(position.pnl_pct)}`}>
                                                {position.pnl_pct >= 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Take Profit - Mostrar mesmo com TSG ativo (agora funcionam juntos) */}
                                {position.tp_enabled && position.tp_pct !== null && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1">
                                                <TrendingUp className="h-3 w-3 text-green-500" />
                                                <span className="text-muted-foreground">Take Profit</span>
                                                {position.tsg_enabled && (
                                                    <Badge variant="outline" className="text-[10px] ml-1 bg-blue-500/10 text-blue-500 border-blue-500">
                                                        Teto Máx.
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {position.tp_proximity_pct !== null ? (
                                                    <>
                                                        <span className="text-xs font-medium">
                                                            {position.tp_proximity_pct.toFixed(1)}%
                                                        </span>
                                                        {position.distance_to_tp_pct !== null && position.distance_to_tp_pct > 0 && (
                                                            <span className="text-xs text-muted-foreground">
                                                                ({position.distance_to_tp_pct.toFixed(2)}% restante)
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">N/A</span>
                                                )}
                                            </div>
                                        </div>
                                        {position.tp_proximity_pct !== null && (
                                            <Progress 
                                                value={Math.min(position.tp_proximity_pct, 100)} 
                                                className="h-2"
                                            />
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Meta: {position.tp_pct}% • {position.tp_triggered && (
                                                <Badge variant="outline" className="ml-1 text-xs">Triggered</Badge>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* Stop Gain */}
                                {position.sg_enabled && position.sg_pct !== null && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                                                <span className="text-muted-foreground">Stop Gain</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {position.sg_proximity_pct !== null ? (
                                                    <span className="text-xs font-medium">
                                                        {position.sg_proximity_pct.toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">N/A</span>
                                                )}
                                            </div>
                                        </div>
                                        {position.sg_proximity_pct !== null && (
                                            <Progress
                                                value={position.sg_proximity_pct}
                                                className="h-1.5"
                                            />
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Ativa: {position.sg_pct}% • Vende: {position.sg_pct && position.sg_drop_pct ? (position.sg_pct - position.sg_drop_pct).toFixed(1) : 'N/A'}%
                                            {position.sg_activated && (
                                                <Badge variant="outline" className="ml-1 text-xs bg-amber-500/10">Ativado</Badge>
                                            )}
                                            {position.sg_triggered && (
                                                <Badge variant="outline" className="ml-1 text-xs">Triggered</Badge>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* Trailing Stop Gain */}
                                {position.tsg_enabled && (position.tsg_activation_pct !== null || position.tsg_status) && (
                                    <div className="space-y-1 p-2 bg-muted/50 rounded border border-dashed">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1">
                                                <Zap className="h-3 w-3 text-purple-500" />
                                                <span className="text-muted-foreground font-medium">Trailing Stop Gain</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {(position.tsg_proximity_pct !== null || position.tsg_status?.proximity_to_activation !== null) ? (
                                                    <span className="text-xs font-medium">
                                                        {(position.tsg_proximity_pct ?? position.tsg_status?.proximity_to_activation)?.toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">N/A</span>
                                                )}
                                            </div>
                                        </div>
                                        <Progress
                                            value={Math.min((position.tsg_proximity_pct ?? position.tsg_status?.proximity_to_activation ?? 0), 100)}
                                            className="h-2"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            {(position.tsg_activated || position.tsg_status?.is_activated) ? (
                                                <>
                                                    📈 Pico: <span className="font-bold">{(position.tsg_max_pnl_pct ?? position.tsg_status?.max_pnl_pct)?.toFixed(2) || 'N/A'}%</span> • 
                                                    💰 Vende: <span className="font-bold">{
                                                        ((position.tsg_max_pnl_pct ?? position.tsg_status?.max_pnl_pct) && (position.tsg_drop_pct ?? position.tsg_status?.drop_pct)) 
                                                            ? ((position.tsg_max_pnl_pct ?? position.tsg_status?.max_pnl_pct) - (position.tsg_drop_pct ?? position.tsg_status?.drop_pct)).toFixed(2) 
                                                            : 'N/A'
                                                    }%</span>
                                                    <Badge variant="outline" className="ml-1 text-xs">🎯 Rastreando</Badge>
                                                </>
                                            ) : (
                                                <>
                                                    ⏳ Ativa: <span className="font-medium">{position.tsg_activation_pct ?? position.tsg_status?.activation_pct}%</span> • 
                                                    📉 Queda: <span className="font-medium">{(position.tsg_drop_pct ?? position.tsg_status?.drop_pct) || 'N/A'}%</span>
                                                </>
                                            )}
                                            {position.tsg_triggered && (
                                                <Badge variant="outline" className="ml-1 text-xs bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/50">✓ Executado</Badge>
                                            )}
                                        </p>
                                        {position.tp_enabled && position.tsg_enabled && (
                                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                                💡 TP + TSG: O primeiro a atingir vende
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Stop Loss */}
                                {position.sl_enabled && position.sl_pct !== null && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1">
                                                <TrendingDown className="h-3 w-3 text-red-500" />
                                                <span className="text-muted-foreground">Stop Loss</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {position.sl_proximity_pct !== null ? (
                                                    <>
                                                        <span className="text-xs font-medium">
                                                            {position.sl_proximity_pct.toFixed(1)}%
                                                        </span>
                                                        {position.distance_to_sl_pct !== null && position.distance_to_sl_pct > 0 && (
                                                            <span className="text-xs text-muted-foreground">
                                                                ({position.distance_to_sl_pct.toFixed(2)}% restante)
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">N/A</span>
                                                )}
                                            </div>
                                        </div>
                                        {position.sl_proximity_pct !== null && (
                                            <Progress 
                                                value={Math.min(position.sl_proximity_pct, 100)} 
                                                className="h-2"
                                            />
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Meta: -{position.sl_pct}% • {position.sl_triggered && (
                                                <Badge variant="outline" className="ml-1 text-xs">Triggered</Badge>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* Valores em USD */}
                                <div className="pt-2 border-t space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Valor Investido</span>
                                        <span className="font-medium">
                                            {formatCurrency(position.invested_value_usd ?? position.total_value_usd)}
                                        </span>
                                    </div>
                                    {(position.current_value_usd !== null || position.current_price) && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Valor Atual</span>
                                                <span className="font-medium">
                                                    {formatCurrency(position.current_value_usd ?? (position.qty_remaining * position.current_price))}
                                                </span>
                                            </div>
                                            {position.unrealized_pnl_usd !== null && (
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">PnL Não Realizado</span>
                                                    <span className={`font-medium ${position.unrealized_pnl_usd >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {position.unrealized_pnl_usd >= 0 ? '+' : ''}{formatCurrency(position.unrealized_pnl_usd)}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Quantidade */}
                                <div className="pt-2 border-t">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Quantidade</span>
                                        <span className="font-medium">
                                            {position.qty_remaining?.toFixed(8) || 'N/A'} / {position.qty_total?.toFixed(8) || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                {/* Indicadores extras */}
                                {position.lock_sell_by_webhook && (
                                    <div className="pt-2 border-t">
                                        <Badge variant="outline" className="text-xs">🔒 Webhook Bloqueado</Badge>
                                    </div>
                                )}

                                {/* Link para detalhes */}
                                <Link href={`/subscribers-admin/positions/${position.id}`}>
                                    <Button variant="outline" size="sm" className="w-full mt-2">
                                        Ver Detalhes
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
