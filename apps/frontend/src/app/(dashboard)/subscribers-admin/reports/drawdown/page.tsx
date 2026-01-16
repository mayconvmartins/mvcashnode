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
import { Filter, ArrowLeft, TrendingDown, AlertTriangle, Clock } from 'lucide-react'
import { formatPercentage } from '@/lib/utils/format'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'
import Link from 'next/link'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

export default function SubscriberDrawdownReportPage() {
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

    const { data: drawdownData, isLoading } = useQuery({
        queryKey: ['reports', 'drawdown', 'admin', filters],
        queryFn: () => reportsService.getDrawdown(filters),
    })

    const maxDrawdown = drawdownData?.max_drawdown || 0
    const currentDrawdown = drawdownData?.current_drawdown || 0
    const recoveryDays = drawdownData?.recovery_days || 0

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
                    <h1 className="text-3xl font-bold">Análise de Drawdown - Assinantes</h1>
                    <p className="text-muted-foreground">
                        Análise de drawdown e recuperação dos assinantes
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
            <div className="grid gap-4 md:grid-cols-3">
                <StatsCard
                    title="Drawdown Máximo"
                    value={formatPercentage(maxDrawdown)}
                    icon={TrendingDown}
                    loading={isLoading}
                />
                <StatsCard
                    title="Drawdown Atual"
                    value={formatPercentage(currentDrawdown)}
                    icon={AlertTriangle}
                    loading={isLoading}
                />
                <StatsCard
                    title="Dias para Recuperação"
                    value={recoveryDays.toString()}
                    icon={Clock}
                    loading={isLoading}
                />
            </div>

            {/* Gráfico de Drawdown */}
            <Card>
                <CardHeader>
                    <CardTitle>Histórico de Drawdown</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={drawdownData?.history || []}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="date" 
                                    tickFormatter={(date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                />
                                <YAxis 
                                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                                    domain={['dataMin', 0]}
                                />
                                <Tooltip 
                                    formatter={(value) => [`${typeof value === 'number' ? value.toFixed(2) : 0}%`, 'Drawdown']}
                                    labelFormatter={(date) => new Date(date).toLocaleDateString('pt-BR')}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="drawdown" 
                                    stroke="#ef4444" 
                                    fill="#fecaca"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

