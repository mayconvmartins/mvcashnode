'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { webhookMonitorService, type WebhookMonitorAlert, type WebhookMonitorConfig } from '@/lib/api/webhook-monitor.service'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'
import { X, TrendingDown, TrendingUp, Minus, Settings, History, Activity, RefreshCw, Clock, Target } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { WebhookMonitorConfigForm } from '@/components/webhooks/WebhookMonitorConfigForm'
import { WebhookMonitorTimeline } from '@/components/webhooks/WebhookMonitorTimeline'
import { Info } from 'lucide-react'

export default function WebhookMonitorPage() {
    const queryClient = useQueryClient()
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
    const [timelineDialogOpen, setTimelineDialogOpen] = useState(false)
    const [selectedAlert, setSelectedAlert] = useState<WebhookMonitorAlert | null>(null)
    const [cancelReason, setCancelReason] = useState('')

    const { data: alerts, isLoading: alertsLoading, dataUpdatedAt } = useQuery({
        queryKey: ['webhook-monitor-alerts'],
        queryFn: webhookMonitorService.listAlerts,
        refetchInterval: 10000, // Atualizar a cada 10 segundos (otimizado de 3s para reduzir carga)
        staleTime: 5000, // Dados considerados frescos por 5 segundos
    })

    const { data: history, isLoading: historyLoading } = useQuery({
        queryKey: ['webhook-monitor-history'],
        queryFn: () => webhookMonitorService.getHistory({ limit: 50 }),
        staleTime: 30000, // Histórico considerado fresco por 30 segundos
    })

    const { data: summary } = useQuery({
        queryKey: ['webhook-monitor-summary'],
        queryFn: webhookMonitorService.getSummary,
        refetchInterval: 30000, // Atualizar a cada 30 segundos (otimizado de 10s)
        staleTime: 15000, // Dados considerados frescos por 15 segundos
    })

    const cancelMutation = useMutation({
        mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
            webhookMonitorService.cancelAlert(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook-monitor-alerts'] })
            queryClient.invalidateQueries({ queryKey: ['webhook-monitor-history'] })
            toast.success('Alerta cancelado com sucesso!')
            setCancelDialogOpen(false)
            setSelectedAlert(null)
            setCancelReason('')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao cancelar alerta')
        },
    })

    const handleCancelClick = (alert: WebhookMonitorAlert) => {
        setSelectedAlert(alert)
        setCancelDialogOpen(true)
    }

    const handleCancelConfirm = () => {
        if (selectedAlert) {
            cancelMutation.mutate({
                id: selectedAlert.id,
                reason: cancelReason || 'Cancelado manualmente pelo usuário',
            })
        }
    }

    const getTrendIcon = (alert: WebhookMonitorAlert) => {
        const side = (alert as any).side || 'BUY'
        const currentPrice = alert.current_price ? (typeof alert.current_price === 'number' ? alert.current_price : Number(alert.current_price)) : null
        
        if (!currentPrice) return null

        let refPrice: number | null = null
        if (side === 'BUY' && alert.price_minimum) {
            refPrice = typeof alert.price_minimum === 'number' ? alert.price_minimum : Number(alert.price_minimum)
        } else if (side === 'SELL' && (alert as any).price_maximum) {
            refPrice = typeof (alert as any).price_maximum === 'number' ? (alert as any).price_maximum : Number((alert as any).price_maximum)
        }

        if (!refPrice) return null

        const priceVariation = ((currentPrice - refPrice) / refPrice) * 100

        if (priceVariation < -0.1) {
            return <TrendingDown className="h-4 w-4 text-red-500" />
        } else if (priceVariation > 0.5) {
            return <TrendingUp className="h-4 w-4 text-green-500" />
        } else {
            return <Minus className="h-4 w-4 text-yellow-500" />
        }
    }

    const getStateBadge = (state: string) => {
        switch (state) {
            case 'MONITORING':
                return <Badge variant="default">Monitorando</Badge>
            case 'EXECUTED':
                return <Badge className="bg-green-500">Executado</Badge>
            case 'CANCELLED':
                return <Badge variant="secondary">Cancelado</Badge>
            default:
                return <Badge>{state}</Badge>
        }
    }

    const alertColumns: Column<WebhookMonitorAlert>[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (alert) => (
                <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{alert.symbol}</span>
                    {getTrendIcon(alert)}
                </div>
            ),
        },
        {
            key: 'price_alert',
            label: 'Preço Alerta',
            render: (alert) => {
                const price = typeof alert.price_alert === 'number' ? alert.price_alert : Number(alert.price_alert)
                return <span className="font-mono">${price.toFixed(8)}</span>
            },
        },
        {
            key: 'price_first_alert',
            label: '1º Alerta',
            render: (alert: any) => {
                if (!alert.price_first_alert) return <span className="font-mono text-muted-foreground">-</span>
                const priceFirst = typeof alert.price_first_alert === 'number' ? alert.price_first_alert : Number(alert.price_first_alert)
                const priceAlert = typeof alert.price_alert === 'number' ? alert.price_alert : Number(alert.price_alert)
                
                // Se é o mesmo preço, não mostrar
                if (Math.abs(priceFirst - priceAlert) < 0.000001) {
                    return <span className="font-mono text-muted-foreground">-</span>
                }
                
                const replacementCount = alert.replacement_count || 0
                
                return (
                    <div className="flex flex-col">
                        <span className="font-mono text-blue-600">${priceFirst.toFixed(8)}</span>
                        {replacementCount > 0 && (
                            <span className="text-xs text-muted-foreground">({replacementCount} subst.)</span>
                        )}
                    </div>
                )
            },
        },
        {
            key: 'price_minimum',
            label: 'Preço Ref.',
            render: (alert: any) => {
                const side = alert.side || 'BUY'
                let price: number | null = null
                let label = ''
                
                if (side === 'BUY' && alert.price_minimum) {
                    price = typeof alert.price_minimum === 'number' ? alert.price_minimum : Number(alert.price_minimum)
                    label = 'Mín'
                } else if (side === 'SELL' && alert.price_maximum) {
                    price = typeof alert.price_maximum === 'number' ? alert.price_maximum : Number(alert.price_maximum)
                    label = 'Máx'
                }
                
                if (price === null || price === 0) {
                    return <span className="font-mono text-muted-foreground">-</span>
                }
                
                return (
                    <div className="flex flex-col">
                        <span className="font-mono text-green-600">${price.toFixed(8)}</span>
                        <span className="text-xs text-muted-foreground">({label})</span>
                    </div>
                )
            },
        },
        {
            key: 'current_price',
            label: 'Preço Atual',
            render: (alert) => {
                if (!alert.current_price) return <span className="font-mono">-</span>
                const price = typeof alert.current_price === 'number' ? alert.current_price : Number(alert.current_price)
                return <span className="font-mono">${price.toFixed(8)}</span>
            },
        },
        {
            key: 'state',
            label: 'Estado',
            render: (alert) => getStateBadge(alert.state),
        },
        {
            key: 'monitoring_status',
            label: 'Status Monitoramento',
            render: (alert: any) => {
                if (alert.state !== 'MONITORING') return <span className="text-sm text-muted-foreground">-</span>
                
                const status = alert.monitoring_status
                const side = alert.side || 'BUY'
                const cycles = side === 'BUY' ? (alert.cycles_without_new_low || 0) : (alert.cycles_without_new_high || 0)
                
                if (status === 'FALLING') {
                    return <Badge variant="destructive">Em queda</Badge>
                } else if (status === 'LATERAL') {
                    return <Badge className="bg-yellow-500">Lateralizado ({cycles} ciclos)</Badge>
                } else if (status === 'RISING') {
                    return <Badge className="bg-green-500">Em alta ({cycles} ciclos)</Badge>
                }
                return <Badge variant="secondary">Aguardando</Badge>
            },
        },
        {
            key: 'cycles',
            label: 'Ciclos',
            render: (alert: any) => {
                const side = alert.side || 'BUY'
                const cycles = side === 'BUY' ? (alert.cycles_without_new_low || 0) : (alert.cycles_without_new_high || 0)
                return <span className="text-sm">{cycles}</span>
            },
        },
        {
            key: 'created_at',
            label: 'Criado em',
            render: (alert) => (
                <span className="text-sm text-muted-foreground">
                    {formatDateTime(alert.created_at)}
                </span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (alert) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelClick(alert)}
                    disabled={alert.state !== 'MONITORING'}
                >
                    <X className="h-4 w-4" />
                </Button>
            ),
        },
    ]

    const historyColumns: Column<WebhookMonitorAlert>[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (alert) => (
                <span className="font-mono font-medium">{alert.symbol}</span>
            ),
        },
        {
            key: 'price_alert',
            label: 'Preço Alerta',
            render: (alert) => {
                const price = typeof alert.price_alert === 'number' ? alert.price_alert : Number(alert.price_alert)
                return <span className="font-mono">${price.toFixed(8)}</span>
            },
        },
        {
            key: 'price_first_alert',
            label: '1º Alerta',
            render: (alert: any) => {
                if (!alert.price_first_alert) return <span className="font-mono text-muted-foreground">-</span>
                const priceFirst = typeof alert.price_first_alert === 'number' ? alert.price_first_alert : Number(alert.price_first_alert)
                const priceAlert = typeof alert.price_alert === 'number' ? alert.price_alert : Number(alert.price_alert)
                
                // Se é o mesmo preço, não mostrar
                if (Math.abs(priceFirst - priceAlert) < 0.000001) {
                    return <span className="font-mono text-muted-foreground">-</span>
                }
                
                const replacementCount = alert.replacement_count || 0
                
                return (
                    <div className="flex flex-col">
                        <span className="font-mono text-blue-600">${priceFirst.toFixed(8)}</span>
                        {replacementCount > 0 && (
                            <span className="text-xs text-muted-foreground">({replacementCount} subst.)</span>
                        )}
                    </div>
                )
            },
        },
        {
            key: 'price_minimum',
            label: 'Preço Mín/Máx',
            render: (alert: any) => {
                const side = alert.side || 'BUY'
                if (side === 'BUY' && alert.price_minimum) {
                    const price = typeof alert.price_minimum === 'number' ? alert.price_minimum : Number(alert.price_minimum)
                    return <span className="font-mono text-green-600">${price.toFixed(8)}</span>
                } else if (side === 'SELL' && alert.price_maximum) {
                    const price = typeof alert.price_maximum === 'number' ? alert.price_maximum : Number(alert.price_maximum)
                    return <span className="font-mono text-red-600">${price.toFixed(8)}</span>
                }
                return <span className="font-mono">-</span>
            },
        },
        {
            key: 'current_price',
            label: 'Preço Atual',
            render: (alert) => {
                if (!alert.current_price) return <span className="font-mono">-</span>
                const price = typeof alert.current_price === 'number' ? alert.current_price : Number(alert.current_price)
                return <span className="font-mono">${price.toFixed(8)}</span>
            },
        },
        {
            key: 'state',
            label: 'Estado',
            render: (alert) => getStateBadge(alert.state),
        },
        {
            key: 'side',
            label: 'Tipo',
            render: (alert: any) => {
                const side = alert.side || 'BUY'
                return (
                    <Badge variant={side === 'BUY' ? 'default' : 'secondary'}>
                        {side === 'BUY' ? 'Compra' : 'Venda'}
                    </Badge>
                )
            },
        },
        {
            key: 'exit_reason',
            label: 'Motivo Saída',
            render: (alert: any) => {
                if (alert.state === 'EXECUTED') {
                    const exitReason = alert.exit_reason || 'EXECUTED'
                    const reasonMap: Record<string, string> = {
                        'EXECUTED': 'Executado com sucesso',
                        'MAX_FALL': 'Queda máxima excedida',
                        'MAX_RISE': 'Alta máxima excedida',
                        'MAX_TIME': 'Tempo máximo excedido',
                        'REPLACED': 'Substituído por alerta melhor',
                        'COOLDOWN': 'Cooldown ativo',
                        'CANCELLED': 'Cancelado manualmente',
                    }
                    return <span className="text-sm text-green-600">{reasonMap[exitReason] || exitReason}</span>
                } else if (alert.state === 'CANCELLED') {
                    const exitReason = alert.exit_reason || 'CANCELLED'
                    const reasonMap: Record<string, string> = {
                        'MAX_FALL': 'Queda máxima excedida',
                        'MAX_RISE': 'Alta máxima excedida',
                        'MAX_TIME': 'Tempo máximo excedido',
                        'REPLACED': 'Substituído por alerta melhor',
                        'COOLDOWN': 'Cooldown ativo',
                        'CANCELLED': 'Cancelado manualmente',
                    }
                    return (
                        <span className="text-sm text-muted-foreground">
                            {reasonMap[exitReason] || alert.cancel_reason || '-'}
                        </span>
                    )
                }
                return <span className="text-sm text-muted-foreground">-</span>
            },
        },
        {
            key: 'exit_details',
            label: 'Detalhes',
            render: (alert: any) => {
                if (alert.exit_details) {
                    return (
                        <span className="text-sm text-muted-foreground">
                            {alert.exit_details}
                        </span>
                    )
                }
                if (alert.cancel_reason) {
                    return (
                        <span className="text-sm text-muted-foreground">
                            {alert.cancel_reason}
                        </span>
                    )
                }
                return <span className="text-sm text-muted-foreground">-</span>
            },
        },
        {
            key: 'execution_price',
            label: 'Preço Execução',
            render: (alert: any) => {
                if (alert.state === 'EXECUTED' && alert.execution_price) {
                    const price = typeof alert.execution_price === 'number' ? alert.execution_price : Number(alert.execution_price)
                    return <span className="font-mono text-green-600">${price.toFixed(8)}</span>
                }
                return <span className="text-sm text-muted-foreground">-</span>
            },
        },
        {
            key: 'savings_pct',
            label: 'Economia',
            render: (alert: any) => {
                if (alert.savings_pct !== null && alert.savings_pct !== undefined) {
                    const savings = typeof alert.savings_pct === 'number' ? alert.savings_pct : Number(alert.savings_pct)
                    const color = savings > 0 ? 'text-green-600' : 'text-red-600'
                    return <span className={`font-mono ${color}`}>{savings.toFixed(2)}%</span>
                }
                return <span className="text-sm text-muted-foreground">-</span>
            },
        },
        {
            key: 'efficiency_pct',
            label: 'Eficiência',
            render: (alert: any) => {
                if (alert.efficiency_pct !== null && alert.efficiency_pct !== undefined) {
                    const efficiency = typeof alert.efficiency_pct === 'number' ? alert.efficiency_pct : Number(alert.efficiency_pct)
                    return <span className="font-mono">{efficiency.toFixed(1)}%</span>
                }
                return <span className="text-sm text-muted-foreground">-</span>
            },
        },
        {
            key: 'monitoring_duration_minutes',
            label: 'Tempo',
            render: (alert: any) => {
                if (alert.monitoring_duration_minutes) {
                    return <span className="text-sm">{alert.monitoring_duration_minutes}m</span>
                }
                return <span className="text-sm text-muted-foreground">-</span>
            },
        },
        {
            key: 'webhook_source',
            label: 'Webhook',
            render: (alert: any) => (
                <span className="text-sm">
                    {alert.webhook_source?.label || alert.webhook_source?.webhook_code || '-'}
                </span>
            ),
        },
        {
            key: 'created_at',
            label: 'Criado em',
            render: (alert) => (
                <span className="text-sm text-muted-foreground">
                    {formatDateTime(alert.created_at)}
                </span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (alert: any) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        setSelectedAlert(alert)
                        setTimelineDialogOpen(true)
                    }}
                >
                    <Info className="h-4 w-4 mr-1" />
                    Detalhes
                </Button>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Monitor Webhook</h1>
                    <p className="text-muted-foreground mt-1">
                        Monitore alertas de webhook em tempo real antes da execução
                    </p>
                </div>
            </div>

            {/* Cards de Resumo */}
            {summary && (
                <div className="grid gap-4 md:grid-cols-4 mb-6">
                    <Card className="glass">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Monitorando</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{summary.monitoring_count}</div>
                            <p className="text-xs text-muted-foreground">alertas ativos</p>
                        </CardContent>
                    </Card>

                    <Card className="glass">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Economia Média</CardTitle>
                            <TrendingDown className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {summary.avg_savings_pct.toFixed(2)}%
                            </div>
                            <p className="text-xs text-muted-foreground">últimos 30 dias</p>
                        </CardContent>
                    </Card>

                    <Card className="glass">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Eficiência</CardTitle>
                            <Target className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-600">
                                {summary.avg_efficiency_pct.toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground">proximidade ideal</p>
                        </CardContent>
                    </Card>

                    <Card className="glass">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {Math.round(summary.avg_monitoring_time_minutes)}m
                            </div>
                            <p className="text-xs text-muted-foreground">monitoramento</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Tabs defaultValue="active" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="active">
                        <Activity className="h-4 w-4 mr-2" />
                        Monitor Ativo
                    </TabsTrigger>
                    <TabsTrigger value="config">
                        <Settings className="h-4 w-4 mr-2" />
                        Parâmetros
                    </TabsTrigger>
                    <TabsTrigger value="history">
                        <History className="h-4 w-4 mr-2" />
                        Histórico
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                    <Card className="glass">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Alertas em Monitoramento</CardTitle>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <RefreshCw className={`h-4 w-4 ${alertsLoading ? 'animate-spin' : ''}`} />
                                    {dataUpdatedAt && (
                                        <span>
                                            Atualizado: {new Date(dataUpdatedAt).toLocaleTimeString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={alerts || []}
                                columns={alertColumns}
                                loading={alertsLoading}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-lg font-medium mb-2">
                                            Nenhum alerta em monitoramento
                                        </p>
                                        <p className="text-muted-foreground">
                                            Alertas de webhook com monitoramento habilitado aparecerão aqui
                                        </p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="config">
                    <Card className="glass">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Configurações Globais do Monitor</CardTitle>
                                <Badge variant="secondary" className="ml-2">
                                    Global
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                                Estas configurações são aplicadas globalmente para todos os usuários do sistema.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <WebhookMonitorConfigForm />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Histórico de Alertas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={history || []}
                                columns={historyColumns}
                                loading={historyLoading}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-lg font-medium mb-2">
                                            Nenhum histórico encontrado
                                        </p>
                                        <p className="text-muted-foreground">
                                            Alertas executados ou cancelados aparecerão aqui
                                        </p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Cancel Dialog */}
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancelar Alerta</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja cancelar este alerta? Esta ação não pode ser desfeita.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {selectedAlert && (
                            <div className="space-y-2">
                                <p className="text-sm">
                                    <strong>Símbolo:</strong> {selectedAlert.symbol}
                                </p>
                                <p className="text-sm">
                                    <strong>Preço Alerta:</strong> ${(typeof selectedAlert.price_alert === 'number' ? selectedAlert.price_alert : Number(selectedAlert.price_alert)).toFixed(8)}
                                </p>
                                <p className="text-sm">
                                    <strong>Preço Mínimo:</strong> ${(typeof selectedAlert.price_minimum === 'number' ? selectedAlert.price_minimum : Number(selectedAlert.price_minimum)).toFixed(8)}
                                </p>
                            </div>
                        )}
                        <div>
                            <Label htmlFor="cancelReason">Motivo do Cancelamento (opcional)</Label>
                            <Input
                                id="cancelReason"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Ex: Cancelado manualmente"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setCancelDialogOpen(false)
                                    setCancelReason('')
                                }}
                            >
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleCancelConfirm}
                                disabled={cancelMutation.isPending}
                            >
                                {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog de Timeline */}
            <Dialog open={timelineDialogOpen} onOpenChange={setTimelineDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Timeline do Alerta</DialogTitle>
                        <DialogDescription>
                            Histórico detalhado de monitoramento do alerta
                        </DialogDescription>
                    </DialogHeader>
                    {selectedAlert && (
                        <WebhookMonitorTimeline alertId={selectedAlert.id} />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

