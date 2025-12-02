'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function VaultsReportPage() {
    const { data: report, isLoading } = useQuery({
        queryKey: ['reports', 'vaults'],
        queryFn: () => reportsService.getVaults(),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Relatório de Vaults</h1>
                <p className="text-muted-foreground">
                    Consolidação de saldos e performance
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Vaults</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.totalVaults || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Saldo Total (REAL)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(report?.totalBalanceReal || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Saldo Total (SIMULATION)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(report?.totalBalanceSimulation || 0)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Evolution Chart */}
            {report?.evolution && report.evolution.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Evolução do Saldo</CardTitle>
                        <CardDescription>Histórico dos últimos 30 dias</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={report.evolution}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--popover))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '6px',
                                    }}
                                    formatter={(value: any) => formatCurrency(value)}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="real"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    name="REAL"
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="simulation"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    name="SIMULATION"
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Vaults List */}
            {report?.vaults && report.vaults.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhamento por Vault</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {report.vaults.map((vault: any) => (
                                <div
                                    key={vault.id}
                                    className="flex items-center justify-between p-4 border rounded-lg"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium">{vault.name}</h4>
                                            <Badge variant={vault.mode === 'REAL' ? 'default' : 'secondary'}>
                                                {vault.mode}
                                            </Badge>
                                        </div>
                                        {vault.description && (
                                            <p className="text-sm text-muted-foreground">{vault.description}</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold">{formatCurrency(vault.balance)}</div>
                                        {vault.lastUpdate && (
                                            <p className="text-xs text-muted-foreground">
                                                Atualizado: {formatDate(vault.lastUpdate)}
                                            </p>
                                        )}
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

