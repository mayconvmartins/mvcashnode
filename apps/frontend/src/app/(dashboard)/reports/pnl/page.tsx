'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { reportsService } from '@/lib/api/reports.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Download, Filter, FileText, BarChart3, Table2 } from 'lucide-react'
import { exportToPDF, tableToHTML } from '@/lib/utils/pdf-export'
import { TrendingUp, TrendingDown, Target, Award } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function PnLReportPage() {
    const { tradeMode } = useTradeMode()
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    
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
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
    const [comparePeriod, setComparePeriod] = useState(false)
    const [compareDateFrom, setCompareDateFrom] = useState<string | undefined>()
    const [compareDateTo, setCompareDateTo] = useState<string | undefined>()

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { trade_mode: tradeMode }
        if (dateFrom) f.from = dateFrom
        if (dateTo) f.to = dateTo
        if (selectedAccount !== 'all') f.exchange_account_id = parseInt(selectedAccount)
        return f
    }, [tradeMode, dateFrom, dateTo, selectedAccount])

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: ['reports', 'pnl', 'summary', filters],
        queryFn: () => reportsService.getPnLSummary(filters),
    })

    const { data: byDay, isLoading: loadingByDay } = useQuery({
        queryKey: ['reports', 'pnl', 'by-day', filters],
        queryFn: () => reportsService.getPnLByDay(filters),
    })

    const { data: bySymbol, isLoading: loadingBySymbol } = useQuery({
        queryKey: ['reports', 'pnl', 'by-symbol', filters],
        queryFn: () => reportsService.getPnLBySymbol(filters),
    })

    // Dados para comparação
    const compareFilters = useMemo(() => {
        if (!comparePeriod || !compareDateFrom || !compareDateTo) return null
        const f: any = { trade_mode: tradeMode }
        f.from = compareDateFrom
        f.to = compareDateTo
        if (selectedAccount !== 'all') f.exchange_account_id = parseInt(selectedAccount)
        return f
    }, [comparePeriod, compareDateFrom, compareDateTo, tradeMode, selectedAccount])

    const { data: compareSummary } = useQuery({
        queryKey: ['reports', 'pnl', 'summary', compareFilters],
        queryFn: () => reportsService.getPnLSummary(compareFilters!),
        enabled: !!compareFilters,
    })

    const { data: compareByDay } = useQuery({
        queryKey: ['reports', 'pnl', 'by-day', compareFilters],
        queryFn: () => reportsService.getPnLByDay(compareFilters!),
        enabled: !!compareFilters,
    })

    // Calcular Max Drawdown
    const maxDrawdown = useMemo(() => {
        if (!byDay || byDay.length === 0) return 0
        let peak = 0
        let maxDD = 0
        let runningTotal = 0
        
        for (const day of byDay) {
            runningTotal += day.pnl_usd || 0
            if (runningTotal > peak) peak = runningTotal
            const drawdown = peak - runningTotal
            if (drawdown > maxDD) maxDD = drawdown
        }
        return maxDD
    }, [byDay])

    // Exportar para CSV
    const handleExportCSV = () => {
        if (!bySymbol || bySymbol.length === 0) return
        
        const headers = ['Símbolo', 'Trades', 'PnL (USD)', 'Taxa de Acerto (%)']
        const rows = bySymbol.map(item => [
            item.symbol,
            item.trades || 0,
            item.pnl_usd || 0,
            item.win_rate ? item.win_rate.toFixed(2) : '0.00'
        ])
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `pnl-report-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    // Exportar para PDF
    const handleExportPDF = () => {
        const content = `
            <h2>Resumo</h2>
            <p><strong>PnL Total:</strong> ${formatCurrency(summary?.netPnL || 0)}</p>
            <p><strong>Total de Trades:</strong> ${summary?.totalTrades || 0}</p>
            <p><strong>Taxa de Acerto:</strong> ${summary?.winRate.toFixed(1) || 0}%</p>
            <p><strong>PnL Realizado:</strong> ${formatCurrency(summary?.realizedPnL || 0)}</p>
            <p><strong>Max Drawdown:</strong> ${formatCurrency(maxDrawdown)}</p>
            
            <h2>PnL por Símbolo</h2>
            ${tableToHTML(
                bySymbol || [],
                [
                    { key: 'symbol', label: 'Símbolo' },
                    { key: 'trades', label: 'Trades' },
                    { key: 'pnl_usd', label: 'PnL (USD)' },
                ]
            )}
        `
        exportToPDF({
            title: 'Relatório de PnL',
            content,
            filename: `pnl-report-${new Date().toISOString().split('T')[0]}`,
        })
    }

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
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportCSV} disabled={!bySymbol || bySymbol.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        CSV
                    </Button>
                    <Button variant="outline" onClick={handleExportPDF} disabled={!summary}>
                        <FileText className="h-4 w-4 mr-2" />
                        PDF
                    </Button>
                    <ModeToggle />
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
                                    <Label htmlFor="account-filter">Conta de Exchange</Label>
                                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                        <SelectTrigger id="account-filter">
                                            <SelectValue placeholder="Todas as contas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas as contas</SelectItem>
                                            {accounts?.filter(acc => {
                                                const accTradeMode = acc.is_simulation ? 'SIMULATION' : 'REAL'
                                                return accTradeMode === tradeMode
                                            }).map(account => (
                                                <SelectItem key={account.id} value={account.id.toString()}>
                                                    {account.label} ({account.exchange})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <DateRangeFilter
                                from={dateFrom}
                                to={dateTo}
                                preset={datePreset}
                                onDateChange={handleDateChange}
                            />

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="compare-period"
                                    checked={comparePeriod}
                                    onChange={(e) => setComparePeriod(e.target.checked)}
                                    className="rounded"
                                />
                                <Label htmlFor="compare-period" className="cursor-pointer">
                                    Comparar com outro período
                                </Label>
                            </div>

                            {comparePeriod && (
                                <div className="space-y-2">
                                    <Label>Período de Comparação</Label>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <input
                                            type="date"
                                            value={compareDateFrom || ''}
                                            onChange={(e) => setCompareDateFrom(e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                                            className="rounded-md border border-input px-3 py-2"
                                        />
                                        <input
                                            type="date"
                                            value={compareDateTo || ''}
                                            onChange={(e) => setCompareDateTo(e.target.value ? new Date(e.target.value + 'T23:59:59.999').toISOString() : undefined)}
                                            className="rounded-md border border-input px-3 py-2"
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Comparação entre períodos */}
            {comparePeriod && compareSummary && (
                <Card className="border-blue-500">
                    <CardHeader>
                        <CardTitle>Comparação entre Períodos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <h3 className="font-semibold mb-2">Período Atual</h3>
                                <div className="space-y-1 text-sm">
                                    <p>PnL Total: <strong>{formatCurrency(summary?.netPnL || 0)}</strong></p>
                                    <p>Trades: <strong>{summary?.totalTrades || 0}</strong></p>
                                    <p>Taxa de Acerto: <strong>{summary?.winRate.toFixed(1) || 0}%</strong></p>
                                </div>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2">Período de Comparação</h3>
                                <div className="space-y-1 text-sm">
                                    <p>PnL Total: <strong>{formatCurrency(compareSummary.netPnL || 0)}</strong></p>
                                    <p>Trades: <strong>{compareSummary.totalTrades || 0}</strong></p>
                                    <p>Taxa de Acerto: <strong>{compareSummary.winRate.toFixed(1) || 0}%</strong></p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t">
                            <h3 className="font-semibold mb-2">Variação</h3>
                            <div className="space-y-1 text-sm">
                                <p>
                                    PnL: <strong className={((summary?.netPnL || 0) - (compareSummary.netPnL || 0)) >= 0 ? 'text-green-500' : 'text-red-500'}>
                                        {formatCurrency((summary?.netPnL || 0) - (compareSummary.netPnL || 0))}
                                    </strong>
                                </p>
                                <p>
                                    Trades: <strong>{(summary?.totalTrades || 0) - (compareSummary.totalTrades || 0)}</strong>
                                </p>
                                <p>
                                    Taxa de Acerto: <strong className={((summary?.winRate || 0) - (compareSummary.winRate || 0)) >= 0 ? 'text-green-500' : 'text-red-500'}>
                                        {((summary?.winRate || 0) - (compareSummary.winRate || 0)).toFixed(1)}%
                                    </strong>
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <StatsCard title="PnL Total" value={summary?.netPnL || 0} icon={TrendingUp} loading={loadingSummary} />
                <StatsCard title="Total de Trades" value={summary?.totalTrades?.toString() || '0'} icon={Target} loading={loadingSummary} />
                <StatsCard title="Taxa de Acerto" value={summary ? `${summary.winRate.toFixed(1)}%` : '0%'} icon={Award} loading={loadingSummary} />
                <StatsCard title="PnL Realizado" value={summary?.realizedPnL || 0} icon={TrendingUp} loading={loadingSummary} />
                <StatsCard title="Max Drawdown" value={maxDrawdown} icon={TrendingDown} loading={loadingByDay} />
            </div>

            <Card className="glass">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>PnL por Dia</CardTitle>
                        <div className="flex items-center gap-2">
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
                    </div>
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
                    ) : viewMode === 'chart' ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={byDay}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                                <YAxis stroke="hsl(var(--muted-foreground))" />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                                <Line type="monotone" dataKey="pnl_usd" stroke="hsl(var(--primary))" strokeWidth={2} name="Período Atual" />
                                {comparePeriod && compareByDay && (
                                    <Line type="monotone" dataKey="pnl_usd" data={compareByDay} stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" name="Período Comparação" />
                                )}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Data</th>
                                        <th className="text-right p-2">PnL (USD)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byDay.map((day, idx) => (
                                        <tr key={idx} className="border-b">
                                            <td className="p-2">{day.date}</td>
                                            <td className={`text-right p-2 font-medium ${(day.pnl_usd || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {formatCurrency(day.pnl_usd || 0)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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

