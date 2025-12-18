'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, PieChart, TrendingUp, Webhook, Clock, Layers } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SubscriberReportsIndexPage() {
    const router = useRouter()

    const reports = [
        {
            title: 'PnL por Período',
            description: 'Análise de lucros e perdas dos assinantes ao longo do tempo',
            icon: TrendingUp,
            path: '/subscribers-admin/reports/pnl',
            color: 'text-green-500',
        },
        {
            title: 'Posições Abertas',
            description: 'Exposição atual dos assinantes por símbolo e conta',
            icon: PieChart,
            path: '/subscribers-admin/reports/open-positions',
            color: 'text-blue-500',
        },
        {
            title: 'Drawdown',
            description: 'Análise de drawdown e recuperação dos assinantes',
            icon: TrendingUp,
            path: '/subscribers-admin/reports/drawdown',
            color: 'text-red-500',
        },
        {
            title: 'Performance por Horário',
            description: 'Horários mais lucrativos do dia para assinantes',
            icon: Clock,
            path: '/subscribers-admin/reports/hourly-performance',
            color: 'text-indigo-500',
        },
        {
            title: 'Performance por Estratégia',
            description: 'Análise de desempenho por estratégia dos assinantes',
            icon: BarChart3,
            path: '/subscribers-admin/reports/strategy-performance',
            color: 'text-cyan-500',
        },
        {
            title: 'Relatório de Taxas',
            description: 'Análise detalhada das taxas pagas pelos assinantes',
            icon: Layers,
            path: '/subscribers-admin/reports/fees',
            color: 'text-yellow-500',
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Relatórios de Assinantes</h1>
                <p className="text-muted-foreground">
                    Análises e estatísticas de todos os assinantes do sistema
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {reports.map((report) => {
                    const Icon = report.icon
                    return (
                        <Card
                            key={report.path}
                            className="cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => router.push(report.path)}
                        >
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg bg-muted ${report.color}`}>
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <CardTitle>{report.title}</CardTitle>
                                        <CardDescription>{report.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Button variant="outline" className="w-full">
                                    Ver Relatório
                                </Button>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

