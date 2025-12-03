'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { positionsService } from '@/lib/api/positions.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
    TrendingUp, 
    TrendingDown,
    Target, 
    DollarSign, 
    Activity,
    Wallet,
    Webhook,
    LineChart,
    ArrowRight,
    RefreshCw
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils/format'
import { useTradeMode } from '@/lib/hooks/useTradeMode'

export default function DashboardPage() {
    const { tradeMode } = useTradeMode()
    
    const { data: summary, isLoading, refetch } = useQuery({
        queryKey: ['dashboard', 'summary', tradeMode],
        queryFn: () => reportsService.getDashboardSummary(tradeMode),
        refetchInterval: 30000, // Atualizar a cada 30 segundos
    })

    // Buscar posições abertas recentes
    const { data: recentPositions } = useQuery({
        queryKey: ['positions', 'recent', tradeMode],
        queryFn: () => positionsService.list({ status: 'OPEN', trade_mode: tradeMode, limit: 5 }),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
                <Skeleton className="h-[300px]" />
            </div>
        )
    }

    const positions = recentPositions?.data || recentPositions || []

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
                    <p className="text-muted-foreground">Visão geral do seu sistema de trading</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Posições Abertas"
                    value={summary?.openPositions || 0}
                    icon={Target}
                    trend={summary?.positionsTrend}
                />
                <StatsCard
                    title="PnL do Dia"
                    value={`$${(summary?.dailyPnL || 0).toFixed(2)}`}
                    icon={summary?.dailyPnL && summary.dailyPnL >= 0 ? TrendingUp : TrendingDown}
                    trend={summary?.pnlTrend}
                    className={summary?.dailyPnL && summary.dailyPnL >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="Lucro Total"
                    value={`$${(summary?.totalBalance || 0).toFixed(2)}`}
                    icon={DollarSign}
                />
                <StatsCard
                    title="Contas Ativas"
                    value={summary?.activeAccounts || 0}
                    icon={Activity}
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Posições Recentes */}
                <Card className="glass">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <LineChart className="h-5 w-5 text-primary" />
                                Posições Abertas
                            </CardTitle>
                            <CardDescription>Suas posições mais recentes</CardDescription>
                        </div>
                        <Link href="/positions">
                            <Button variant="ghost" size="sm">
                                Ver todas
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {Array.isArray(positions) && positions.length > 0 ? (
                            <div className="space-y-3">
                                {positions.slice(0, 5).map((position: any) => (
                                    <div 
                                        key={position.id}
                                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${
                                                position.side === 'LONG' 
                                                    ? 'bg-green-500/10 text-green-500' 
                                                    : 'bg-red-500/10 text-red-500'
                                            }`}>
                                                {position.side === 'LONG' ? (
                                                    <TrendingUp className="h-4 w-4" />
                                                ) : (
                                                    <TrendingDown className="h-4 w-4" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium">{position.symbol}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {position.qty_remaining} @ ${position.price_open}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge 
                                                variant={position.status === 'OPEN' ? 'default' : 'secondary'}
                                                className={position.status === 'OPEN' ? 'bg-green-500' : ''}
                                            >
                                                {position.status}
                                            </Badge>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {position.trade_mode}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>Nenhuma posição aberta</p>
                                <p className="text-sm mt-2">Configure seus webhooks para começar a operar</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="glass">
                    <CardHeader>
                        <CardTitle>Acesso Rápido</CardTitle>
                        <CardDescription>Navegue rapidamente pelas principais funcionalidades</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <Link href="/accounts">
                                <div className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                    <Wallet className="h-8 w-8 mb-2 text-blue-500" />
                                    <span className="text-sm font-medium">Contas</span>
                                    <span className="text-xs text-muted-foreground">Gerenciar exchanges</span>
                                </div>
                            </Link>
                            <Link href="/webhooks">
                                <div className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                    <Webhook className="h-8 w-8 mb-2 text-purple-500" />
                                    <span className="text-sm font-medium">Webhooks</span>
                                    <span className="text-xs text-muted-foreground">Configurar sinais</span>
                                </div>
                            </Link>
                            <Link href="/positions">
                                <div className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                    <LineChart className="h-8 w-8 mb-2 text-green-500" />
                                    <span className="text-sm font-medium">Posições</span>
                                    <span className="text-xs text-muted-foreground">Ver operações</span>
                                </div>
                            </Link>
                            <Link href="/reports">
                                <div className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
                                    <DollarSign className="h-8 w-8 mb-2 text-yellow-500" />
                                    <span className="text-sm font-medium">Relatórios</span>
                                    <span className="text-xs text-muted-foreground">Análise de PnL</span>
                                </div>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Info Card */}
            <Card className="glass border-primary/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Trading Automation System
                    </CardTitle>
                    <CardDescription>
                        Sistema completo de automação de trading com webhooks, gestão de posições e muito mais
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-blue-500/10">
                                <Webhook className="h-4 w-4 text-blue-500" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Webhooks</p>
                                <p className="text-xs text-muted-foreground">
                                    Receba sinais do TradingView e execute automaticamente
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-green-500/10">
                                <Target className="h-4 w-4 text-green-500" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">SL/TP Automático</p>
                                <p className="text-xs text-muted-foreground">
                                    Stop Loss e Take Profit monitorados 24/7
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-purple-500/10">
                                <DollarSign className="h-4 w-4 text-purple-500" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Cofres Virtuais</p>
                                <p className="text-xs text-muted-foreground">
                                    Gerencie capital com controle total
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
