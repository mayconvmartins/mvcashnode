'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils/format'
import { AuditFilters } from '@/components/admin/AuditFilters'

export default function AuditLogsPage() {
    const [filters, setFilters] = useState({
        user: 'all',
        action: 'all',
        dateFrom: '',
        dateTo: '',
        search: '',
    })

    const { data: logs, isLoading } = useQuery({
        queryKey: ['admin', 'audit', filters],
        queryFn: () => adminService.getAuditLogs(filters),
    })

    const handleFilterChange = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    const getActionBadge = (action: string) => {
        const actionMap: Record<string, { variant: any; label: string }> = {
            CREATE: { variant: 'default', label: 'Criar' },
            UPDATE: { variant: 'default', label: 'Atualizar' },
            DELETE: { variant: 'destructive', label: 'Deletar' },
            LOGIN: { variant: 'default', label: 'Login' },
            LOGOUT: { variant: 'secondary', label: 'Logout' },
            FAILED_LOGIN: { variant: 'destructive', label: 'Login Falhou' },
        }

        const config = actionMap[action] || { variant: 'secondary', label: action }
        return <Badge variant={config.variant}>{config.label}</Badge>
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Audit Logs</h1>
                <p className="text-muted-foreground">
                    Histórico de ações e eventos do sistema
                </p>
            </div>

            {/* Filters */}
            <AuditFilters filters={filters} onFilterChange={handleFilterChange} />

            {/* Logs Timeline */}
            <Card>
                <CardHeader>
                    <CardTitle>Timeline de Eventos</CardTitle>
                    <CardDescription>
                        {logs?.total || 0} evento(s) encontrado(s)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24" />
                            <Skeleton className="h-24" />
                            <Skeleton className="h-24" />
                        </div>
                    ) : logs && logs.items && logs.items.length > 0 ? (
                        <div className="space-y-4">
                            {logs.items.map((log: any) => (
                                <div
                                    key={log.id}
                                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex-shrink-0 w-20 text-xs text-muted-foreground">
                                        {formatDate(log.timestamp).split(' ')[1]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {getActionBadge(log.action)}
                                            <span className="font-medium">{log.entity || 'Sistema'}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-1">
                                            {log.description || log.action}
                                        </p>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                            <span>Usuário: {log.user?.email || 'Sistema'}</span>
                                            <span>IP: {log.ip || 'N/A'}</span>
                                            {log.userAgent && (
                                                <span className="truncate max-w-xs">
                                                    {log.userAgent}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 text-xs text-muted-foreground">
                                        {formatDate(log.timestamp).split(' ')[0]}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            Nenhum evento encontrado
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {logs && logs.total > (logs.limit || 50) && (
                <div className="flex justify-center">
                    <p className="text-sm text-muted-foreground">
                        Mostrando {logs.items?.length || 0} de {logs.total} eventos
                    </p>
                </div>
            )}
        </div>
    )
}

