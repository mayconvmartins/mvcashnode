'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils/format'
import { AuditFilters } from '@/components/admin/AuditFilters'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function AuditLogsPage() {
    const [filters, setFilters] = useState({
        user: 'all',
        action: 'all',
        dateFrom: '',
        dateTo: '',
        search: '',
    })
    const [page, setPage] = useState(1)
    const limit = 20

    // Mapear filtros do frontend para o formato da API
    const apiFilters = {
        user_id: filters.user !== 'all' ? Number(filters.user) : undefined,
        action: filters.action !== 'all' ? filters.action : undefined,
        from: filters.dateFrom || undefined,
        to: filters.dateTo || undefined,
        page,
        limit,
    }

    const { data: logs, isLoading } = useQuery({
        queryKey: ['admin', 'audit', apiFilters],
        queryFn: () => adminService.getAuditLogs(apiFilters),
    })

    const handleFilterChange = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
        setPage(1) // Reset página ao mudar filtros
    }

    const getActionBadge = (action: string) => {
        const actionMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; className?: string }> = {
            CREATE: { variant: 'default', label: 'Criar', className: 'bg-green-500 hover:bg-green-600' },
            UPDATE: { variant: 'default', label: 'Atualizar', className: 'bg-blue-500 hover:bg-blue-600' },
            DELETE: { variant: 'destructive', label: 'Deletar' },
            LOGIN: { variant: 'default', label: 'Login', className: 'bg-emerald-500 hover:bg-emerald-600' },
            LOGOUT: { variant: 'secondary', label: 'Logout' },
            FAILED_LOGIN: { variant: 'destructive', label: 'Login Falhou' },
            PASSWORD_CHANGE: { variant: 'outline', label: 'Senha Alterada' },
            '2FA_ENABLE': { variant: 'default', label: '2FA Ativado', className: 'bg-purple-500 hover:bg-purple-600' },
            '2FA_DISABLE': { variant: 'outline', label: '2FA Desativado' },
        }

        const config = actionMap[action] || { variant: 'secondary' as const, label: action }
        return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
    }

    const formatTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        } catch {
            return ''
        }
    }

    const formatDateOnly = (dateStr: string) => {
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        } catch {
            return ''
        }
    }

    const items = logs?.data || []
    const totalPages = logs?.pagination?.total_pages || 1

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold gradient-text">Audit Logs</h1>
                <p className="text-muted-foreground">
                    Histórico de ações e eventos do sistema
                </p>
            </div>

            {/* Filters */}
            <AuditFilters filters={filters} onFilterChange={handleFilterChange} />

            {/* Logs Timeline */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Timeline de Eventos</CardTitle>
                    <CardDescription>
                        {logs?.pagination?.total_items || 0} evento(s) encontrado(s)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            <Skeleton className="h-24" />
                            <Skeleton className="h-24" />
                            <Skeleton className="h-24" />
                        </div>
                    ) : items.length > 0 ? (
                        <div className="space-y-3">
                            {items.map((log: any) => (
                                <div
                                    key={log.id}
                                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex-shrink-0 w-16 text-center">
                                        <div className="text-xs font-medium text-primary">
                                            {formatTime(log.timestamp || log.created_at)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {formatDateOnly(log.timestamp || log.created_at)}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            {getActionBadge(log.action)}
                                            <span className="font-medium text-sm">
                                                {log.entity_type || log.entity || 'Sistema'}
                                            </span>
                                            {log.entity_id && (
                                                <span className="text-xs text-muted-foreground">
                                                    #{log.entity_id}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-2">
                                            {log.description || `${log.action} em ${log.entity_type || 'sistema'}`}
                                        </p>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                            <span className="flex items-center gap-1">
                                                <span className="font-medium">Usuário:</span> 
                                                {log.user?.email || 'Sistema'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="font-medium">IP:</span> 
                                                {log.ip || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-lg mb-2">Nenhum evento encontrado</p>
                            <p className="text-sm">Tente ajustar os filtros ou aguarde novas ações no sistema</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Mostrando {items.length} de {logs?.pagination?.total_items || 0} eventos
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                            Página {page} de {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                        >
                            Próxima
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

