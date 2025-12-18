'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subscriberService, PeriodOption } from '@/lib/api/subscriber.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
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
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    Calendar
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts'

export default function SubscriberDashboardPage() {
    const { tradeMode } = useTradeMode()
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('today')
    
    const { data: dashboard, isLoading, refetch } = useQuery({
        queryKey: ['subscriber-dashboard', tradeMode, selectedPeriod],
        queryFn: () => subscriberService.getDashboard(tradeMode, selectedPeriod),
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

    const formatCurrency = (value: number) => `$${value?.toFixed(2) || '0.00'}`
    const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value?.toFixed(2) || '0.00'}%`

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
                    <p className="text-muted-foreground">Visão geral das suas posições</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as PeriodOption)}>
                        <SelectTrigger className="w-[180px]">
                            <Calendar className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Selecione o período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="last7days">Últimos 7 dias</SelectItem>
                            <SelectItem value="currentMonth">Mês atual</SelectItem>
                            <SelectItem value="previousMonth">Mês anterior</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Cards de Resumo Principal */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title="Total de Posições"
                    value={`${dashboard.totalPositions || 0}`}
                    description={`${dashboard.openPositions || 0} abertas • ${dashboard.closedPositions || 0} fechadas`}
                    icon={Target}
                    formatAsCurrency={false}
                />
                <StatsCard
                    title="Investimento Total"
                    value={formatCurrency(dashboard.totalInvestment || 0)}
                    description="Em posições abertas"
                    icon={Wallet}
                />
                <StatsCard
                    title="P&L Total"
                    value={formatCurrency(dashboard.totalPnL || 0)}
                    description={`${formatCurrency(dashboard.realizedPnL || 0)} realizado • ${formatCurrency(dashboard.unrealizedPnL || 0)} não realizado`}
                    icon={(dashboard.totalPnL || 0) >= 0 ? TrendingUp : TrendingDown}
                    className={(dashboard.totalPnL || 0) >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="Capital Investido"
                    value={formatCurrency(dashboard.capitalInvested || 0)}
                    description={`Usado nas ${dashboard.totalPositions || 0} operações do período`}
                    icon={DollarSign}
                />
            </div>

            {/* Cards de ROI */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatsCard
                    title="ROI Acumulado"
                    value={formatPercent(dashboard.roiAccumulated || 0)}
                    description="Retorno sobre investimento"
                    icon={LineChart}
                    className={(dashboard.roiAccumulated || 0) >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="ROI Realizado"
                    value={formatPercent(dashboard.roiRealized || 0)}
                    description={`Retorno de ${dashboard.closedPositions || 0} posições fechadas`}
                    icon={TrendingUpIcon}
                    className={(dashboard.roiRealized || 0) >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
                />
                <StatsCard
                    title="ROI Não Realizado"
                    value={formatPercent(dashboard.roiUnrealized || 0)}
                    description={`Retorno de ${dashboard.openPositions || 0} posições abertas`}
                    icon={TrendingDownIcon}
                    className={(dashboard.roiUnrealized || 0) >= 0 ? 'border-green-500/20' : 'border-red-500/20'}
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
                        {(dashboard.topProfitable?.length || 0) > 0 ? (
                            <div className="space-y-3">
                                {dashboard.topProfitable?.map((item, index) => (
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
                        {(dashboard.topLosses?.length || 0) > 0 ? (
                            <div className="space-y-3">
                                {dashboard.topLosses?.map((item, index) => (
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

            {/* Gráficos */}
            <div className="grid gap-6 lg:grid-cols-2">
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
                        {(dashboard.positionsBySymbol?.length || 0) > 0 ? (
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
                                {(dashboard.realizedPnL !== 0 || dashboard.unrealizedPnL !== 0) ? (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <RechartsPieChart>
                                            <Pie
                                                data={[
                                                    { name: 'P&L Realizado', value: Math.abs(dashboard.realizedPnL || 0) },
                                                    { name: 'P&L Não Realizado', value: Math.abs(dashboard.unrealizedPnL || 0) }
                                                ]}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => percent !== undefined ? `${(percent * 100).toFixed(0)}%` : name}
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
                                    <p className="text-lg font-semibold text-green-500">{formatCurrency(dashboard.realizedPnL || 0)}</p>
                                </div>
                                <div className="flex items-center gap-3 p-4 border rounded-lg">
                                    <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                                    <div className="flex-1">
                                        <p className="font-medium">P&L Não Realizado</p>
                                        <p className="text-sm text-muted-foreground">Posições abertas</p>
                                    </div>
                                    <p className={`text-lg font-semibold ${(dashboard.unrealizedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {formatCurrency(dashboard.unrealizedPnL || 0)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

