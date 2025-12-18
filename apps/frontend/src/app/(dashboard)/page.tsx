'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard, StatsGrid, StatsCardSkeleton } from '@/components/shared/StatsCard'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
    TrendingUp, 
    TrendingDown,
    Target, 
    DollarSign, 
    Wallet,
    LineChart,
    RefreshCw,
    BarChart3,
    PieChart,
    Calendar,
    Activity,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { useAuthStore } from '@/lib/stores/authStore'
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts'
import { cn } from '@/lib/utils'

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']

type PeriodOption = 'today' | 'last7days' | 'currentMonth' | 'previousMonth'

// Helper para calcular datas baseado no período
const getPeriodDates = (period: PeriodOption): { from: Date; to: Date } => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    switch (period) {
        case 'today':
            return {
                from: new Date(today),
                to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
            }
        case 'last7days':
            const sevenDaysAgo = new Date(today)
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
            return {
                from: new Date(sevenDaysAgo),
                to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
            }
        case 'currentMonth':
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
            return {
                from: new Date(firstDayOfMonth),
                to: new Date(lastDayOfMonth),
            }
        case 'previousMonth':
            const firstDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
            return {
                from: new Date(firstDayOfPreviousMonth),
                to: new Date(lastDayOfPreviousMonth),
            }
        default:
            return {
                from: new Date(today),
                to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
            }
    }
}

const periodLabels: Record<PeriodOption, string> = {
    today: 'Hoje',
    last7days: 'Últimos 7 dias',
    currentMonth: 'Mês atual',
    previousMonth: 'Mês anterior',
}

