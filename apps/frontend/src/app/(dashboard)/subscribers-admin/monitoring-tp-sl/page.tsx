'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Target, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Users, Zap } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { adminService } from '@/lib/api/admin.service'
import { formatCurrency } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

export default function SubscribersMonitoringTPSLPage() {
    const [tradeMode, setTradeMode] = useState<'REAL' | 'SIMULATION'>('REAL')
    const [sortBy, setSortBy] = useState<string>('profit-highest')

    // Buscar dados
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'subscribers-monitoring-tp-sl', tradeMode, sortBy],
        queryFn: () => adminService.getSubscribersMonitoringTPSL({ 
            trade_mode: tradeMode,
            sort_by: sortBy as any
        }),
        refetchInterval: 15000, // Auto-refresh a cada 15 segundos
    })

    const positions = data?.data || []
    const summary = data?.summary

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Target className="h-6 w-6 text-blue-500" />
                        Monitor SL/TP - Assinantes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Monitoramento de Stop Loss e Take Profit de todas as posições dos assinantes
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground">Posições</div>
                            <div className="text-2xl font-bold">{summary.total_positions}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-green-500" /> Com TP
                            </div>
                            <div className="text-2xl font-bold text-green-500">{summary.positions_with_tp}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 text-red-500" /> Com SL
                            </div>
                            <div className="text-2xl font-bold text-red-500">{summary.positions_with_sl}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-yellow-500" /> Com SG
                            </div>
                            <div className="text-2xl font-bold text-yellow-500">{summary.positions_with_sg}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Zap className="h-3 w-3 text-purple-500" /> Com TSG
                            </div>
                            <div className="text-2xl font-bold text-purple-500">{summary.positions_with_tsg}</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                    <Label>Ordenar por</Label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="profit-highest">Maior Lucro</SelectItem>
                            <SelectItem value="profit-lowest">Maior Perda</SelectItem>
                            <SelectItem value="tp-closest">Mais Próximo do TP</SelectItem>
                            <SelectItem value="sl-closest">Mais Próximo do SL</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-48" />
                    ))}
                </div>
            )}

            {/* Positions List */}
            {!isLoading && positions.length > 0 && (
                <div className="space-y-4">
                    {positions.map((pos) => (
                        <Card key={pos.id} className="overflow-hidden">
                            <CardContent className="p-4">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                    {/* Info Principal */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-lg">{pos.symbol}</span>
                                            <Badge variant={pos.pnl_pct >= 0 ? "default" : "destructive"}>
                                                {pos.pnl_pct >= 0 ? '+' : ''}{pos.pnl_pct.toFixed(2)}%
                                            </Badge>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Users className="h-3 w-3" />
                                                {pos.subscriber?.full_name || pos.subscriber?.email?.split('@')[0]}
                                            </div>
                                            {pos.lock_sell_by_webhook && (
                                                <Badge variant="outline" className="text-xs">🔒 Webhook Bloqueado</Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-4 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">Entrada:</span>{' '}
                                                <span className="font-medium">{formatCurrency(pos.price_open)}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Atual:</span>{' '}
                                                <span className="font-medium">{formatCurrency(pos.current_price)}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Valor:</span>{' '}
                                                <span className="font-medium">{formatCurrency(pos.invested_value_usd)}</span>
                                            </div>
                                            <div className={cn(pos.unrealized_pnl_usd >= 0 ? "text-green-500" : "text-red-500")}>
                                                <span className="text-muted-foreground">PnL:</span>{' '}
                                                <span className="font-medium">{formatCurrency(pos.unrealized_pnl_usd)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Indicadores */}
                                    <div className="flex flex-wrap gap-4 lg:gap-6">
                                        {/* Take Profit */}
                                        {pos.tp_enabled && (
                                            <div className="w-40 space-y-1">
                                                <div className="flex items-center gap-1 text-sm">
                                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                                    <span>Take Profit</span>
                                                    <span className="ml-auto font-medium">{pos.tp_pct}%</span>
                                                </div>
                                                <Progress 
                                                    value={Math.min(Math.max(pos.tp_proximity_pct || 0, 0), 100)} 
                                                    className="h-2 bg-green-200"
                                                />
                                                <div className="text-xs text-muted-foreground">
                                                    {pos.tp_proximity_pct?.toFixed(1)}% do caminho
                                                </div>
                                            </div>
                                        )}

                                        {/* Stop Loss */}
                                        {pos.sl_enabled && (
                                            <div className="w-40 space-y-1">
                                                <div className="flex items-center gap-1 text-sm">
                                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                                    <span>Stop Loss</span>
                                                    <span className="ml-auto font-medium">{pos.sl_pct}%</span>
                                                </div>
                                                <Progress 
                                                    value={Math.min(Math.max(pos.sl_proximity_pct || 0, 0), 100)} 
                                                    className="h-2 bg-red-200"
                                                />
                                                <div className="text-xs text-muted-foreground">
                                                    {pos.sl_proximity_pct?.toFixed(1)}% do caminho
                                                </div>
                                            </div>
                                        )}

                                        {/* Stop Gain */}
                                        {pos.sg_enabled && (
                                            <div className="w-40 space-y-1">
                                                <div className="flex items-center gap-1 text-sm">
                                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                                    <span>Stop Gain</span>
                                                    <span className="ml-auto font-medium">{pos.sg_pct}%</span>
                                                </div>
                                                <Progress 
                                                    value={Math.min(Math.max(pos.sg_proximity_pct || 0, 0), 100)} 
                                                    className="h-2 bg-yellow-200"
                                                />
                                                <div className="text-xs text-muted-foreground">
                                                    {pos.sg_triggered && <Badge variant="outline" className="text-xs">Triggered</Badge>}
                                                    {!pos.sg_triggered && `${pos.sg_proximity_pct?.toFixed(1)}% do caminho`}
                                                </div>
                                            </div>
                                        )}

                                        {/* Trailing Stop Gain */}
                                        {pos.tsg_enabled && pos.tsg_status && (
                                            <div className="w-40 space-y-1">
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Zap className="h-4 w-4 text-purple-500" />
                                                    <span>TSG</span>
                                                    <span className="ml-auto font-medium">{pos.tsg_status.activation_pct}%</span>
                                                </div>
                                                <Progress 
                                                    value={Math.min(Math.max(pos.tsg_status.proximity_to_activation || 0, 0), 100)} 
                                                    className="h-2 bg-purple-200"
                                                />
                                                <div className="text-xs text-muted-foreground">
                                                    {pos.tsg_status.is_activated 
                                                        ? <Badge variant="default" className="bg-purple-500 text-xs">Ativo</Badge>
                                                        : `${pos.tsg_status.proximity_to_activation?.toFixed(1)}% para ativar`
                                                    }
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Ações */}
                                    <div>
                                        <Link href={`/subscribers-admin/positions/${pos.id}`}>
                                            <Button variant="outline" size="sm">
                                                Ver Detalhes
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {!isLoading && positions.length === 0 && (
                <Card>
                    <CardContent className="p-12 text-center">
                        <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma posição com SL/TP encontrada</h3>
                        <p className="text-muted-foreground">
                            Não há posições de assinantes com Stop Loss ou Take Profit configurados no modo {tradeMode}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

