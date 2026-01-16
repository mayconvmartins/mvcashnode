'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { reportsService } from '@/lib/api/reports.service'
import { adminService } from '@/lib/api/admin.service'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Filter, BarChart3, Table2, ArrowLeft } from 'lucide-react'
import { TrendingUp, TrendingDown, Target, Award } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'
import Link from 'next/link'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function SubscriberPnLReportPage() {
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('ALL')
    const [filtersOpen, setFiltersOpen] = useState(true)
    const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
    
    // Inicializar datas para last30days
    useEffect(() => {
        if (datePreset === 'last30days' && !dateFrom && !dateTo) {
            const today = new Date()
            const last30Days = new Date(today)
            last30Days.setDate(last30Days.getDate() - 30)
            setDateFrom(last30Days.toISOString())
            setDateTo(today.toISOString())
        }
    }, [])

    // Buscar lista de assinantes
    const { data: subscribers } = useQuery({
        queryKey: ['admin', 'subscribers'],
        queryFn: () => adminService.listSubscribers(),
    })

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { trade_mode: 'REAL' } // Assinantes só operam em modo REAL
        if (dateFrom) f.from = dateFrom
        if (dateTo) f.to = dateTo
        if (selectedSubscriber !== 'ALL') {
            f.user_id = parseInt(selectedSubscriber)
        }
        return f
    }, [dateFrom, dateTo, selectedSubscriber])

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: ['reports', 'pnl', 'summary', 'admin', filters],
        queryFn: () => reportsService.getPnLSummary(filters),
    })

    const { data: byDay, isLoading: loadingByDay } = useQuery({
        queryKey: ['reports', 'pnl', 'by-day', 'admin', filters],
        queryFn: () => reportsService.getPnLByDay(filters),
    })

    const { data: bySymbol, isLoading: loadingBySymbol } = useQuery({
        queryKey: ['reports', 'pnl', 'by-symbol', 'admin', filters],
        queryFn: () => reportsService.getPnLBySymbol(filters),
    })

    // Colunas para tabela de PnL por símbolo
    const symbolColumns: Column<any>[] = [
        { key: 'symbol', label: 'Símbolo' },
        {
            key: 'pnl_usd',
            label: 'PnL Total',
            render: (row) => <PnLBadge value={row.pnl_usd} />,
        },
        { key: 'trades', label: 'Total Trades' },
        { key: 'win_rate', label: 'Win Rate', render: (row) => `${((row.win_rate || 0) * 100).toFixed(1)}%` },
        {
            key: 'avg_pnl',
            label: 'PnL Médio',
            render: (row) => <PnLBadge value={row.trades ? (row.pnl_usd / row.trades) : 0} />,
        },
    ]

    // Calcular PnL acumulado a partir dos dados
    const byDayWithCumulative = useMemo(() => {
        if (!byDay) return []
        let cumulative = 0
        return byDay.map((day: any) => {
            cumulative += day.pnl_usd || 0
            return {
                ...day,
                cumulative_pnl: cumulative,
            }
        })
    }, [byDay])

    // Colunas para tabela de PnL por dia
    const dayColumns: Column<any>[] = [
        { key: 'date', label: 'Data', render: (row) => new Date(row.date).toLocaleDateString('pt-BR') },
        {
            key: 'pnl_usd',
            label: 'PnL',
            render: (row) => <PnLBadge value={row.pnl_usd} />,
        },
        { key: 'trades', label: 'Trades' },
        {
            key: 'cumulative_pnl',
            label: 'PnL Acumulado',
            render: (row) => <PnLBadge value={row.cumulative_pnl} />,
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/subscribers-admin/reports">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold">PnL por Período - Assinantes</h1>
                    <p className="text-muted-foreground">
                        Análise de lucros e perdas dos assinantes
                    </p>
                </div>
            </div>

            {/* Filtros */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-accent/50">
                            <CardTitle className="flex items-center gap-2">
                                <Filter className="h-5 w-5" />
                                Filtros
                            </CardTitle>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Assinante</Label>
                                    <SubscriberSelect
                                        subscribers={subscribers || []}
                                        value={selectedSubscriber}
                                        onValueChange={setSelectedSubscriber}
                                        placeholder="Todos os Assinantes"
                                        allLabel="Todos os Assinantes"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Período</Label>
                                    <DateRangeFilter
                                        onDateChange={handleDateChange}
                                        preset={datePreset}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant={viewMode === 'chart' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setViewMode('chart')}
                                >
                                    <BarChart3 className="h-4 w-4 mr-2" />
                                    Gráfico
                                </Button>
                                <Button
                                    variant={viewMode === 'table' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setViewMode('table')}
                                >
                                    <Table2 className="h-4 w-4 mr-2" />
                                    Tabela
                                </Button>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Cards de Resumo */}
            <div className="grid gap-4 md:grid-cols-4">
                <StatsCard
                    title="PnL Total"
                    value={formatCurrency(summary?.netPnL || 0)}
                    icon={(summary?.netPnL ?? 0) >= 0 ? TrendingUp : TrendingDown}
                    trend={(summary?.netPnL ?? 0) >= 0 ? 'up' : 'down'}
                    loading={loadingSummary}
                />
                <StatsCard
                    title="Total de Trades"
                    value={summary?.totalTrades?.toString() || '0'}
                    icon={Target}
                    loading={loadingSummary}
                />
                <StatsCard
                    title="Win Rate"
                    value={`${((summary?.winRate || 0) * 100).toFixed(1)}%`}
                    icon={Award}
                    trend={(summary?.winRate ?? 0) >= 0.5 ? 'up' : 'down'}
                    loading={loadingSummary}
                />
                <StatsCard
                    title="PnL Médio"
                    value={formatCurrency(summary?.totalTrades ? ((summary.netPnL || 0) / summary.totalTrades) : 0)}
                    icon={(summary?.netPnL ?? 0) >= 0 ? TrendingUp : TrendingDown}
                    trend={(summary?.netPnL ?? 0) >= 0 ? 'up' : 'down'}
                    loading={loadingSummary}
                />
            </div>

            {/* Gráfico ou Tabela de PnL por Dia */}
            <Card>
                <CardHeader>
                    <CardTitle>PnL por Dia</CardTitle>
                </CardHeader>
                <CardContent>
                    {viewMode === 'chart' ? (
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={byDayWithCumulative}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis 
                                        dataKey="date" 
                                        tickFormatter={(date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    />
                                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                                    <Tooltip 
                                        formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)}
                                        labelFormatter={(date) => new Date(date).toLocaleDateString('pt-BR')}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="cumulative_pnl" 
                                        stroke="#10b981" 
                                        strokeWidth={2}
                                        name="PnL Acumulado"
                                    />
                                    <Bar dataKey="pnl_usd" fill="#6366f1" name="PnL Diário" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <DataTable
                            columns={dayColumns}
                            data={byDayWithCumulative}
                            loading={loadingByDay}
                        />
                    )}
                </CardContent>
            </Card>

            {/* PnL por Símbolo */}
            <Card>
                <CardHeader>
                    <CardTitle>PnL por Símbolo</CardTitle>
                </CardHeader>
                <CardContent>
                    {viewMode === 'chart' ? (
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={bySymbol || []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                                    <YAxis type="category" dataKey="symbol" width={80} />
                                    <Tooltip formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)} />
                                    <Bar 
                                        dataKey="pnl_usd" 
                                        fill="#6366f1"
                                        name="PnL Total"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <DataTable
                            columns={symbolColumns}
                            data={bySymbol || []}
                            loading={loadingBySymbol}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

