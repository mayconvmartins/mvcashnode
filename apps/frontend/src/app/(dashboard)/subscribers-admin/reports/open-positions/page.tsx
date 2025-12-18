'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { reportsService } from '@/lib/api/reports.service'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Filter, ArrowLeft, LineChart, PieChart } from 'lucide-react'
import { formatCurrency, formatAssetAmount } from '@/lib/utils/format'
import { SubscriberSelect } from '@/components/shared/SubscriberSelect'
import Link from 'next/link'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Tooltip, Legend } from 'recharts'

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

export default function SubscriberOpenPositionsReportPage() {
    const [selectedSubscriber, setSelectedSubscriber] = useState<string>('ALL')
    const [filtersOpen, setFiltersOpen] = useState(true)

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { trade_mode: 'REAL' }
        if (selectedSubscriber !== 'ALL') {
            f.user_id = parseInt(selectedSubscriber)
        }
        return f
    }, [selectedSubscriber])

    const { data: positions, isLoading } = useQuery({
        queryKey: ['reports', 'open-positions', 'admin', filters],
        queryFn: () => reportsService.getOpenPositions(filters),
    })

    // Agrupar por símbolo para o gráfico
    const bySymbol = useMemo(() => {
        if (!positions) return []
        const grouped: Record<string, { symbol: string; value: number; quantity: number }> = {}
        positions.forEach((pos: any) => {
            const symbol = pos.symbol
            if (!grouped[symbol]) {
                grouped[symbol] = { symbol, value: 0, quantity: 0 }
            }
            grouped[symbol].value += pos.quote_invested || 0
            grouped[symbol].quantity += pos.qty_remaining || 0
        })
        return Object.values(grouped).sort((a, b) => b.value - a.value)
    }, [positions])

    // Calcular totais
    const totals = useMemo(() => {
        if (!positions) return { totalValue: 0, totalPnl: 0, count: 0 }
        return positions.reduce((acc: any, pos: any) => ({
            totalValue: acc.totalValue + (pos.quote_invested || 0),
            totalPnl: acc.totalPnl + (pos.unrealized_pnl || 0),
            count: acc.count + 1,
        }), { totalValue: 0, totalPnl: 0, count: 0 })
    }, [positions])

    const columns: Column<any>[] = [
        { key: 'symbol', label: 'Símbolo' },
        { 
            key: 'exchange_account', 
            label: 'Conta',
            render: (row) => row.exchange_account?.label || '-'
        },
        { 
            key: 'qty_remaining', 
            label: 'Quantidade',
            render: (row) => formatAssetAmount(row.qty_remaining, row.symbol)
        },
        { 
            key: 'price_open', 
            label: 'Preço Entrada',
            render: (row) => formatCurrency(row.price_open)
        },
        { 
            key: 'quote_invested', 
            label: 'Valor Investido',
            render: (row) => formatCurrency(row.quote_invested)
        },
        { 
            key: 'unrealized_pnl', 
            label: 'PnL Não Realizado',
            render: (row) => <PnLBadge value={row.unrealized_pnl || 0} />
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
                    <h1 className="text-3xl font-bold">Posições Abertas - Assinantes</h1>
                    <p className="text-muted-foreground">
                        Exposição atual dos assinantes por símbolo e conta
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
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Assinante</Label>
                                    <SubscriberSelect
                                        value={selectedSubscriber}
                                        onValueChange={setSelectedSubscriber}
                                        includeAllOption={true}
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
                    title="Posições Abertas"
                    value={totals.count.toString()}
                    icon={LineChart}
                    loading={isLoading}
                />
                <StatsCard
                    title="Valor Total Investido"
                    value={formatCurrency(totals.totalValue)}
                    icon={PieChart}
                    loading={isLoading}
                />
                <StatsCard
                    title="PnL Não Realizado"
                    value={formatCurrency(totals.totalPnl)}
                    icon={totals.totalPnl >= 0 ? LineChart : LineChart}
                    iconColor={totals.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}
                    loading={isLoading}
                />
            </div>

            {/* Gráfico de Distribuição */}
            {bySymbol.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Distribuição por Símbolo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsPie>
                                    <Pie
                                        data={bySymbol}
                                        dataKey="value"
                                        nameKey="symbol"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        label={({ symbol, percent }) => `${symbol} (${(percent * 100).toFixed(1)}%)`}
                                    >
                                        {bySymbol.map((entry, index) => (
                                            <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend />
                                </RechartsPie>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabela de Posições */}
            <Card>
                <CardHeader>
                    <CardTitle>Posições Detalhadas</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={positions || []}
                        loading={isLoading}
                    />
                </CardContent>
            </Card>
        </div>
    )
}

