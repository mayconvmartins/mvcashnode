'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { reportsService } from '@/lib/api/reports.service'
import { accountsService } from '@/lib/api/accounts.service'
import { positionsService } from '@/lib/api/positions.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Download, Filter, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function HourlyPerformanceReportPage() {
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
        const f: any = {
            status: 'CLOSED',
            trade_mode: tradeMode,
        }
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

    // Buscar posições fechadas
    const { data: positionsData, isLoading: loadingPositions } = useQuery({
        queryKey: ['positions', 'closed', filters],
        queryFn: () => positionsService.list(filters),
    })

    // Processar dados por hora
    const hourlyData = useMemo(() => {
        const positions = Array.isArray(positionsData) 
            ? positionsData 
            : (positionsData as any)?.data || []
        
        if (!positions || positions.length === 0) return []
        
        const hourlyMap: Record<number, { hour: number; pnl: number; trades: number; wins: number }> = {}
        
        // Inicializar todas as horas
        for (let i = 0; i < 24; i++) {
            hourlyMap[i] = { hour: i, pnl: 0, trades: 0, wins: 0 }
        }
        
        // Processar posições
        positions.forEach((position: any) => {
            if (!position.closed_at) return
            
            const closedDate = new Date(position.closed_at)
            const hour = closedDate.getHours()
            
            if (hourlyMap[hour]) {
                hourlyMap[hour].pnl += position.realized_profit_usd || 0
                hourlyMap[hour].trades += 1
                if ((position.realized_profit_usd || 0) > 0) {
                    hourlyMap[hour].wins += 1
                }
            }
        })
        
        // Converter para array e calcular win rate
        return Object.values(hourlyMap).map(item => ({
            ...item,
            winRate: item.trades > 0 ? (item.wins / item.trades) * 100 : 0,
            avgPnL: item.trades > 0 ? item.pnl / item.trades : 0,
            hourLabel: `${item.hour.toString().padStart(2, '0')}:00`,
        }))
    }, [positionsData])

    const bestHour = useMemo(() => {
        if (hourlyData.length === 0) return null
        return hourlyData.reduce((best, current) => 
            current.pnl > best.pnl ? current : best
        )
    }, [hourlyData])

    const worstHour = useMemo(() => {
        if (hourlyData.length === 0) return null
        return hourlyData.reduce((worst, current) => 
            current.pnl < worst.pnl ? current : worst
        )
    }, [hourlyData])

    const totalTrades = useMemo(() => {
        return hourlyData.reduce((sum, item) => sum + item.trades, 0)
    }, [hourlyData])

    const totalPnL = useMemo(() => {
        return hourlyData.reduce((sum, item) => sum + item.pnl, 0)
    }, [hourlyData])

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
        if (!hourlyData || hourlyData.length === 0) return
        
        const headers = ['Hora', 'PnL Total', 'Trades', 'Vitórias', 'Taxa de Acerto (%)', 'PnL Médio']
        const rows = hourlyData.map(item => [
            item.hourLabel,
            item.pnl.toFixed(2),
            item.trades,
            item.wins,
            item.winRate.toFixed(2),
            item.avgPnL.toFixed(2)
        ])
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `hourly-performance-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const COLORS = hourlyData.map(item => {
        if (item.pnl > 0) return '#10b981'
        if (item.pnl < 0) return '#ef4444'
        return '#6b7280'
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Performance por Horário</h1>
                    <p className="text-muted-foreground mt-1">Análise de lucratividade por hora do dia</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportCSV} disabled={!hourlyData || hourlyData.length === 0}>
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

            <div className="grid gap-4 md:grid-cols-4">
                <StatsCard title="Total de Trades" value={totalTrades.toString()} icon={Clock} loading={loadingPositions} />
                <StatsCard title="PnL Total" value={totalPnL} icon={Clock} loading={loadingPositions} />
                <StatsCard 
                    title="Melhor Horário" 
                    value={bestHour ? `${bestHour.hourLabel} (${formatCurrency(bestHour.pnl)})` : 'N/A'} 
                    icon={Clock} 
                    loading={loadingPositions} 
                />
                <StatsCard 
                    title="Pior Horário" 
                    value={worstHour ? `${worstHour.hourLabel} (${formatCurrency(worstHour.pnl)})` : 'N/A'} 
                    icon={Clock} 
                    loading={loadingPositions} 
                />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>PnL por Hora do Dia</CardTitle>
                    <CardDescription>Distribuição de lucros e perdas por horário</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingPositions ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !hourlyData || hourlyData.length === 0 ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={400}>
                            <BarChart data={hourlyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey="hourLabel" 
                                    stroke="hsl(var(--muted-foreground))"
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                />
                                <YAxis stroke="hsl(var(--muted-foreground))" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                    formatter={(value, name) => {
                                        if (name === 'pnl') return formatCurrency(typeof value === 'number' ? value : 0)
                                        if (name === 'trades') return `${value} trades`
                                        if (name === 'winRate') return `${typeof value === 'number' ? value.toFixed(1) : 0}%`
                                        return value
                                    }}
                                    labelFormatter={(label) => `Hora: ${label}`}
                                />
                                <Bar dataKey="pnl" name="PnL">
                                    {hourlyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Tabela detalhada */}
            {hourlyData && hourlyData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhamento por Hora</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Hora</th>
                                        <th className="text-right p-2">PnL Total</th>
                                        <th className="text-right p-2">Trades</th>
                                        <th className="text-right p-2">Vitórias</th>
                                        <th className="text-right p-2">Taxa de Acerto</th>
                                        <th className="text-right p-2">PnL Médio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hourlyData
                                        .filter(item => item.trades > 0)
                                        .sort((a, b) => b.pnl - a.pnl)
                                        .map((item, index) => (
                                            <tr key={index} className="border-b">
                                                <td className="p-2 font-medium">{item.hourLabel}</td>
                                                <td className={`text-right p-2 font-medium ${item.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {formatCurrency(item.pnl)}
                                                </td>
                                                <td className="text-right p-2">{item.trades}</td>
                                                <td className="text-right p-2 text-green-500">{item.wins}</td>
                                                <td className="text-right p-2">{item.winRate.toFixed(1)}%</td>
                                                <td className={`text-right p-2 ${item.avgPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {formatCurrency(item.avgPnL)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

