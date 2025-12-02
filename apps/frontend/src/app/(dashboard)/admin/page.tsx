'use client'

import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Activity, AlertCircle, CheckCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'

export default function AdminDashboardPage() {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['admin', 'stats'],
        queryFn: () => adminService.getStats(),
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
                <h1 className="text-3xl font-bold">Administração</h1>
                <p className="text-muted-foreground">
                    Painel de controle e gerenciamento do sistema
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Total de Usuários</CardDescription>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.activeUsers || 0} ativos
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Sessões Ativas</CardDescription>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.activeSessions || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Últimas 24h
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Eventos de Auditoria</CardDescription>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.auditEvents || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Hoje
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Status do Sistema</CardDescription>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">Operacional</div>
                        <p className="text-xs text-muted-foreground">
                            Uptime: {stats?.uptime || '99.9%'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Atividade Recente</CardTitle>
                        <CardDescription>Últimas ações no sistema</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                                stats.recentActivity.map((activity: any, index: number) => (
                                    <div key={index} className="flex items-center gap-4">
                                        <div className="w-2 h-2 rounded-full bg-primary" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {activity.action}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {activity.user} • {formatDate(activity.timestamp)}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    Nenhuma atividade recente
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Alertas do Sistema</CardTitle>
                        <CardDescription>Notificações importantes</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats?.alerts && stats.alerts.length > 0 ? (
                                stats.alerts.map((alert: any, index: number) => (
                                    <div
                                        key={index}
                                        className={`flex items-start gap-3 p-3 rounded-lg ${
                                            alert.level === 'error'
                                                ? 'bg-destructive/10'
                                                : alert.level === 'warning'
                                                ? 'bg-yellow-500/10'
                                                : 'bg-blue-500/10'
                                        }`}
                                    >
                                        <AlertCircle
                                            className={`h-4 w-4 mt-0.5 ${
                                                alert.level === 'error'
                                                    ? 'text-destructive'
                                                    : alert.level === 'warning'
                                                    ? 'text-yellow-500'
                                                    : 'text-blue-500'
                                            }`}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{alert.title}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {alert.message}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    Nenhum alerta
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Acesso Rápido</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4">
                    <a
                        href="/admin/users"
                        className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                        <Users className="h-8 w-8 mb-2 text-primary" />
                        <span className="text-sm font-medium">Usuários</span>
                    </a>
                    <a
                        href="/admin/health"
                        className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                        <Activity className="h-8 w-8 mb-2 text-primary" />
                        <span className="text-sm font-medium">Health Check</span>
                    </a>
                    <a
                        href="/admin/audit"
                        className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                        <AlertCircle className="h-8 w-8 mb-2 text-primary" />
                        <span className="text-sm font-medium">Audit Logs</span>
                    </a>
                    <a
                        href="/"
                        className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                        <CheckCircle className="h-8 w-8 mb-2 text-primary" />
                        <span className="text-sm font-medium">Dashboard</span>
                    </a>
                </CardContent>
            </Card>
        </div>
    )
}

