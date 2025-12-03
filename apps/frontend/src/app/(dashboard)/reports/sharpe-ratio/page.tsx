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
import { Download, Filter, TrendingUp, BarChart3 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function SharpeRatioReportPage() {
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

    const { data: sharpeData, isLoading } = useQuery({
        queryKey: ['reports', 'sharpe-ratio', filters],
        queryFn: () => reportsService.getSharpeRatio(filters),
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
        if (!sharpeData?.returns || sharpeData.returns.length === 0) return
        
        const headers = ['Data', 'Retorno Diário']
        const rows = sharpeData.returns.map(item => [
            item.date,
            item.return.toFixed(2)
        ])
        
        const csvContent = [
            `Sharpe Ratio,${sharpeData.sharpeRatio.toFixed(4)}`,
            `Retorno Médio,${sharpeData.avgReturn.toFixed(2)}`,
            `Desvio Padrão,${sharpeData.stdDev.toFixed(2)}`,
            '',
            ...headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `sharpe-ratio-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const getSharpeRating = (ratio: number): { label: string; color: string } => {
        if (ratio >= 3) return { label: 'Excelente', color: 'text-green-500' }
        if (ratio >= 2) return { label: 'Muito Bom', color: 'text-green-400' }
        if (ratio >= 1) return { label: 'Bom', color: 'text-blue-500' }
        if (ratio >= 0) return { label: 'Aceitável', color: 'text-yellow-500' }
        return { label: 'Ruim', color: 'text-red-500' }
    }

    const rating = sharpeData ? getSharpeRating(sharpeData.sharpeRatio) : null

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Sharpe Ratio</h1>
                    <p className="text-muted-foreground mt-1">Medida de retorno ajustado ao risco</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportCSV} disabled={!sharpeData}>
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
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Sharpe Ratio</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${rating?.color || ''}`}>
                            {sharpeData?.sharpeRatio.toFixed(4) || '0.0000'}
                        </div>
                        {rating && (
                            <p className="text-sm text-muted-foreground mt-1">{rating.label}</p>
                        )}
                    </CardContent>
                </Card>
                <StatsCard title="Retorno Médio" value={sharpeData?.avgReturn || 0} icon={TrendingUp} loading={isLoading} />
                <StatsCard title="Desvio Padrão" value={sharpeData?.stdDev || 0} icon={BarChart3} loading={isLoading} />
                <StatsCard title="Taxa Livre de Risco" value={sharpeData?.riskFreeRate || 0} icon={BarChart3} loading={isLoading} />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Retornos Diários</CardTitle>
                    <CardDescription>Evolução dos retornos ao longo do tempo</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !sharpeData?.returns || sharpeData.returns.length === 0 ? (
                        <div className="flex items-center justify-center h-[400px]">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={sharpeData.returns}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="hsl(var(--muted-foreground))"
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                />
                                <YAxis stroke="hsl(var(--muted-foreground))" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                    formatter={(value: any) => formatCurrency(value)}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="return" 
                                    stroke="hsl(var(--primary))" 
                                    strokeWidth={2}
                                    name="Retorno Diário"
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey={() => sharpeData.avgReturn} 
                                    stroke="#10b981" 
                                    strokeDasharray="5 5"
                                    strokeWidth={2}
                                    name="Média"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Interpretação do Sharpe Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 text-sm">
                        <p><strong>Sharpe Ratio ≥ 3:</strong> Excelente - Retorno muito superior ao risco</p>
                        <p><strong>Sharpe Ratio ≥ 2:</strong> Muito Bom - Retorno bom em relação ao risco</p>
                        <p><strong>Sharpe Ratio ≥ 1:</strong> Bom - Retorno adequado ao risco</p>
                        <p><strong>Sharpe Ratio ≥ 0:</strong> Aceitável - Retorno positivo mas próximo do risco</p>
                        <p><strong>Sharpe Ratio &lt; 0:</strong> Ruim - Retorno não compensa o risco</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

