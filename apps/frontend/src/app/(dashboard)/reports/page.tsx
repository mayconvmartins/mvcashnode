'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, PieChart, TrendingUp, Webhook } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ReportsIndexPage() {
    const router = useRouter()

    const reports = [
        {
            title: 'PnL por Período',
            description: 'Análise de lucros e perdas ao longo do tempo',
            icon: TrendingUp,
            path: '/reports/pnl',
            color: 'text-green-500',
        },
        {
            title: 'Posições Abertas',
            description: 'Exposição atual por símbolo e conta',
            icon: PieChart,
            path: '/reports/open-positions',
            color: 'text-blue-500',
        },
        {
            title: 'Vaults',
            description: 'Consolidação de saldos e performance',
            icon: BarChart3,
            path: '/reports/vaults',
            color: 'text-purple-500',
        },
        {
            title: 'Webhooks',
            description: 'Performance e taxa de conversão',
            icon: Webhook,
            path: '/reports/webhooks',
            color: 'text-orange-500',
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Relatórios</h1>
                <p className="text-muted-foreground">
                    Análises e estatísticas do sistema
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

