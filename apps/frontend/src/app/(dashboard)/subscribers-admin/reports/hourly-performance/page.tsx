'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { reportsService } from '@/lib/api/reports.service'
import { adminService } from '@/lib/api/admin.service'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Filter, ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'
import Link from 'next/link'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

export default function SubscriberHourlyPerformanceReportPage() {
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('ALL')
    const [filtersOpen, setFiltersOpen] = useState(true)

    // Buscar lista de assinantes
    const { data: subscribers } = useQuery({
        queryKey: ['admin', 'subscribers'],
        queryFn: () => adminService.listSubscribers(),
    })

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

    const { data: hourlyData, isLoading } = useQuery({
        queryKey: ['reports', 'hourly-performance', 'admin', filters],
        queryFn: () => reportsService.getHourlyPerformance(filters),
    })

    // Encontrar melhor e pior hora
    const bestHour = useMemo(() => {
        if (!hourlyData?.length) return null
        return hourlyData.reduce((best: any, curr: any) => 
            (curr.pnl > (best?.pnl || -Infinity)) ? curr : best
        , null)
    }, [hourlyData])

    const worstHour = useMemo(() => {
        if (!hourlyData?.length) return null
        return hourlyData.reduce((worst: any, curr: any) => 
            (curr.pnl < (worst?.pnl || Infinity)) ? curr : worst
        , null)
    }, [hourlyData])

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
                    <h1 className="text-3xl font-bold">Performance por Horário - Assinantes</h1>
                    <p className="text-muted-foreground">
                        Análise de performance por hora do dia
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
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Cards de Resumo */}
            <div className="grid gap-4 md:grid-cols-2">
                <StatsCard
                    title="Melhor Horário"
                    value={bestHour ? `${bestHour.hour}:00 (${formatCurrency(bestHour.pnl)})` : '-'}
                    icon={TrendingUp}
                    trend="up"
                    loading={isLoading}
                />
                <StatsCard
                    title="Pior Horário"
                    value={worstHour ? `${worstHour.hour}:00 (${formatCurrency(worstHour.pnl)})` : '-'}
                    icon={TrendingDown}
                    trend="down"
                    loading={isLoading}
                />
            </div>

            {/* Gráfico de Performance por Hora */}
            <Card>
                <CardHeader>
                    <CardTitle>PnL por Hora do Dia</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourlyData || []}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="hour" 
                                    tickFormatter={(hour) => `${hour}:00`}
                                />
                                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                                <Tooltip 
                                    formatter={(value: number) => formatCurrency(value)}
                                    labelFormatter={(hour) => `${hour}:00 - ${hour}:59`}
                                />
                                <Bar dataKey="pnl" name="PnL">
                                    {(hourlyData || []).map((entry: any, index: number) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} 
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

