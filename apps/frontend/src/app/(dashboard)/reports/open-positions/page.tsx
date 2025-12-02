'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'

export default function OpenPositionsReportPage() {
    const { data: report, isLoading } = useQuery({
        queryKey: ['reports', 'open-positions'],
        queryFn: () => reportsService.getOpenPositions(),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Posições Abertas</h1>
                <p className="text-muted-foreground">
                    Exposição atual por símbolo
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Posições</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.totalPositions || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Exposição Total</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(report?.totalExposure || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>PnL Não Realizado</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${(report?.unrealizedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatCurrency(report?.unrealizedPnL || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Símbolos Únicos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.uniqueSymbols || 0}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Pie Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Exposição por Símbolo</CardTitle>
                    <CardDescription>Distribuição de capital por ativo</CardDescription>
                </CardHeader>
                <CardContent>
                    {report?.bySymbol && report.bySymbol.length > 0 ? (
                        <ResponsiveContainer width="100%" height={400}>
                            <PieChart>
                                <Pie
                                    data={report.bySymbol}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={(entry) => `${entry.symbol}: ${((entry.value / report.totalExposure) * 100).toFixed(1)}%`}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {report.bySymbol.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => formatCurrency(value)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                            Nenhuma posição aberta
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* By Symbol Table */}
            {report?.bySymbol && report.bySymbol.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhamento por Símbolo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Símbolo</th>
                                        <th className="text-right p-2">Posições</th>
                                        <th className="text-right p-2">Exposição</th>
                                        <th className="text-right p-2">PnL Não Realizado</th>
                                        <th className="text-right p-2">%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.bySymbol.map((item: any, index: number) => (
                                        <tr key={index} className="border-b">
                                            <td className="p-2 font-medium">{item.symbol}</td>
                                            <td className="text-right p-2">{item.count}</td>
                                            <td className="text-right p-2">{formatCurrency(item.value)}</td>
                                            <td className={`text-right p-2 ${item.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {formatCurrency(item.pnl)}
                                            </td>
                                            <td className="text-right p-2">
                                                {((item.value / report.totalExposure) * 100).toFixed(1)}%
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

