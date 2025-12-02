'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { TrendingUp, Target, DollarSign, Activity } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
    const { data: summary, isLoading } = useQuery({
        queryKey: ['dashboard', 'summary'],
        queryFn: () => reportsService.getDashboardSummary(),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Visão geral do sistema</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <StatsCard
                    title="Posições Abertas"
                    value={summary?.openPositions || 0}
                    icon={Target}
                    trend={summary?.positionsTrend}
                />
                <StatsCard
                    title="PnL do Dia"
                    value={`$${(summary?.dailyPnL || 0).toFixed(2)}`}
                    icon={TrendingUp}
                    trend={summary?.pnlTrend}
                />
                <StatsCard
                    title="Saldo Total"
                    value={`$${(summary?.totalBalance || 0).toFixed(2)}`}
                    icon={DollarSign}
                />
                <StatsCard
                    title="Contas Ativas"
                    value={summary?.activeAccounts || 0}
                    icon={Activity}
                />
            </div>

            {/* Quick Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Bem-vindo ao Trading Automation</CardTitle>
                    <CardDescription>
                        Sistema de automação de trading com webhooks, gestão de posições e muito mais
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Use o menu lateral para navegar entre as diferentes seções do sistema.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
