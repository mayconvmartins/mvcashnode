'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { reportsService } from '@/lib/api/reports.service'
import { accountsService } from '@/lib/api/accounts.service'
import { webhooksService } from '@/lib/api/webhooks.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Download, Filter, Target, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function StrategyPerformanceReportPage() {
    const { tradeMode } = useTradeMode()
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [selectedWebhook, setSelectedWebhook] = useState<string>('all')
    const [filtersOpen, setFiltersOpen] = useState(false)

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    // Buscar webhooks
    const { data: webhooks } = useQuery({
        queryKey: ['webhook-sources'],
        queryFn: webhooksService.listSources,
    })

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { trade_mode: tradeMode }
        if (dateFrom) f.from = dateFrom
        if (dateTo) f.to = dateTo
        if (selectedAccount !== 'all') f.exchange_account_id = parseInt(selectedAccount)
        if (selectedWebhook !== 'all') f.webhook_source_id = parseInt(selectedWebhook)
        return f
    }, [tradeMode, dateFrom, dateTo, selectedAccount, selectedWebhook])

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    const { data: strategies, isLoading } = useQuery({
        queryKey: ['reports', 'strategy-performance', filters],
        queryFn: () => reportsService.getStrategyPerformance(filters),
    })

    // Inicializar datas
    useEffect(() => {
        if (datePreset === 'last30days' && !dateFrom && !dateTo) {
            const today = new Date()
            const last30Days = new Date(today)
            last30Days.setDate(last30Days.getDate() - 30)
            setDateFrom(last30Days.toISOString())
            setDateTo(today.toISOString())
        }
    }, [])

    // Exportar para CSV
    const handleExportCSV = () => {
        if (!strategies || strategies.length === 0) return
        
        const headers = ['Estratégia', 'PnL Total', 'Trades', 'Vitórias', 'Taxa de Acerto (%)', 'PnL Médio', 'Volume Total']
        const rows = strategies.map(item => [
            item.strategy,
            item.pnl.toFixed(2),
            item.trades,
            item.wins,
            item.winRate.toFixed(2),
            item.avgPnL.toFixed(2),
            item.totalVolume.toFixed(2)
        ])
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `strategy-performance-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const totalPnL = useMemo(() => {
        return strategies?.reduce((sum, s) => sum + s.pnl, 0) || 0
    }, [strategies])

    const totalTrades = useMemo(() => {
        return strategies?.reduce((sum, s) => sum + s.trades, 0) || 0
    }, [strategies])

    const bestStrategy = useMemo(() => {
        if (!strategies || strategies.length === 0) return null
        return strategies.reduce((best, current) => 
            current.pnl > best.pnl ? current : best
        )
    }, [strategies])

    const columns: Column<any>[] = [
        { key: 'strategy', label: 'Estratégia', render: (row) => <span className="font-mono">{row.strategy}</span> },
        { key: 'pnl', label: 'PnL Total', render: (row) => <PnLBadge value={row.pnl} /> },
        { key: 'trades', label: 'Trades', render: (row) => <span>{row.trades}</span> },
        { key: 'wins', label: 'Vitórias', render: (row) => <span className="text-green-500">{row.wins}</span> },
        { key: 'winRate', label: 'Taxa de Acerto', render: (row) => <span>{row.winRate.toFixed(1)}%</span> },
        { key: 'avgPnL', label: 'PnL Médio', render: (row) => <PnLBadge value={row.avgPnL} /> },
        { key: 'totalVolume', label: 'Volume Total', render: (row) => <span>{formatCurrency(row.totalVolume)}</span> },
    ]

    const COLORS = strategies?.map(item => {
        if (item.pnl > 0) return '#10b981'
        if (item.pnl < 0) return '#ef4444'
        return '#6b7280'
    }) || []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Performance por Estratégia</h1>
                    <p className="text-muted-foreground mt-1">Análise de desempenho por estratégia de trading</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportCSV} disabled={!strategies || strategies.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Exportar CSV
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
                                <div className="space-y-2">
                                    <Label htmlFor="webhook-filter">Webhook Source</Label>
                                    <Select value={selectedWebhook} onValueChange={setSelectedWebhook}>
                                        <SelectTrigger id="webhook-filter">
                                            <SelectValue placeholder="Todos os webhooks" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os webhooks</SelectItem>
                                            {webhooks?.map(webhook => (
                                                <SelectItem key={webhook.id} value={webhook.id.toString()}>
                                                    {webhook.label}
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
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <div className="grid gap-4 md:grid-cols-4">
                <StatsCard title="Total de Trades" value={totalTrades.toString()} icon={Target} loading={isLoading} />
                <StatsCard title="PnL Total" value={totalPnL} icon={TrendingUp} loading={isLoading} />
                <StatsCard 
                    title="Melhor Estratégia" 
                    value={bestStrategy ? `${bestStrategy.strategy} (${formatCurrency(bestStrategy.pnl)})` : 'N/A'} 
                    icon={TrendingUp} 
                    loading={isLoading} 
                />
                <StatsCard 
                    title="Total de Estratégias" 
                    value={strategies?.length.toString() || '0'} 
                    icon={Target} 
                    loading={isLoading} 
                />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>PnL por Estratégia</CardTitle>
                    <CardDescription>Comparação de desempenho entre estratégias</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !strategies || strategies.length === 0 ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={400}>
                            <BarChart data={strategies}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey="strategy" 
                                    stroke="hsl(var(--muted-foreground))"
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                />
                                <YAxis stroke="hsl(var(--muted-foreground))" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                    formatter={(value: any) => formatCurrency(value)}
                                />
                                <Bar dataKey="pnl" name="PnL">
                                    {strategies.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Detalhamento por Estratégia</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-[200px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !strategies || strategies.length === 0 ? (
                        <div className="flex items-center justify-center h-[200px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <DataTable data={strategies} columns={columns} loading={false} />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

