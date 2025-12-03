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
        queryFn: () => reportsService.getWebhooksSummary(),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    const conversionRate = (report?.totalEvents ?? 0) > 0
        ? (report?.successRate ?? 0).toFixed(1)
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
                        <CardDescription>Total de Eventos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.totalEvents || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Jobs Criados</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">{report?.jobsCreated || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Falhas</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{report?.failed || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Taxa de Sucesso</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{conversionRate}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Stats */}
            <Card>
                <CardHeader>
                    <CardTitle>Estatísticas Detalhadas</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Eventos Ignorados</p>
                            <p className="text-2xl font-bold">{report?.skipped || 0}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Taxa de Conversão</p>
                            <p className="text-2xl font-bold">{conversionRate}%</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Taxa de Falha</p>
                            <p className="text-2xl font-bold text-red-500">
                                {(report?.totalEvents ?? 0) > 0 
                                    ? (((report?.failed ?? 0) / (report?.totalEvents ?? 1)) * 100).toFixed(1)
                                    : '0.0'}%
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

