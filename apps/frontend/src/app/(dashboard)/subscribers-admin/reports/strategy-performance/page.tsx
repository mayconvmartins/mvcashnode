'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { reportsService } from '@/lib/api/reports.service'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Filter, ArrowLeft } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'
import Link from 'next/link'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

export default function SubscriberStrategyPerformanceReportPage() {
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('ALL')
    const [filtersOpen, setFiltersOpen] = useState(true)

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

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { trade_mode: 'REAL' }
        if (dateFrom) f.from = dateFrom
        if (dateTo) f.to = dateTo
        if (selectedSubscriber !== 'ALL') {
            f.user_id = parseInt(selectedSubscriber)
        }
        return f
    }, [dateFrom, dateTo, selectedSubscriber])

    const { data: strategyData, isLoading } = useQuery({
        queryKey: ['reports', 'strategy-performance', 'admin', filters],
        queryFn: () => reportsService.getStrategyPerformance(filters),
    })

    const columns: Column<any>[] = [
        { key: 'strategy', label: 'Estratégia/Webhook' },
        { 
            key: 'total_pnl', 
            label: 'PnL Total',
            render: (row) => <PnLBadge value={row.total_pnl} />
        },
        { key: 'total_trades', label: 'Total Trades' },
        { 
            key: 'win_rate', 
            label: 'Win Rate',
            render: (row) => `${((row.win_rate || 0) * 100).toFixed(1)}%`
        },
        { 
            key: 'avg_pnl', 
            label: 'PnL Médio',
            render: (row) => <PnLBadge value={row.avg_pnl} />
        },
        { 
            key: 'profit_factor', 
            label: 'Profit Factor',
            render: (row) => (row.profit_factor || 0).toFixed(2)
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
                    <h1 className="text-3xl font-bold">Performance por Estratégia - Assinantes</h1>
                    <p className="text-muted-foreground">
                        Análise de desempenho por estratégia/webhook
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
                                        value={selectedSubscriber}
                                        onValueChange={setSelectedSubscriber}
                                        includeAllOption={true}
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Período</Label>
                                    <DateRangeFilter
                                        onDateChange={handleDateChange}
                                        defaultPreset={datePreset}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Gráfico de Performance */}
            {strategyData?.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Comparativo de Estratégias</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[400px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={strategyData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} />
                                    <YAxis type="category" dataKey="strategy" width={120} />
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend />
                                    <Bar dataKey="total_pnl" name="PnL Total" fill="#6366f1" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabela Detalhada */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes por Estratégia</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={strategyData || []}
                        loading={isLoading}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