export default function DashboardPage() {
    const router = useRouter()
    const { user } = useAuthStore()
    const { tradeMode } = useTradeMode()
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('today')
    
    // Verificar se é assinante e redirecionar para dashboard de assinante
    const isSubscriber = user?.roles?.some((r: any) => r.role === 'subscriber')
    const isAdmin = user?.roles?.some((r: any) => r.role === 'admin')
    
    useEffect(() => {
        if (isSubscriber && !isAdmin) {
            router.replace('/subscriber-dashboard')
        }
    }, [isSubscriber, isAdmin, router])
    
    const { from, to } = useMemo(() => getPeriodDates(selectedPeriod), [selectedPeriod])
    
    const { data: dashboard, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['dashboard', 'detailed', tradeMode, selectedPeriod],
        queryFn: () => reportsService.getDetailedDashboardSummary(tradeMode, from, to),
        refetchInterval: 30000,
        enabled: !isSubscriber || isAdmin,
    })

    const formatCurrency = (value: number) => `$${value.toFixed(2)}`
    const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

    if (isLoading) {
        return (
            <div className="space-y-6 animate-fade-in">
                {/* Header Skeleton */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-10 w-[180px]" />
                        <Skeleton className="h-10 w-24" />
                    </div>
                </div>
                
                {/* Stats Skeleton */}
                <StatsGrid columns={4}>
                    {[...Array(4)].map((_, i) => (
                        <StatsCardSkeleton key={i} />
                    ))}
                </StatsGrid>
                
                <StatsGrid columns={3}>
                    {[...Array(3)].map((_, i) => (
                        <StatsCardSkeleton key={i} />
                    ))}
                </StatsGrid>
                
                {/* Charts Skeleton */}
                <div className="grid gap-6 lg:grid-cols-2">
                    <Skeleton className="h-[400px] rounded-xl" />
                    <Skeleton className="h-[400px] rounded-xl" />
                </div>
            </div>
        )
    }

    if (!dashboard) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Activity className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Carregando Dashboard</h2>
                <p className="text-muted-foreground">Aguarde enquanto carregamos seus dados...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                        <span className="gradient-text">Dashboard</span>
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Visão geral do seu sistema de trading • {periodLabels[selectedPeriod]}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as PeriodOption)}>
                        <SelectTrigger className="w-[160px] sm:w-[180px]">
                            <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="last7days">Últimos 7 dias</SelectItem>
                            <SelectItem value="currentMonth">Mês atual</SelectItem>
                            <SelectItem value="previousMonth">Mês anterior</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Cards de Resumo Principal */}
            <StatsGrid columns={4}>
                <StatsCard
                    title="Total de Posições"
                    value={dashboard.totalPositions}
                    description={`${dashboard.openPositions} abertas • ${dashboard.closedPositions} fechadas`}
                    icon={Target}
                    formatAsCurrency={false}
                    variant="gradient"
                />
                <StatsCard
                    title="Investimento Total"
                    value={dashboard.totalInvestment}
                    description="Em posições abertas"
                    icon={Wallet}
                    variant="gradient"
                />
                <StatsCard
                    title="P&L Total"
                    value={dashboard.totalPnL}
                    description={`${formatCurrency(dashboard.realizedPnL)} realizado`}
                    icon={dashboard.totalPnL >= 0 ? TrendingUp : TrendingDown}
                    trend={dashboard.totalPnL >= 0 ? 'up' : 'down'}
                    variant="gradient"
                />
                <StatsCard
                    title="Capital Investido"
                    value={dashboard.capitalInvested}
                    description={`${dashboard.totalPositions} operações no período`}
                    icon={DollarSign}
                    variant="gradient"
                />
            </StatsGrid>

            {/* Cards de ROI */}
            <StatsGrid columns={3}>
                <StatsCard
                    title="ROI Acumulado"
                    value={formatPercent(dashboard.roiAccumulated)}
                    description="Retorno sobre investimento"
                    icon={LineChart}
                    trend={dashboard.roiAccumulated >= 0 ? 'up' : 'down'}
                    formatAsCurrency={false}
                />
                <StatsCard
                    title="ROI Realizado"
                    value={formatPercent(dashboard.roiRealized)}
                    description={`${dashboard.closedPositions} posições fechadas`}
                    icon={TrendingUp}
                    trend={dashboard.roiRealized >= 0 ? 'up' : 'down'}
                    formatAsCurrency={false}
                />
                <StatsCard
                    title="ROI Não Realizado"
                    value={formatPercent(dashboard.roiUnrealized)}
                    description={`${dashboard.openPositions} posições abertas`}
                    icon={TrendingDown}
                    trend={dashboard.roiUnrealized >= 0 ? 'up' : 'down'}
                    formatAsCurrency={false}
                />
            </StatsGrid>

            {/* Performance por Símbolo */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                            </div>
                            Mais Lucrativos
                        </CardTitle>
                        <CardDescription>Top 5 símbolos com maior lucro</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {dashboard.topProfitable.length > 0 ? (
                            <div className="space-y-2">
                                {dashboard.topProfitable.map((item, index) => (
                                    <div 
                                        key={item.symbol} 
                                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-500 text-sm font-bold">
                                                {index + 1}
                                            </div>
                                            <span className="font-medium">{item.symbol}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-emerald-500">{formatCurrency(item.pnl)}</p>
                                            <p className="text-xs text-muted-foreground">{formatPercent(item.pnlPct)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Nenhum símbolo lucrativo no período</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                                <TrendingDown className="h-4 w-4 text-red-500" />
                            </div>
                            Maior Prejuízo
                        </CardTitle>
                        <CardDescription>Top 5 símbolos com maior prejuízo</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {dashboard.topLosses.length > 0 ? (
                            <div className="space-y-2">
                                {dashboard.topLosses.map((item, index) => (
                                    <div 
                                        key={item.symbol} 
                                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500/10 text-red-500 text-sm font-bold">
                                                {index + 1}
                                            </div>
                                            <span className="font-medium">{item.symbol}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-red-500">{formatCurrency(item.pnl)}</p>
                                            <p className="text-xs text-muted-foreground">{formatPercent(item.pnlPct)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <TrendingDown className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Nenhum símbolo com prejuízo no período</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* SL/TP vs Webhook */}
            <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <BarChart3 className="h-4 w-4 text-primary" />
                        </div>
                        SL/TP vs Webhook
                    </CardTitle>
                    <CardDescription>Comparação de performance entre tipos de operação</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* SL/TP */}
                        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-emerald-500">SL/TP</p>
                                    <p className="text-sm text-muted-foreground">{dashboard.sltpVsWebhook.sltp.positions} operações</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold">{dashboard.sltpVsWebhook.sltp.successRate.toFixed(1)}%</p>
                                    <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-background/80">
                                    <p className="text-xs text-muted-foreground">P&L Médio</p>
                                    <p className="text-lg font-semibold">{formatCurrency(dashboard.sltpVsWebhook.sltp.avgPnL)}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-background/80">
                                    <p className="text-xs text-muted-foreground">ROI</p>
                                    <p className="text-lg font-semibold">{formatPercent(dashboard.sltpVsWebhook.sltp.roi)}</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Webhook */}
                        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-blue-500">Webhook</p>
                                    <p className="text-sm text-muted-foreground">{dashboard.sltpVsWebhook.webhook.positions} operações</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold">{dashboard.sltpVsWebhook.webhook.successRate.toFixed(1)}%</p>
                                    <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-background/80">
                                    <p className="text-xs text-muted-foreground">P&L Médio</p>
                                    <p className="text-lg font-semibold">{formatCurrency(dashboard.sltpVsWebhook.webhook.avgPnL)}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-background/80">
                                    <p className="text-xs text-muted-foreground">ROI</p>
                                    <p className="text-lg font-semibold">{formatPercent(dashboard.sltpVsWebhook.webhook.roi)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Estatísticas SL/TP */}
            <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Target className="h-4 w-4 text-primary" />
                        </div>
                        Estatísticas SL/TP
                    </CardTitle>
                    <CardDescription>Performance do sistema de venda automática</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="p-4 rounded-xl bg-muted/30">
                            <p className="text-sm text-muted-foreground">Posições Ativas</p>
                            <p className="text-2xl font-bold">{dashboard.sltpStats.activePositions}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-muted/30">
                            <p className="text-sm text-muted-foreground">Posições Fechadas</p>
                            <p className="text-2xl font-bold">{dashboard.sltpStats.closedPositions}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-muted/30">
                            <p className="text-sm text-muted-foreground">P&L SL/TP</p>
                            <p className={cn(
                                "text-2xl font-bold",
                                dashboard.sltpStats.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'
                            )}>
                                {formatCurrency(dashboard.sltpStats.pnl)}
                            </p>
                        </div>
                        <div className="p-4 rounded-xl bg-muted/30">
                            <p className="text-sm text-muted-foreground">ROI das operações</p>
                            <p className={cn(
                                "text-2xl font-bold",
                                dashboard.sltpStats.roi >= 0 ? 'text-emerald-500' : 'text-red-500'
                            )}>
                                {formatPercent(dashboard.sltpStats.roi)}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Gráficos */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Evolução do P&L */}
                <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <LineChart className="h-4 w-4 text-primary" />
                            </div>
                            Evolução do P&L
                        </CardTitle>
                        <CardDescription>P&L realizado acumulado ao longo do período</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {dashboard.pnlEvolution.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <RechartsLineChart data={dashboard.pnlEvolution}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis 
                                        dataKey="date" 
                                        tickFormatter={(value) => {
                                            const date = new Date(value)
                                            return `${date.getDate()}/${date.getMonth() + 1}`
                                        }}
                                        className="text-xs"
                                    />
                                    <YAxis tickFormatter={(value) => `$${value}`} className="text-xs" />
                                    <Tooltip 
                                        formatter={(value: number) => formatCurrency(value)}
                                        labelFormatter={(label) => {
                                            const date = new Date(label)
                                            return date.toLocaleDateString('pt-BR')
                                        }}
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--card))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: '8px',
                                        }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="pnl" 
                                        stroke="hsl(var(--primary))" 
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                                        activeDot={{ r: 5 }}
                                    />
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                                <LineChart className="h-12 w-12 mb-2 opacity-30" />
                                <p className="text-sm">Nenhum dado disponível</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Posições por Símbolo */}
                <Card className="overflow-hidden">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <BarChart3 className="h-4 w-4 text-primary" />
                            </div>
                            Posições por Símbolo
                        </CardTitle>
                        <CardDescription>Distribuição de posições abertas e fechadas</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {dashboard.positionsBySymbol.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={dashboard.positionsBySymbol}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="symbol" className="text-xs" />
                                    <YAxis className="text-xs" />
                                    <Tooltip 
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--card))',
                                            border: '1px solid hsl(var(--border))',
                                            borderRadius: '8px',
                                        }}
                                    />
                                    <Legend />
                                    <Bar dataKey="open" fill="#10b981" name="Abertas" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="closed" fill="#3b82f6" name="Fechadas" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                                <BarChart3 className="h-12 w-12 mb-2 opacity-30" />
                                <p className="text-sm">Nenhum dado disponível</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Composição do P&L */}
            <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <PieChart className="h-4 w-4 text-primary" />
                        </div>
                        Composição do P&L
                    </CardTitle>
                    <CardDescription>Breakdown entre realizado e não realizado</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="grid gap-6 md:grid-cols-2 items-center">
                        <div className="flex items-center justify-center">
                            {dashboard.realizedPnL !== 0 || dashboard.unrealizedPnL !== 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <RechartsPieChart>
                                        <Pie
                                            data={[
                                                { name: 'Realizado', value: Math.abs(dashboard.realizedPnL) },
                                                { name: 'Não Realizado', value: Math.abs(dashboard.unrealizedPnL) }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            <Cell fill="#10b981" />
                                            <Cell fill="#3b82f6" />
                                        </Pie>
                                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <PieChart className="h-12 w-12 mb-2 opacity-30" />
                                    <p className="text-sm">Nenhum dado disponível</p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                <div className="flex-1">
                                    <p className="font-medium">P&L Realizado</p>
                                    <p className="text-xs text-muted-foreground">Posições fechadas</p>
                                </div>
                                <p className="text-lg font-bold text-emerald-500">{formatCurrency(dashboard.realizedPnL)}</p>
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                                <div className="w-3 h-3 rounded-full bg-blue-500" />
                                <div className="flex-1">
                                    <p className="font-medium">P&L Não Realizado</p>
                                    <p className="text-xs text-muted-foreground">Posições abertas</p>
                                </div>
                                <p className={cn(
                                    "text-lg font-bold",
                                    dashboard.unrealizedPnL >= 0 ? 'text-emerald-500' : 'text-red-500'
                                )}>
                                    {formatCurrency(dashboard.unrealizedPnL)}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
