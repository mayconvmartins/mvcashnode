'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { reportsService } from '@/lib/api/reports.service'
import { adminService } from '@/lib/api/admin.service'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Filter, ArrowLeft, DollarSign, Percent, Layers } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'
import Link from 'next/link'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6']

export default function SubscriberFeesReportPage() {
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

    const { data: feesData, isLoading } = useQuery({
        queryKey: ['reports', 'fees', 'admin', filters],
        queryFn: () => reportsService.getFees(filters),
    })

    const totalFees = feesData?.total_fees || 0
    const avgFeePercent = feesData?.avg_fee_percent || 0
    const feesByType = feesData?.by_type || []

    const columns: Column<any>[] = [
        { key: 'type', label: 'Tipo de Taxa' },
        { 
            key: 'amount', 
            label: 'Valor Total',
            render: (row) => formatCurrency(row.amount)
        },
        { 
            key: 'percent', 
            label: '% do Total',
            render: (row) => `${((row.percent || 0) * 100).toFixed(1)}%`
        },
        { key: 'count', label: 'Qtd. Operações' },
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
                    <h1 className="text-3xl font-bold">Relatório de Taxas - Assinantes</h1>
                    <p className="text-muted-foreground">
                        Análise detalhada das taxas pagas pelos assinantes
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
                    title="Total de Taxas"
                    value={formatCurrency(totalFees)}
                    icon={DollarSign}
                    loading={isLoading}
                />
                <StatsCard
                    title="Taxa Média"
                    value={`${(avgFeePercent * 100).toFixed(3)}%`}
                    icon={Percent}
                    loading={isLoading}
                />
                <StatsCard
                    title="Tipos de Taxa"
                    value={feesByType.length.toString()}
                    icon={Layers}
                    loading={isLoading}
                />
            </div>

            {/* Gráfico de Distribuição */}
            {feesByType.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Distribuição por Tipo de Taxa</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={feesByType}
                                        dataKey="amount"
                                        nameKey="type"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(1)}%)`}
                                    >
                                        {feesByType.map((entry: any, index: number) => (
                                            <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => formatCurrency(typeof value === 'number' ? value : 0)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabela Detalhada */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes por Tipo de Taxa</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={feesByType}
                        loading={isLoading}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

