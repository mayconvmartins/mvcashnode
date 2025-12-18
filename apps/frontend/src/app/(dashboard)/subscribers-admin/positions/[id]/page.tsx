'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    ArrowLeft,
    Lock,
    Unlock,
    TrendingUp,
    TrendingDown,
    Settings,
    DollarSign,
    Package,
    Target,
    AlertTriangle,
    Activity,
    Calendar,
    RefreshCw,
    Loader2,
    User,
} from 'lucide-react'
import { formatCurrency, formatDateTime, formatAssetAmount } from '@/lib/utils/format'
import { toast } from 'sonner'
import { useState } from 'react'

export default function SubscriberPositionDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const positionId = parseInt(params.id as string)

    const [showUpdateDialog, setShowUpdateDialog] = useState(false)
    const [updateData, setUpdateData] = useState({
        lock_sell_by_webhook: false,
        sl_enabled: false,
        sl_pct: '',
        tp_enabled: false,
        tp_pct: '',
        sg_enabled: false,
        sg_pct: '',
        sg_drop_pct: '',
        tsg_enabled: false,
        tsg_activation_pct: '',
        tsg_drop_pct: '',
    })

    const { data: position, isLoading, refetch } = useQuery({
        queryKey: ['admin', 'subscriber-position', positionId],
        queryFn: () => adminService.getSubscriberPosition(positionId),
        enabled: !isNaN(positionId),
        refetchInterval: 30000,
    })

    // Mutation para bulk update (funciona para uma posição também)
    const updateMutation = useMutation({
        mutationFn: (data: any) => adminService.bulkUpdateSubscriberPositions(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-position', positionId] })
            toast.success('Posição atualizada com sucesso')
            setShowUpdateDialog(false)
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar posição')
        },
    })

    const handleOpenUpdateDialog = () => {
        if (position) {
            setUpdateData({
                lock_sell_by_webhook: position.lock_sell_by_webhook || false,
                sl_enabled: position.sl_enabled || false,
                sl_pct: position.sl_pct?.toString() || '',
                tp_enabled: position.tp_enabled || false,
                tp_pct: position.tp_pct?.toString() || '',
                sg_enabled: position.sg_enabled || false,
                sg_pct: position.sg_pct?.toString() || '',
                sg_drop_pct: position.sg_drop_pct?.toString() || '',
                tsg_enabled: position.tsg_enabled || false,
                tsg_activation_pct: position.tsg_activation_pct?.toString() || '',
                tsg_drop_pct: position.tsg_drop_pct?.toString() || '',
            })
            setShowUpdateDialog(true)
        }
    }

    const handleUpdate = () => {
        const data: any = { positionIds: [positionId] }

        data.lock_sell_by_webhook = updateData.lock_sell_by_webhook
        data.sl_enabled = updateData.sl_enabled
        if (updateData.sl_enabled && updateData.sl_pct) {
            data.sl_pct = parseFloat(updateData.sl_pct)
        }
        data.tp_enabled = updateData.tp_enabled
        if (updateData.tp_enabled && updateData.tp_pct) {
            data.tp_pct = parseFloat(updateData.tp_pct)
        }
        data.sg_enabled = updateData.sg_enabled
        if (updateData.sg_enabled && updateData.sg_pct) {
            data.sg_pct = parseFloat(updateData.sg_pct)
        }
        if (updateData.sg_enabled && updateData.sg_drop_pct) {
            data.sg_drop_pct = parseFloat(updateData.sg_drop_pct)
        }
        data.tsg_enabled = updateData.tsg_enabled
        if (updateData.tsg_enabled && updateData.tsg_activation_pct) {
            data.tsg_activation_pct = parseFloat(updateData.tsg_activation_pct)
        }
        if (updateData.tsg_enabled && updateData.tsg_drop_pct) {
            data.tsg_drop_pct = parseFloat(updateData.tsg_drop_pct)
        }

        updateMutation.mutate(data)
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
            </div>
        )
    }

    if (!position) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Posição não encontrada</h2>
                <Button onClick={() => router.push('/subscribers-admin/positions')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Posições
                </Button>
            </div>
        )
    }

    const qtyClosed = Number(position.qty_total || 0) - Number(position.qty_remaining || 0)
    const qtyClosedPct = Number(position.qty_total || 0) > 0 ? (qtyClosed / Number(position.qty_total || 0)) * 100 : 0
    const priceOpen = Number(position.price_open || 0)
    const currentPrice = position.current_price || priceOpen
    const unrealizedPnlPct = position.unrealized_pnl_pct || 0
    const isProfit = unrealizedPnlPct >= 0

    const fillsColumns: Column<any>[] = [
        {
            key: 'side',
            label: 'Lado',
            render: (fill) => (
                <Badge variant={fill.side === 'BUY' ? 'default' : 'destructive'}>
                    {fill.side}
                </Badge>
            ),
        },
        {
            key: 'qty',
            label: 'Quantidade',
            render: (fill) => <span className="font-mono">{formatAssetAmount(fill.qty)}</span>,
        },
        {
            key: 'price',
            label: 'Preço',
            render: (fill) => formatCurrency(fill.price),
        },
        {
            key: 'created_at',
            label: 'Data',
            render: (fill) => formatDateTime(fill.created_at),
        },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/subscribers-admin/positions')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold">{position.symbol}</h1>
                            <Badge variant="outline" className="bg-primary/10">
                                <User className="h-3 w-3 mr-1" />
                                {position.subscriber?.full_name || position.subscriber?.email}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">
                            {position.exchange_account?.label} • {position.trade_mode} • Posição #{position.id}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                    <Button size="sm" onClick={handleOpenUpdateDialog}>
                        <Settings className="h-4 w-4 mr-2" />
                        Editar SL/TP
                    </Button>
                </div>
            </div>

            {/* Subscriber Info Card */}
            <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Informações do Assinante
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Nome</p>
                            <p className="font-medium">{position.subscriber?.full_name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium">{position.subscriber?.email}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Status</p>
                            <Badge variant={position.subscriber?.is_active ? 'default' : 'secondary'}>
                                {position.subscriber?.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/subscribers-admin/subscribers/${position.subscriber?.id}`)}
                            >
                                Ver Perfil
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Cards de métricas */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Badge variant={position.status === 'OPEN' ? 'default' : 'secondary'} className="text-lg">
                            {position.status}
                        </Badge>
                        {position.lock_sell_by_webhook && (
                            <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                                <Lock className="h-3 w-3" />
                                <span>Webhook bloqueado</span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Preço Entrada</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(priceOpen)}</div>
                        <p className="text-xs text-muted-foreground">
                            Atual: {formatCurrency(currentPrice)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Quantidade</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatAssetAmount(position.qty_remaining)}</div>
                        <p className="text-xs text-muted-foreground">
                            de {formatAssetAmount(position.qty_total)} ({(100 - qtyClosedPct).toFixed(1)}%)
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">PnL</CardTitle>
                        {isProfit ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                            <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                            {unrealizedPnlPct >= 0 ? '+' : ''}{unrealizedPnlPct.toFixed(2)}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {formatCurrency(position.unrealized_pnl_usd || 0)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Configurações SL/TP/SG/TSG */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5" />
                            Stop Loss / Take Profit
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Stop Loss</span>
                            {position.sl_enabled ? (
                                <div className="flex items-center gap-2">
                                    <Badge variant="destructive">{position.sl_pct}%</Badge>
                                    {position.sl_triggered && <Badge variant="outline">Triggered</Badge>}
                                </div>
                            ) : (
                                <Badge variant="outline">Desabilitado</Badge>
                            )}
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Take Profit</span>
                            {position.tp_enabled ? (
                                <div className="flex items-center gap-2">
                                    <Badge variant="default">{position.tp_pct}%</Badge>
                                    {position.tp_triggered && <Badge variant="outline">Triggered</Badge>}
                                </div>
                            ) : (
                                <Badge variant="outline">Desabilitado</Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Stop Gain / TSG
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Stop Gain (SG)</span>
                            {position.sg_enabled ? (
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary">
                                        {position.sg_pct}% / -{position.sg_drop_pct}%
                                    </Badge>
                                    {position.sg_activated && <Badge className="bg-green-500">Ativado</Badge>}
                                    {position.sg_triggered && <Badge variant="outline">Triggered</Badge>}
                                </div>
                            ) : (
                                <Badge variant="outline">Desabilitado</Badge>
                            )}
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Trailing Stop Gain (TSG)</span>
                            {position.tsg_enabled ? (
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-purple-500/20 text-purple-600 dark:text-purple-400">
                                        {position.tsg_activation_pct}% / -{position.tsg_drop_pct}%
                                    </Badge>
                                    {position.tsg_activated && <Badge className="bg-purple-500">Ativado</Badge>}
                                    {position.tsg_triggered && <Badge variant="outline">Triggered</Badge>}
                                </div>
                            ) : (
                                <Badge variant="outline">Desabilitado</Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs com Fills e Jobs */}
            <Tabs defaultValue="fills">
                <TabsList>
                    <TabsTrigger value="fills">Fills ({position.fills?.length || 0})</TabsTrigger>
                    <TabsTrigger value="jobs">Operações ({(position.close_jobs?.length || 0) + 1})</TabsTrigger>
                </TabsList>

                <TabsContent value="fills">
                    <Card>
                        <CardHeader>
                            <CardTitle>Histórico de Execuções</CardTitle>
                            <CardDescription>
                                Todas as execuções (compras e vendas) relacionadas a esta posição
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {position.fills && position.fills.length > 0 ? (
                                <DataTable data={position.fills} columns={fillsColumns} />
                            ) : (
                                <p className="text-muted-foreground text-center py-8">
                                    Nenhum fill encontrado
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="jobs">
                    <Card>
                        <CardHeader>
                            <CardTitle>Operações Relacionadas</CardTitle>
                            <CardDescription>
                                Jobs de compra e venda relacionados a esta posição
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {position.open_job && (
                                    <div className="flex items-center justify-between p-4 border rounded-lg">
                                        <div>
                                            <Badge variant="default">COMPRA</Badge>
                                            <span className="ml-2 text-sm">Job #{position.open_job.id}</span>
                                            <span className="ml-2 text-sm text-muted-foreground">
                                                {position.open_job.status}
                                            </span>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => router.push(`/subscribers-admin/operations/${position.open_job.id}`)}
                                        >
                                            Ver Detalhes
                                        </Button>
                                    </div>
                                )}
                                {position.close_jobs?.map((job: any) => (
                                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                                        <div>
                                            <Badge variant="destructive">VENDA</Badge>
                                            <span className="ml-2 text-sm">Job #{job.id}</span>
                                            <span className="ml-2 text-sm text-muted-foreground">
                                                {job.status}
                                            </span>
                                            {job.reason_code && (
                                                <Badge variant="outline" className="ml-2">
                                                    {job.reason_code}
                                                </Badge>
                                            )}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => router.push(`/subscribers-admin/operations/${job.id}`)}
                                        >
                                            Ver Detalhes
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialog de Update */}
            <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar Configurações de SL/TP</DialogTitle>
                        <DialogDescription>
                            Atualizar configurações para a posição #{positionId}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Bloquear Venda por Webhook</Label>
                                <p className="text-sm text-muted-foreground">Impede vendas automáticas via webhook</p>
                            </div>
                            <Switch
                                checked={updateData.lock_sell_by_webhook}
                                onCheckedChange={(checked) => setUpdateData({ ...updateData, lock_sell_by_webhook: checked })}
                            />
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Stop Loss</Label>
                                <Switch
                                    checked={updateData.sl_enabled}
                                    onCheckedChange={(checked) => setUpdateData({ ...updateData, sl_enabled: checked })}
                                />
                            </div>
                            {updateData.sl_enabled && (
                                <div className="space-y-2">
                                    <Label>SL (%)</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={updateData.sl_pct}
                                        onChange={(e) => setUpdateData({ ...updateData, sl_pct: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Take Profit</Label>
                                <Switch
                                    checked={updateData.tp_enabled}
                                    onCheckedChange={(checked) => setUpdateData({ ...updateData, tp_enabled: checked })}
                                />
                            </div>
                            {updateData.tp_enabled && (
                                <div className="space-y-2">
                                    <Label>TP (%)</Label>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={updateData.tp_pct}
                                        onChange={(e) => setUpdateData({ ...updateData, tp_pct: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>Stop Gain (SG)</Label>
                                <Switch
                                    checked={updateData.sg_enabled}
                                    onCheckedChange={(checked) => setUpdateData({ ...updateData, sg_enabled: checked })}
                                />
                            </div>
                            {updateData.sg_enabled && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Ativação (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={updateData.sg_pct}
                                            onChange={(e) => setUpdateData({ ...updateData, sg_pct: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Queda (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={updateData.sg_drop_pct}
                                            onChange={(e) => setUpdateData({ ...updateData, sg_drop_pct: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <Separator />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Trailing Stop Gain (TSG)</Label>
                                    <p className="text-xs text-muted-foreground">Desativa TP e SG automaticamente</p>
                                </div>
                                <Switch
                                    checked={updateData.tsg_enabled}
                                    onCheckedChange={(checked) => setUpdateData({ ...updateData, tsg_enabled: checked })}
                                />
                            </div>
                            {updateData.tsg_enabled && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Ativação (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={updateData.tsg_activation_pct}
                                            onChange={(e) => setUpdateData({ ...updateData, tsg_activation_pct: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Queda (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={updateData.tsg_drop_pct}
                                            onChange={(e) => setUpdateData({ ...updateData, tsg_drop_pct: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Atualizando...
                                </>
                            ) : (
                                'Salvar Alterações'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

