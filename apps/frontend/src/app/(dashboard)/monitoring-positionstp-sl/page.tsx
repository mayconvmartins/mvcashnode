'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Target, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Filter } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { positionsService } from '@/lib/api/positions.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import type { PositionTPSLMonitoring } from '@/lib/types'
import { formatCurrency } from '@/lib/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function MonitoringPositionstpSlPage() {
    const { tradeMode } = useTradeMode()
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [sortBy, setSortBy] = useState<string>('profit-highest') // Padrão: Mais próximo do lucro (maior lucro primeiro)

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = {}
        if (tradeMode) f.trade_mode = tradeMode
        if (selectedAccount !== 'all') f.exchange_account_id = parseInt(selectedAccount)
        return f
    }, [tradeMode, selectedAccount])

    // Buscar posições com TP/SL
    const { data: monitoringData, isLoading, refetch } = useQuery({
        queryKey: ['positions', 'monitoring-tp-sl', filters],
        queryFn: () => positionsService.getMonitoringTPSL(filters),
        refetchInterval: autoRefresh ? 15000 : false, // Auto-refresh a cada 15 segundos
        staleTime: 0, // Não usar cache - sempre buscar dados frescos para garantir apenas posições abertas
    })

    const positions: PositionTPSLMonitoring[] = monitoringData?.data || []

    // Log para debug: verificar se há posições sendo retornadas
    if (positions.length > 0) {
        console.log(`[MonitoringPage] Total de posições recebidas do backend: ${positions.length}`);
        console.log(`[MonitoringPage] Primeira posição:`, positions[0]);
    }

    // Filtro de segurança: garantir que apenas posições válidas sejam exibidas
    // (camada de segurança caso o backend retorne algo incorreto)
    // O tipo PositionTPSLMonitoring já garante que apenas posições abertas são retornadas
    const validPositions = useMemo(() => {
        const filtered = positions.filter((pos) => {
            // Garantir que tem quantidade restante (validação de segurança)
            if (pos.qty_remaining <= 0) {
                console.warn(`[MonitoringPage] ⚠️ Posição ${pos.id} com qty_remaining <= 0 encontrada - será filtrada`);
                return false;
            }
            return true;
        });
        
        if (filtered.length !== positions.length) {
            console.warn(`[MonitoringPage] ${positions.length - filtered.length} posição(ões) filtrada(s) no frontend`);
        }
        
        console.log(`[MonitoringPage] Total de posições válidas após filtro: ${filtered.length}`);
        return filtered;
    }, [positions])

    // Ordenar posições baseado no critério selecionado
    const sortedPositions = useMemo(() => {
        const sorted = [...validPositions]
        switch (sortBy) {
            case 'tp-closest':
                return sorted.sort((a, b) => {
                    const aVal = a.tp_proximity_pct ?? 0
                    const bVal = b.tp_proximity_pct ?? 0
                    return bVal - aVal // Maior proximidade primeiro
                })
            case 'sl-closest':
                return sorted.sort((a, b) => {
                    const aVal = a.sl_proximity_pct ?? 0
                    const bVal = b.sl_proximity_pct ?? 0
                    return bVal - aVal // Maior proximidade primeiro
                })
            case 'tp-farthest':
                return sorted.sort((a, b) => {
                    const aVal = a.tp_proximity_pct ?? 0
                    const bVal = b.tp_proximity_pct ?? 0
                    return aVal - bVal // Menor proximidade primeiro
                })
            case 'sl-farthest':
                return sorted.sort((a, b) => {
                    const aVal = a.sl_proximity_pct ?? 0
                    const bVal = b.sl_proximity_pct ?? 0
                    return aVal - bVal // Menor proximidade primeiro
                })
            case 'profit-highest':
                return sorted.sort((a, b) => {
                    const aVal = a.pnl_pct ?? 0
                    const bVal = b.pnl_pct ?? 0
                    return bVal - aVal // Maior lucro primeiro
                })
            case 'loss-highest':
                return sorted.sort((a, b) => {
                    const aVal = a.pnl_pct ?? 0
                    const bVal = b.pnl_pct ?? 0
                    return aVal - bVal // Maior perda primeiro (menor valor)
                })
            case 'default':
            default:
                // Manter ordem original (mais recente primeiro, que é a ordem da API)
                return sorted
        }
    }, [positions, sortBy])

    const handleRefresh = () => {
        refetch()
        toast.success('Dados atualizados')
    }

    const getStatusColor = (status: PositionTPSLMonitoring['status']) => {
        switch (status) {
            case 'PROFIT':
                return 'text-green-500'
            case 'LOSS':
                return 'text-red-500'
            case 'AT_TP':
                return 'text-green-600 font-bold'
            case 'AT_SL':
                return 'text-red-600 font-bold'
            default:
                return 'text-muted-foreground'
        }
    }

    const getStatusBadge = (status: PositionTPSLMonitoring['status']) => {
        switch (status) {
            case 'PROFIT':
                return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500">Lucro</Badge>
            case 'LOSS':
                return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500">Perda</Badge>
            case 'AT_TP':
                return <Badge variant="outline" className="bg-green-600/20 text-green-600 border-green-600 font-bold">No TP</Badge>
            case 'AT_SL':
                return <Badge variant="outline" className="bg-red-600/20 text-red-600 border-red-600 font-bold">No SL</Badge>
            default:
                return <Badge variant="secondary">Desconhecido</Badge>
        }
    }

    if (isLoading) {
        return (
            <div className="container mx-auto py-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Monitor TP/SL</h1>
                        <p className="text-muted-foreground mt-1">Acompanhe posições com Take Profit e Stop Loss ativados</p>
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
                        Monitor TP/SL
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Acompanhe posições com Take Profit e Stop Loss ativados
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Ordenar por..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Padrão (Mais recente)</SelectItem>
                            <SelectItem value="tp-closest">Mais próximo do TP</SelectItem>
                            <SelectItem value="sl-closest">Mais próximo do SL</SelectItem>
                            <SelectItem value="tp-farthest">Mais distante do TP</SelectItem>
                            <SelectItem value="sl-farthest">Mais distante do SL</SelectItem>
                            <SelectItem value="profit-highest">Maior lucro</SelectItem>
                            <SelectItem value="loss-highest">Maior perda</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
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
                                    <Label>Conta de Exchange</Label>
                                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Todas as contas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas as contas</SelectItem>
                                            {accounts?.map((account) => (
                                                <SelectItem key={account.id} value={account.id.toString()}>
                                                    {account.label} ({account.exchange})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Estatísticas */}
            {sortedPositions.length > 0 && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total de Posições</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{sortedPositions.length}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Em Lucro</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-500">
                                {sortedPositions.filter(p => p.status === 'PROFIT' || p.status === 'AT_TP').length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Em Perda</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-500">
                                {sortedPositions.filter(p => p.status === 'LOSS' || p.status === 'AT_SL').length}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Próximas do TP</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {sortedPositions.filter(p => p.tp_proximity_pct !== null && p.tp_proximity_pct >= 80).length}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Lista de Posições */}
            {sortedPositions.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                            Nenhuma posição com TP/SL ativado encontrada
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {sortedPositions.map((position) => (
                        <Card key={position.id} className="relative">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">
                                            {position.symbol}
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            {position.exchange_account_label} • {position.trade_mode}
                                        </CardDescription>
                                    </div>
                                    {getStatusBadge(position.status)}
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
                                            <p className={`text-sm font-bold ${getStatusColor(position.status)}`}>
                                                {position.pnl_pct >= 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Take Profit - Não mostrar se TSG estiver ativo */}
                                {position.tp_enabled && position.tp_pct !== null && !position.tsg_enabled && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1">
                                                <TrendingUp className="h-3 w-3 text-green-500" />
                                                <span className="text-muted-foreground">Take Profit</span>
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
                                                <TrendingUp className="h-3 w-3 text-amber-500" />
                                                <span className="text-muted-foreground">Stop Gain</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {position.sg_proximity_pct !== null ? (
                                                    <>
                                                        <span className="text-xs font-medium">
                                                            {position.sg_proximity_pct.toFixed(1)}%
                                                        </span>
                                                        {position.distance_to_sg_pct !== null && position.distance_to_sg_pct > 0 && (
                                                            <span className="text-xs text-muted-foreground">
                                                                ({position.distance_to_sg_pct.toFixed(2)}% restante)
                                                            </span>
                                                        )}
                                                    </>
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
                                {position.tsg_enabled && position.tsg_activation_pct !== null && (
                                    <div className="space-y-1 p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1">
                                                <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                                <span className="text-amber-700 dark:text-amber-300 font-medium">Trailing Stop Gain</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {position.tsg_proximity_pct !== null ? (
                                                    <>
                                                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                                            {position.tsg_proximity_pct.toFixed(1)}%
                                                        </span>
                                                        {position.distance_to_tsg_pct !== null && position.distance_to_tsg_pct > 0 && (
                                                            <span className="text-xs text-amber-600 dark:text-amber-400">
                                                                ({position.distance_to_tsg_pct.toFixed(2)}% restante)
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-amber-600 dark:text-amber-400">N/A</span>
                                                )}
                                            </div>
                                        </div>
                                        {position.tsg_proximity_pct !== null && (
                                            <Progress
                                                value={Math.min(position.tsg_proximity_pct, 100)}
                                                className="h-2 bg-amber-100 dark:bg-amber-900/30"
                                            />
                                        )}
                                        <p className="text-xs text-amber-700 dark:text-amber-300">
                                            {position.tsg_activated ? (
                                                <>
                                                    📈 Pico: <span className="font-bold text-amber-800 dark:text-amber-200">{position.tsg_max_pnl_pct?.toFixed(2) || 'N/A'}%</span> • 
                                                    💰 Vende: <span className="font-bold text-amber-800 dark:text-amber-200">{position.tsg_max_pnl_pct && position.tsg_drop_pct ? (position.tsg_max_pnl_pct - position.tsg_drop_pct).toFixed(2) : 'N/A'}%</span>
                                                    <Badge variant="outline" className="ml-1 text-xs bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50">🎯 Rastreando</Badge>
                                                </>
                                            ) : (
                                                <>
                                                    ⏳ Ativa: <span className="font-medium">{position.tsg_activation_pct}%</span> • 
                                                    📉 Queda: <span className="font-medium">{position.tsg_drop_pct || 'N/A'}%</span>
                                                </>
                                            )}
                                            {position.tsg_triggered && (
                                                <Badge variant="outline" className="ml-1 text-xs bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/50">✓ Executado</Badge>
                                            )}
                                        </p>
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
                                            {formatCurrency(position.total_value_usd)}
                                        </span>
                                    </div>
                                    {position.current_value_usd !== null && (
                                        <>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Valor Atual</span>
                                                <span className="font-medium">
                                                    {formatCurrency(position.current_value_usd)}
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
                                            {position.qty_remaining.toFixed(8)} / {position.qty_total.toFixed(8)}
                                        </span>
                                    </div>
                                </div>

                                {/* Link para detalhes */}
                                <Link href={`/positions/${position.id}`}>
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

