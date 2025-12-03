'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { apiClient } from '@/lib/api/client'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { TrendingUp, TrendingDown, Target, Award } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'

export default function PnLReportPage() {
    const { tradeMode } = useTradeMode()

    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: ['reports', 'pnl', 'summary', tradeMode],
        queryFn: async () => {
            const response = await apiClient.get('/reports/pnl/summary', { params: { trade_mode: tradeMode } })
            return response.data // Interceptor já extraiu o data
        },
    })

    const { data: byDay, isLoading: loadingByDay } = useQuery({
        queryKey: ['reports', 'pnl', 'by-day', tradeMode],
        queryFn: async () => {
            const response = await apiClient.get('/reports/pnl/by-day', { params: { trade_mode: tradeMode } })
            return response.data // Interceptor já extraiu o data
        },
    })

    const { data: bySymbol, isLoading: loadingBySymbol } = useQuery({
        queryKey: ['reports', 'pnl', 'by-symbol', tradeMode],
        queryFn: async () => {
            const response = await apiClient.get('/reports/pnl/by-symbol', { params: { trade_mode: tradeMode } })
            return response.data // Interceptor já extraiu o data
        },
    })

    const columns: Column<any>[] = [
        { key: 'symbol', label: 'Símbolo', render: (row) => <span className="font-mono">{row.symbol}</span> },
        { key: 'trades', label: 'Trades', render: (row) => <span>{row.trades}</span> },
        { key: 'pnl_usd', label: 'PnL', render: (row) => <PnLBadge value={row.pnl_usd} /> },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Relatório de PnL</h1>
                    <p className="text-muted-foreground mt-1">Análise de lucros e prejuízos</p>
                </div>
                <ModeToggle />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard title="PnL Total" value={summary?.netPnL || 0} icon={TrendingUp} loading={loadingSummary} />
                <StatsCard title="Total de Trades" value={summary?.totalTrades?.toString() || '0'} icon={Target} loading={loadingSummary} />
                <StatsCard title="Taxa de Acerto" value={summary ? `${summary.winRate.toFixed(1)}%` : '0%'} icon={Award} loading={loadingSummary} />
                <StatsCard title="PnL Realizado" value={summary?.realizedPnL || 0} icon={TrendingUp} loading={loadingSummary} />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>PnL por Dia (Últimos 30 dias)</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingByDay ? (
                        <div className="flex items-center justify-center h-[300px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !byDay || byDay.length === 0 ? (
                        <div className="flex items-center justify-center h-[300px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={byDay}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                                <YAxis stroke="hsl(var(--muted-foreground))" />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                                <Line type="monotone" dataKey="pnl_usd" stroke="hsl(var(--primary))" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>PnL por Símbolo</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingBySymbol ? (
                        <div className="flex items-center justify-center h-[200px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !bySymbol || bySymbol.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <DataTable data={bySymbol} columns={columns} loading={false} />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

