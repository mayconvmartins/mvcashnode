'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
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
    RefreshCw,
    BarChart3,
    PieChart,
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']

export default function DashboardPage() {
    const { tradeMode } = useTradeMode()
    
    const { data: dashboard, isLoading, refetch } = useQuery({
        queryKey: ['dashboard', 'detailed', tradeMode],
        queryFn: () => reportsService.getDetailedDashboardSummary(tradeMode),
        refetchInterval: 30000, // Atualizar a cada 30 segundos
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(7)].map((_, i) => (
                        <Skeleton key={i} className="h-32" />
                    ))}
                </div>
                <Skeleton className="h-[300px]" />
            </div>
        )
    }

    if (!dashboard) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
                <p className="text-muted-foreground">Carregando dados...</p>
            </div>
        )
    }

    const formatCurrency = (value: number) => `$${value.toFixed(2)}`
    const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`

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

            {/* Cards de Resumo Principal */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Total de Posições"
                    value={`${dashboard.totalPositions}`}
                    description={`${dashboard.openPositions} abertas • ${dashboard.closedPositions} fechadas`}
                    icon={Target}
                    formatAsCurrency={false}
                />
                <StatsCard
                    title="Investimento Total"
                    value={formatCurrency(dashboard.totalInvestment)}
                    description="Em posições abertas"
                    icon={Wallet}
                />
                <StatsCard
                    title="P&L Total"
                    value={formatCurrency(dashboard.totalPnL)}
                    description={`${formatCurrency(dashboard.realizedPnL)} realizado • ${formatCurrency(dashboard.unrealizedPnL)} não realizado`}
                    icon={dashboard.totalPnL >= 0 ? TrendingUp : TrendingDown}
                    className={dashboard.totalPnL >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="Capital Investido"
                    value={formatCurrency(dashboard.capitalInvested)}
                    description={`Usado nas ${dashboard.totalPositions} operações do período`}
                    icon={DollarSign}
                />
            </div>

            {/* Cards de ROI */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatsCard
                    title="ROI Acumulado"
                    value={formatPercent(dashboard.roiAccumulated)}
                    description="Retorno sobre investimento"
                    icon={LineChart}
                    className={dashboard.roiAccumulated >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="ROI Realizado"
                    value={formatPercent(dashboard.roiRealized)}
                    description={`Retorno de ${dashboard.closedPositions} posições fechadas`}
                    icon={TrendingUpIcon}
                    className={dashboard.roiRealized >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="ROI Não Realizado"
                    value={formatPercent(dashboard.roiUnrealized)}
                    description={`Retorno de ${dashboard.openPositions} posições abertas`}
                    icon={TrendingDownIcon}
                    className={dashboard.roiUnrealized >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
            </div>

            {/* Performance por Símbolo */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="glass">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-green-500" />
                            Mais Lucrativos
                        </CardTitle>
                        <CardDescription>Top 5 símbolos com maior lucro</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {dashboard.topProfitable.length > 0 ? (
                            <div className="space-y-3">
                                {dashboard.topProfitable.map((item, index) => (
                                    <div key={item.symbol} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-500 font-bold">
                                                #{index + 1}
                                            </div>
                                            <div>
                                                <p className="font-medium">{item.symbol}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-green-500">{formatCurrency(item.pnl)}</p>
                                            <p className="text-xs text-muted-foreground">{formatPercent(item.pnlPct)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>Nenhum símbolo lucrativo no período</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingDown className="h-5 w-5 text-red-500" />
                            Maior Prejuízo
                        </CardTitle>
                        <CardDescription>Top 5 símbolos com maior prejuízo</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {dashboard.topLosses.length > 0 ? (
                            <div className="space-y-3">
                                {dashboard.topLosses.map((item, index) => (
                                    <div key={item.symbol} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-500 font-bold">
                                                #{index + 1}
                                            </div>
                                            <div>
                                                <p className="font-medium">{item.symbol}</p>
                                            </div>
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
                                <p>Nenhum símbolo com prejuízo no período</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* SL/TP vs Webhook */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        SL/TP vs Webhook
                    </CardTitle>
                    <CardDescription>Comparação de performance entre tipos</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-green-500/5">
                                <div>
                                    <p className="font-semibold">SL/TP</p>
                                    <p className="text-sm text-muted-foreground">{dashboard.sltpVsWebhook.sltp.positions} operações</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold">{dashboard.sltpVsWebhook.sltp.successRate.toFixed(1)}%</p>
                                    <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">P&L Médio</p>
                                    <p className="text-lg font-semibold">{formatCurrency(dashboard.sltpVsWebhook.sltp.avgPnL)}</p>
                                </div>
                                <div className="p-3 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">ROI</p>
                                    <p className="text-lg font-semibold">{formatPercent(dashboard.sltpVsWebhook.sltp.roi)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-500/5">
                                <div>
                                    <p className="font-semibold">Webhook</p>
                                    <p className="text-sm text-muted-foreground">{dashboard.sltpVsWebhook.webhook.positions} operações</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold">{dashboard.sltpVsWebhook.webhook.successRate.toFixed(1)}%</p>
                                    <p className="text-xs text-muted-foreground">Taxa de Sucesso</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">P&L Médio</p>
                                    <p className="text-lg font-semibold">{formatCurrency(dashboard.sltpVsWebhook.webhook.avgPnL)}</p>
                                </div>
                                <div className="p-3 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">ROI</p>
                                    <p className="text-lg font-semibold">{formatPercent(dashboard.sltpVsWebhook.webhook.roi)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Estatísticas SL/TP */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Estatísticas SL/TP
                    </CardTitle>
                    <CardDescription>Performance do sistema de venda automática</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">Posições Ativas</p>
                            <p className="text-2xl font-bold">{dashboard.sltpStats.activePositions}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">Posições Fechadas</p>
                            <p className="text-2xl font-bold">{dashboard.sltpStats.closedPositions}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">P&L SL/TP</p>
                            <p className={`text-2xl font-bold ${dashboard.sltpStats.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatCurrency(dashboard.sltpStats.pnl)}
                            </p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground">ROI das operações</p>
                            <p className={`text-2xl font-bold ${dashboard.sltpStats.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatPercent(dashboard.sltpStats.roi)}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Gráficos */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Evolução do P&L Acumulado */}
                <Card className="glass">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <LineChart className="h-5 w-5 text-primary" />
                            Evolução do P&L Acumulado
                        </CardTitle>
                        <CardDescription>P&L realizado acumulado ao longo do período</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {dashboard.pnlEvolution.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <RechartsLineChart data={dashboard.pnlEvolution}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis 
                                        dataKey="date" 
                                        tickFormatter={(value) => {
                                            const date = new Date(value)
                                            return `${date.getDate()}/${date.getMonth() + 1}`
                                        }}
                                    />
                                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                                    <Tooltip 
                                        formatter={(value: number) => formatCurrency(value)}
                                        labelFormatter={(label) => {
                                            const date = new Date(label)
                                            return date.toLocaleDateString('pt-BR')
                                        }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="pnl" 
                                        stroke="#10b981" 
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </RechartsLineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                <p>Nenhum dado disponível</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Posições por Símbolo */}
                <Card className="glass">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" />
                            Posições por Símbolo
                        </CardTitle>
                        <CardDescription>Distribuição de posições abertas e fechadas</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {dashboard.positionsBySymbol.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={dashboard.positionsBySymbol}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="symbol" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="open" fill="#10b981" name="Abertas" />
                                    <Bar dataKey="closed" fill="#3b82f6" name="Fechadas" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                                <p>Nenhum dado disponível</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Composição do P&L */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PieChart className="h-5 w-5 text-primary" />
                        Composição do P&L
                    </CardTitle>
                    <CardDescription>Breakdown entre realizado e não realizado</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="flex items-center justify-center">
                            {dashboard.realizedPnL !== 0 || dashboard.unrealizedPnL !== 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <RechartsPieChart>
                                        <Pie
                                            data={[
                                                { name: 'P&L Realizado', value: Math.abs(dashboard.realizedPnL) },
                                                { name: 'P&L Não Realizado', value: Math.abs(dashboard.unrealizedPnL) }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            <Cell fill="#10b981" />
                                            <Cell fill="#3b82f6" />
                                        </Pie>
                                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                                    <p>Nenhum dado disponível</p>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col justify-center space-y-4">
                            <div className="flex items-center gap-3 p-4 border rounded-lg">
                                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                                <div className="flex-1">
                                    <p className="font-medium">P&L Realizado</p>
                                    <p className="text-sm text-muted-foreground">Posições fechadas</p>
                                </div>
                                <p className="text-lg font-semibold text-green-500">{formatCurrency(dashboard.realizedPnL)}</p>
                            </div>
                            <div className="flex items-center gap-3 p-4 border rounded-lg">
                                <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                                <div className="flex-1">
                                    <p className="font-medium">P&L Não Realizado</p>
                                    <p className="text-sm text-muted-foreground">Posições abertas</p>
                                </div>
                                <p className={`text-lg font-semibold ${dashboard.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
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
