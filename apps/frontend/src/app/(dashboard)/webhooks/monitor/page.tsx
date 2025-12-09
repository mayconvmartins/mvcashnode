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
import { X, TrendingDown, TrendingUp, Minus, Settings, History, Activity } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { WebhookMonitorConfigForm } from '@/components/webhooks/WebhookMonitorConfigForm'

export default function WebhookMonitorPage() {
    const queryClient = useQueryClient()
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
    const [selectedAlert, setSelectedAlert] = useState<WebhookMonitorAlert | null>(null)
    const [cancelReason, setCancelReason] = useState('')

    const { data: alerts, isLoading: alertsLoading } = useQuery({
        queryKey: ['webhook-monitor-alerts'],
        queryFn: webhookMonitorService.listAlerts,
        refetchInterval: 10000, // Atualizar a cada 10 segundos
    })

    const { data: history, isLoading: historyLoading } = useQuery({
        queryKey: ['webhook-monitor-history'],
        queryFn: () => webhookMonitorService.getHistory({ limit: 50 }),
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
        if (!alert.current_price || !alert.price_minimum) return null

        const currentPrice = typeof alert.current_price === 'number' ? alert.current_price : Number(alert.current_price)
        const minPrice = typeof alert.price_minimum === 'number' ? alert.price_minimum : Number(alert.price_minimum)
        const priceVariation = ((currentPrice - minPrice) / minPrice) * 100

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
            key: 'price_minimum',
            label: 'Preço Mínimo',
            render: (alert) => {
                const price = typeof alert.price_minimum === 'number' ? alert.price_minimum : Number(alert.price_minimum)
                return <span className="font-mono text-green-600">${price.toFixed(8)}</span>
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
            key: 'cycles_without_new_low',
            label: 'Ciclos',
            render: (alert) => (
                <span className="text-sm">{alert.cycles_without_new_low}</span>
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
            key: 'price_minimum',
            label: 'Preço Mínimo',
            render: (alert) => {
                const price = typeof alert.price_minimum === 'number' ? alert.price_minimum : Number(alert.price_minimum)
                return <span className="font-mono">${price.toFixed(8)}</span>
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
            key: 'cancel_reason',
            label: 'Motivo',
            render: (alert) => (
                <span className="text-sm text-muted-foreground">
                    {alert.cancel_reason || (alert.state === 'EXECUTED' ? 'Executado com sucesso' : '-')}
                </span>
            ),
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
            key: 'exchange_account',
            label: 'Conta',
            render: (alert: any) => (
                <span className="text-sm">
                    {alert.exchange_account?.label || alert.exchange_account?.exchange || '-'}
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
                            <CardTitle>Alertas em Monitoramento</CardTitle>
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
                            <CardTitle>Configurações do Monitor</CardTitle>
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
        </div>
    )
}

