'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, RefreshCw, Filter, Users, ChevronDown, Zap, ZapOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { adminService } from '@/lib/api/admin.service'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'

type SortOption = 'pnl_desc' | 'pnl_asc' | 'symbol' | 'value_desc' | 'value_asc' | 'subscriber'

// Função para obter gradiente de cor baseado no PnL
function getPnlGradient(pnl: number): string {
    if (pnl > 10) return 'from-green-800/90 to-green-900/90'
    if (pnl > 5) return 'from-green-700/90 to-green-800/90'
    if (pnl > 2) return 'from-green-600/90 to-green-700/80'
    if (pnl > 0) return 'from-green-500/90 to-green-600/80'
    if (pnl > -2) return 'from-yellow-500/90 to-yellow-400/80'
    if (pnl > -5) return 'from-red-700/90 to-red-600/80'
    return 'from-red-900/90 to-red-800/80'
}

export default function SubscribersHeatmapPage() {
    const [tradeMode, setTradeMode] = useState<'REAL' | 'SIMULATION'>('REAL')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [sortBy, setSortBy] = useState<SortOption>('pnl_desc')
    const [subscriberFilter, setSubscriberFilter] = useState<string>('all')
    const [realtimeEnabled, setRealtimeEnabled] = useState(false)
    const [nextUpdate, setNextUpdate] = useState<number>(60)

    // Buscar dados
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'subscribers-heatmap', tradeMode],
        queryFn: () => adminService.getSubscribersHeatmap({ trade_mode: tradeMode }),
        refetchInterval: realtimeEnabled ? 60000 : false,
        staleTime: 30000,
    })

    const allPositions = data?.data || []
    const summary = data?.summary

    // Contador para próxima atualização (quando realtime ativo)
    useEffect(() => {
        if (!realtimeEnabled) {
            setNextUpdate(60)
            return
        }

        setNextUpdate(60)
        
        const interval = setInterval(() => {
            setNextUpdate((prev) => {
                if (prev <= 1) {
                    return 60
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [realtimeEnabled, data])

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

    // Ordenar posições
    const sortedPositions = useMemo(() => {
        const sorted = [...positions]
        switch (sortBy) {
            case 'pnl_desc':
                return sorted.sort((a: any, b: any) => b.pnl_pct - a.pnl_pct)
            case 'pnl_asc':
                return sorted.sort((a: any, b: any) => a.pnl_pct - b.pnl_pct)
            case 'symbol':
                return sorted.sort((a: any, b: any) => a.symbol.localeCompare(b.symbol))
            case 'value_desc':
                return sorted.sort((a: any, b: any) => b.invested_value_usd - a.invested_value_usd)
            case 'value_asc':
                return sorted.sort((a: any, b: any) => a.invested_value_usd - b.invested_value_usd)
            case 'subscriber':
                return sorted.sort((a: any, b: any) => (a.subscriber?.email || '').localeCompare(b.subscriber?.email || ''))
            default:
                return sorted
        }
    }, [positions, sortBy])

    const hasActiveFilters = subscriberFilter !== 'all'

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <Flame className="h-8 w-8 text-orange-500" />
                        <h1 className="text-3xl font-bold gradient-text">Mapa de Calor - Assinantes</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">
                        Visualize as posições abertas de todos os assinantes em tempo real
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
                    <Button
                        variant={realtimeEnabled ? 'default' : 'outline'}
                        onClick={() => setRealtimeEnabled(!realtimeEnabled)}
                        className={cn(
                            realtimeEnabled && 'bg-green-600 hover:bg-green-700'
                        )}
                    >
                        {realtimeEnabled ? (
                            <>
                                <Zap className="h-4 w-4 mr-2 animate-pulse" />
                                Realtime ON
                                <Badge variant="secondary" className="ml-2 bg-black/20">
                                    {nextUpdate}s
                                </Badge>
                            </>
                        ) : (
                            <>
                                <ZapOff className="h-4 w-4 mr-2" />
                                Realtime OFF
                            </>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Posições</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">{summary?.total_positions || 0}</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Valor Total Investido</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(summary?.total_value_usd || 0)}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>PnL Não Realizado</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className={cn(
                                "text-2xl font-bold",
                                (summary?.total_unrealized_pnl_usd || 0) >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                                {formatCurrency(summary?.total_unrealized_pnl_usd || 0)}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>PnL Médio</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "text-2xl font-bold",
                                    (summary?.avg_pnl_pct || 0) >= 0 ? "text-green-500" : "text-red-500"
                                )}>
                                    {(summary?.avg_pnl_pct || 0).toFixed(2)}%
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Filtros Colapsáveis */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    <CardTitle className="text-lg">Filtros e Ordenação</CardTitle>
                                    {hasActiveFilters && (
                                        <Badge variant="secondary" className="ml-2">
                                            Ativos
                                        </Badge>
                                    )}
                                </div>
                                <ChevronDown 
                                    className={cn(
                                        "h-4 w-4 text-muted-foreground transition-transform",
                                        filtersOpen && "transform rotate-180"
                                    )}
                                />
                            </div>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="grid gap-4 md:grid-cols-2">
                                {/* Filtro de Assinante */}
                                <div className="space-y-2">
                                    <Label htmlFor="subscriber-filter">Assinante</Label>
                                    <SubscriberSelect
                                        subscribers={subscribers}
                                        value={subscriberFilter}
                                        onValueChange={setSubscriberFilter}
                                        placeholder="Todos os assinantes"
                                        allLabel="Todos os assinantes"
                                        className="w-full"
                                    />
                                </div>

                                {/* Ordenação */}
                                <div className="space-y-2">
                                    <Label htmlFor="sort-filter">Ordenar por</Label>
                                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                                        <SelectTrigger id="sort-filter">
                                            <SelectValue placeholder="Ordenar por" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="pnl_desc">PNL% (maior primeiro)</SelectItem>
                                            <SelectItem value="pnl_asc">PNL% (menor primeiro)</SelectItem>
                                            <SelectItem value="value_desc">Valor investido (maior)</SelectItem>
                                            <SelectItem value="value_asc">Valor investido (menor)</SelectItem>
                                            <SelectItem value="symbol">Símbolo (A-Z)</SelectItem>
                                            <SelectItem value="subscriber">Assinante (A-Z)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Grid de Cards */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Flame className="h-5 w-5 text-orange-500" />
                        Posições Abertas - {tradeMode}
                        {subscriberFilter !== 'all' && subscribers && (
                            <span className="text-sm font-normal text-muted-foreground">
                                • {subscribers.find(s => s.id.toString() === subscriberFilter)?.email}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="aspect-square">
                                    <Skeleton className="w-full h-full rounded-lg" />
                                </div>
                            ))}
                        </div>
                    ) : sortedPositions.length === 0 ? (
                        <div className="text-center py-12">
                            <Flame className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                            <p className="text-muted-foreground">
                                {hasActiveFilters
                                    ? 'Nenhuma posição aberta encontrada com os filtros aplicados'
                                    : `Nenhuma posição aberta de assinantes no modo ${tradeMode}`}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 animate-fade-in">
                            {sortedPositions.map((pos: any) => (
                                <Link
                                    key={pos.id}
                                    href={`/subscribers-admin/positions/${pos.id}`}
                                    className="block"
                                >
                                    <div
                                        className={cn(
                                            "aspect-square rounded-lg p-3 flex flex-col justify-between",
                                            "bg-gradient-to-br border border-white/10",
                                            "hover:scale-105 hover:shadow-lg transition-all cursor-pointer",
                                            getPnlGradient(pos.pnl_pct)
                                        )}
                                    >
                                        {/* Header */}
                                        <div className="flex items-start justify-between">
                                            <div className="font-bold text-sm text-white truncate flex-1 mr-1">
                                                {pos.symbol.replace('USDT', '')}
                                            </div>
                                            {/* Badges de SL/TP/TSG */}
                                            <div className="flex gap-0.5 flex-wrap justify-end">
                                                {pos.tp_enabled && (
                                                    <Badge variant="outline" className="text-[8px] px-1 py-0 bg-green-500/20 text-green-300 border-green-500/50">
                                                        TP
                                                    </Badge>
                                                )}
                                                {pos.tsg_enabled && (
                                                    <Badge variant="outline" className={cn(
                                                        "text-[8px] px-1 py-0 border-purple-500/50",
                                                        pos.tsg_activated 
                                                            ? "bg-purple-500/40 text-purple-200" 
                                                            : "bg-purple-500/20 text-purple-300"
                                                    )}>
                                                        TSG
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Subscriber email */}
                                        <div className="text-[9px] text-white/60 truncate flex items-center gap-1">
                                            <Users className="h-2.5 w-2.5" />
                                            {pos.subscriber?.email || 'N/A'}
                                        </div>
                                        
                                        {/* Exchange account */}
                                        <div className="text-[8px] text-white/50 truncate">
                                            {pos.exchange_account?.label || pos.exchange_account?.exchange || '-'}
                                        </div>
                                        
                                        {/* Footer com PnL e valor investido */}
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-white">
                                                {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct.toFixed(2)}%
                                            </div>
                                            <div className="text-[10px] text-white/70">
                                                {formatCurrency(pos.unrealized_pnl_usd)}
                                            </div>
                                            <div className="text-[8px] text-white/50 mt-0.5">
                                                Inv: {formatCurrency(pos.invested_value_usd)}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Legenda de Cores */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle className="text-sm">Legenda de Cores</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3 items-center text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-red-900/90 to-red-800/80 border border-white/10" />
                            <span className="text-muted-foreground">&lt; -5%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-red-700/90 to-red-600/80 border border-white/10" />
                            <span className="text-muted-foreground">-5% a -2%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-yellow-500/90 to-yellow-400/80 border border-white/10" />
                            <span className="text-muted-foreground">-2% a 0%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-green-500/90 to-green-600/80 border border-white/10" />
                            <span className="text-muted-foreground">0% a 2%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-green-600/90 to-green-700/80 border border-white/10" />
                            <span className="text-muted-foreground">2% a 5%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-green-700/90 to-green-800/90 border border-white/10" />
                            <span className="text-muted-foreground">5% a 10%</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-gradient-to-br from-green-800/90 to-green-900/90 border border-white/10" />
                            <span className="text-muted-foreground">&gt; 10%</span>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        💡 Clique em qualquer card para ver detalhes da posição
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
