'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, RefreshCw, Filter, Users } from 'lucide-react'
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

type SortOption = 'pnl_desc' | 'pnl_asc' | 'symbol' | 'value_desc' | 'value_asc' | 'subscriber'

export default function SubscribersHeatmapPage() {
    const [tradeMode, setTradeMode] = useState<'REAL' | 'SIMULATION'>('REAL')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [sortBy, setSortBy] = useState<SortOption>('pnl_desc')

    // Buscar dados
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'subscribers-heatmap', tradeMode],
        queryFn: () => adminService.getSubscribersHeatmap({ trade_mode: tradeMode }),
        refetchInterval: 60000, // Auto-refresh a cada 60 segundos
    })

    const positions = data?.data || []
    const summary = data?.summary

    // Ordenar posições
    const sortedPositions = useMemo(() => {
        const sorted = [...positions]
        switch (sortBy) {
            case 'pnl_desc':
                return sorted.sort((a, b) => b.pnl_pct - a.pnl_pct)
            case 'pnl_asc':
                return sorted.sort((a, b) => a.pnl_pct - b.pnl_pct)
            case 'symbol':
                return sorted.sort((a, b) => a.symbol.localeCompare(b.symbol))
            case 'value_desc':
                return sorted.sort((a, b) => b.invested_value_usd - a.invested_value_usd)
            case 'value_asc':
                return sorted.sort((a, b) => a.invested_value_usd - b.invested_value_usd)
            case 'subscriber':
                return sorted.sort((a, b) => (a.subscriber?.email || '').localeCompare(b.subscriber?.email || ''))
            default:
                return sorted
        }
    }, [positions, sortBy])

    // Função para determinar a cor de fundo baseada no PnL
    const getPnlColor = (pnl: number) => {
        if (pnl >= 5) return 'bg-green-500/30 border-green-500'
        if (pnl >= 2) return 'bg-green-400/25 border-green-400'
        if (pnl > 0) return 'bg-green-300/20 border-green-300'
        if (pnl === 0) return 'bg-gray-500/20 border-gray-500'
        if (pnl > -2) return 'bg-red-300/20 border-red-300'
        if (pnl > -5) return 'bg-red-400/25 border-red-400'
        return 'bg-red-500/30 border-red-500'
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Flame className="h-6 w-6 text-orange-500" />
                        Mapa de Calor - Assinantes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Visualização de todas as posições abertas dos assinantes
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
                    <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">Posições</div>
                            <div className="text-2xl font-bold">{summary.total_positions}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">Valor Total</div>
                            <div className="text-2xl font-bold">{formatCurrency(summary.total_value_usd)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">PnL Não Realizado</div>
                            <div className={cn("text-2xl font-bold", summary.total_unrealized_pnl_usd >= 0 ? "text-green-500" : "text-red-500")}>
                                {formatCurrency(summary.total_unrealized_pnl_usd)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">PnL Médio</div>
                            <div className={cn("text-2xl font-bold", summary.avg_pnl_pct >= 0 ? "text-green-500" : "text-red-500")}>
                                {summary.avg_pnl_pct.toFixed(2)}%
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                        <span className="flex items-center gap-2">
                            <Filter className="h-4 w-4" />
                            Filtros e Ordenação
                        </span>
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                    <div className="flex flex-wrap gap-4">
                        <div className="space-y-2">
                            <Label>Ordenar por</Label>
                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                <SelectTrigger className="w-48">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pnl_desc">Maior PnL</SelectItem>
                                    <SelectItem value="pnl_asc">Menor PnL</SelectItem>
                                    <SelectItem value="value_desc">Maior Valor</SelectItem>
                                    <SelectItem value="value_asc">Menor Valor</SelectItem>
                                    <SelectItem value="symbol">Símbolo</SelectItem>
                                    <SelectItem value="subscriber">Assinante</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Loading */}
            {isLoading && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton key={i} className="h-40" />
                    ))}
                </div>
            )}

            {/* Heatmap Grid */}
            {!isLoading && sortedPositions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {sortedPositions.map((pos) => (
                        <Card 
                            key={pos.id} 
                            className={cn("border-2 transition-all hover:scale-[1.02]", getPnlColor(pos.pnl_pct))}
                        >
                            <CardContent className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-lg">{pos.symbol.replace('USDT', '')}</span>
                                    <Badge variant={pos.pnl_pct >= 0 ? "default" : "destructive"} className="text-xs">
                                        {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct.toFixed(2)}%
                                    </Badge>
                                </div>
                                
                                <div className="text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        {pos.subscriber?.full_name || pos.subscriber?.email?.split('@')[0] || 'N/A'}
                                    </div>
                                </div>

                                <div className="text-sm space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Entrada:</span>
                                        <span>{formatCurrency(pos.price_open)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Atual:</span>
                                        <span>{formatCurrency(pos.current_price)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Investido:</span>
                                        <span>{formatCurrency(pos.invested_value_usd)}</span>
                                    </div>
                                </div>

                                <div className={cn("text-center font-bold", pos.unrealized_pnl_usd >= 0 ? "text-green-500" : "text-red-500")}>
                                    {pos.unrealized_pnl_usd >= 0 ? '+' : ''}{formatCurrency(pos.unrealized_pnl_usd)}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {!isLoading && sortedPositions.length === 0 && (
                <Card>
                    <CardContent className="p-12 text-center">
                        <Flame className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma posição encontrada</h3>
                        <p className="text-muted-foreground">
                            Não há posições abertas de assinantes no modo {tradeMode}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

