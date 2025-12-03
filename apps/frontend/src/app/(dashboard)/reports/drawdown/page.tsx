'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { reportsService } from '@/lib/api/reports.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Download, Filter, TrendingDown } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function DrawdownReportPage() {
    const { tradeMode } = useTradeMode()
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [filtersOpen, setFiltersOpen] = useState(false)

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

    const { data: byDay, isLoading: loadingByDay } = useQuery({
        queryKey: ['reports', 'pnl', 'by-day', filters],
        queryFn: () => reportsService.getPnLByDay(filters),
    })

    // Calcular drawdown
    const drawdownData = useMemo(() => {
        if (!byDay || byDay.length === 0) return []
        
        let runningTotal = 0
        let peak = 0
        const data: Array<{ date: string; equity: number; drawdown: number; peak: number }> = []
        
        for (const day of byDay) {
            runningTotal += day.pnl_usd || 0
            if (runningTotal > peak) peak = runningTotal
            const drawdown = peak - runningTotal
            
            data.push({
                date: day.date,
                equity: runningTotal,
                drawdown: drawdown,
                peak: peak,
            })
        }
        
        return data
    }, [byDay])

    const maxDrawdown = useMemo(() => {
        if (drawdownData.length === 0) return 0
        return Math.max(...drawdownData.map(d => d.drawdown))
    }, [drawdownData])

    const currentDrawdown = useMemo(() => {
        if (drawdownData.length === 0) return 0
        return drawdownData[drawdownData.length - 1]?.drawdown || 0
    }, [drawdownData])

    const avgDrawdown = useMemo(() => {
        if (drawdownData.length === 0) return 0
        const sum = drawdownData.reduce((acc, d) => acc + d.drawdown, 0)
        return sum / drawdownData.length
    }, [drawdownData])

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
        if (!drawdownData || drawdownData.length === 0) return
        
        const headers = ['Data', 'Equity', 'Peak', 'Drawdown']
        const rows = drawdownData.map(item => [
            item.date,
            item.equity.toFixed(2),
            item.peak.toFixed(2),
            item.drawdown.toFixed(2)
        ])
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `drawdown-report-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Relatório de Drawdown</h1>
                    <p className="text-muted-foreground mt-1">Análise de drawdown e recuperação de capital</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportCSV} disabled={!drawdownData || drawdownData.length === 0}>
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

            <div className="grid gap-4 md:grid-cols-3">
                <StatsCard title="Max Drawdown" value={maxDrawdown} icon={TrendingDown} loading={loadingByDay} />
                <StatsCard title="Drawdown Atual" value={currentDrawdown} icon={TrendingDown} loading={loadingByDay} />
                <StatsCard title="Drawdown Médio" value={avgDrawdown} icon={TrendingDown} loading={loadingByDay} />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Evolução do Drawdown</CardTitle>
                    <CardDescription>Equity, Peak e Drawdown ao longo do tempo</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingByDay ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !drawdownData || drawdownData.length === 0 ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={400}>
                            <AreaChart data={drawdownData}>
                                <defs>
                                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                                <YAxis stroke="hsl(var(--muted-foreground))" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                    formatter={(value: any) => formatCurrency(value)}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="equity" 
                                    stroke="#3b82f6" 
                                    fillOpacity={1} 
                                    fill="url(#colorEquity)" 
                                    name="Equity"
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="peak" 
                                    stroke="#10b981" 
                                    strokeDasharray="5 5"
                                    fillOpacity={0}
                                    name="Peak"
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="drawdown" 
                                    stroke="#ef4444" 
                                    fillOpacity={1} 
                                    fill="url(#colorDrawdown)" 
                                    name="Drawdown"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

