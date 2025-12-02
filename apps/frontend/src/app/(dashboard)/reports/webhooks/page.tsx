'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils/format'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function WebhooksReportPage() {
    const { data: report, isLoading } = useQuery({
        queryKey: ['reports', 'webhooks'],
        queryFn: () => reportsService.getWebhooks(),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    const conversionRate = report?.totalReceived > 0
        ? ((report.totalProcessed / report.totalReceived) * 100).toFixed(1)
        : '0.0'

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Relatório de Webhooks</h1>
                <p className="text-muted-foreground">
                    Performance e taxa de conversão
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Eventos Recebidos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.totalReceived || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Processados</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">{report?.totalProcessed || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Com Erro</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{report?.totalErrors || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Taxa de Conversão</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{conversionRate}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Performance Chart */}
            {report?.bySource && report.bySource.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Performance por Source</CardTitle>
                        <CardDescription>Eventos recebidos e processados</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={report.bySource}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="source"
                                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--popover))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '6px',
                                    }}
                                />
                                <Legend />
                                <Bar dataKey="received" fill="#3b82f6" name="Recebidos" />
                                <Bar dataKey="processed" fill="#10b981" name="Processados" />
                                <Bar dataKey="errors" fill="#ef4444" name="Erros" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Webhooks List */}
            {report?.webhooks && report.webhooks.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhamento por Webhook</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Nome</th>
                                        <th className="text-center p-2">Source</th>
                                        <th className="text-center p-2">Status</th>
                                        <th className="text-right p-2">Recebidos</th>
                                        <th className="text-right p-2">Processados</th>
                                        <th className="text-right p-2">Erros</th>
                                        <th className="text-right p-2">Taxa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.webhooks.map((webhook: any) => {
                                        const rate = webhook.received > 0
                                            ? ((webhook.processed / webhook.received) * 100).toFixed(1)
                                            : '0.0'
                                        return (
                                            <tr key={webhook.id} className="border-b">
                                                <td className="p-2 font-medium">{webhook.name}</td>
                                                <td className="text-center p-2">{webhook.source}</td>
                                                <td className="text-center p-2">
                                                    <Badge variant={webhook.active ? 'default' : 'secondary'}>
                                                        {webhook.active ? 'Ativo' : 'Inativo'}
                                                    </Badge>
                                                </td>
                                                <td className="text-right p-2">{webhook.received}</td>
                                                <td className="text-right p-2 text-green-500">{webhook.processed}</td>
                                                <td className="text-right p-2 text-red-500">{webhook.errors}</td>
                                                <td className="text-right p-2 font-medium">{rate}%</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

