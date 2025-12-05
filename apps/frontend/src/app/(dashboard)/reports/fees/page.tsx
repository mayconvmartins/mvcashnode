'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/format'
import { DollarSign, TrendingUp, TrendingDown, BarChart3, PieChart } from 'lucide-react'
import { reportsService } from '@/lib/api/reports.service'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'

export default function FeesReportPage() {
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('all')
    const [tradeMode, setTradeMode] = useState<'REAL' | 'SIMULATION' | undefined>('REAL')

    const { data: feesReport, isLoading } = useQuery({
        queryKey: ['fees-report', dateFrom, dateTo, tradeMode],
        queryFn: () => reportsService.getFeesReport({
            trade_mode: tradeMode,
            from: dateFrom,
            to: dateTo,
        }),
    })

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    const summary = feesReport?.summary || {
        total_fees_usd: 0,
        total_executions: 0,
        avg_fee_per_execution: 0,
        total_positions_with_fees: 0,
        total_fees_from_positions: 0,
        fees_on_buy: 0,
        fees_on_sell: 0,
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Relatório de Taxas</h1>
                    <p className="text-muted-foreground mt-1">
                        Análise detalhada das taxas pagas nas exchanges
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        value={tradeMode || ''}
                        onChange={(e) => setTradeMode(e.target.value as 'REAL' | 'SIMULATION' | undefined)}
                        className="px-3 py-2 border rounded-md"
                    >
                        <option value="">Todos</option>
                        <option value="REAL">Real</option>
                        <option value="SIMULATION">Simulação</option>
                    </select>
                    <DateRangeFilter
                        from={dateFrom}
                        to={dateTo}
                        preset={datePreset}
                        onDateChange={handleDateChange}
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Taxas</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.total_fees_usd)}</div>
                        <p className="text-xs text-muted-foreground">
                            {summary.total_executions} execuções
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Taxa Média</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(summary.avg_fee_per_execution)}
                        </div>
                        <p className="text-xs text-muted-foreground">Por execução</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Taxas na Compra</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">
                            {formatCurrency(summary.fees_on_buy)}
                        </div>
                        <p className="text-xs text-muted-foreground">Total em compras</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Taxas na Venda</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">
                            {formatCurrency(summary.fees_on_sell)}
                        </div>
                        <p className="text-xs text-muted-foreground">Total em vendas</p>
                    </CardContent>
                </Card>
            </div>

            {/* By Account */}
            {feesReport?.by_account && feesReport.by_account.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Taxas por Conta</CardTitle>
                        <CardDescription>Distribuição de taxas por conta de exchange</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {feesReport.by_account.map((account: any) => (
                                <div key={account.account_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div>
                                        <p className="font-medium">{account.account?.label || `Conta #${account.account_id}`}</p>
                                        <p className="text-sm text-muted-foreground">{account.account?.exchange || ''}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold">{formatCurrency(account.total_fees)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {account.execution_count} execuções
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* By Symbol */}
            {feesReport?.by_symbol && feesReport.by_symbol.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Taxas por Símbolo</CardTitle>
                        <CardDescription>Número de execuções com taxas por símbolo</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {feesReport.by_symbol.map((symbol: any) => (
                                <div key={symbol.symbol} className="p-3 bg-muted/50 rounded-lg">
                                    <p className="font-medium font-mono">{symbol.symbol}</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {symbol.execution_count} execuções
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* By Position Status */}
            {feesReport?.by_position_status && feesReport.by_position_status.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Taxas por Status de Posição</CardTitle>
                        <CardDescription>Taxas acumuladas por status das posições</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {feesReport.by_position_status.map((status: any) => (
                                <div key={status.status} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div>
                                        <p className="font-medium">{status.status}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold">{formatCurrency(status.total_fees)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
