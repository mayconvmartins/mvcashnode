'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { limitOrdersService } from '@/lib/api/limit-orders.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, X } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils/format'
import { toast } from 'sonner'

export default function LimitOrderDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const orderId = Number(params.id)

    const { data: order, isLoading } = useQuery({
        queryKey: ['limit-order', orderId],
        queryFn: () => limitOrdersService.getOne(orderId),
        enabled: !isNaN(orderId),
    })

    const cancelMutation = useMutation({
        mutationFn: () => limitOrdersService.cancel(orderId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['limit-order', orderId] })
            queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
            toast.success('Ordem cancelada com sucesso!')
        },
        onError: () => {
            toast.error('Falha ao cancelar ordem')
        },
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!order) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Ordem não encontrada</h2>
                <Button onClick={() => router.push('/limit-orders')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Ordens
                </Button>
            </div>
        )
    }

    const statusColors: Record<string, string> = {
        PENDING: 'default',
        FILLED: 'default',
        CANCELLED: 'secondary',
        EXPIRED: 'secondary',
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/limit-orders')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{order.symbol}</h1>
                        <p className="text-muted-foreground">
                            Conta #{order.exchange_account_id} • {order.side}
                        </p>
                    </div>
                </div>
                <Badge variant={statusColors[order.status] as any}>
                    {order.status}
                </Badge>
            </div>

            {/* Order Info */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Preço</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {order.limit_price ? formatCurrency(order.limit_price) : 'N/A'}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Quantidade</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {order.base_quantity || order.quote_amount || 'N/A'}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {order.quote_amount ? formatCurrency(order.quote_amount) : 'N/A'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-mono">{order.id}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Tipo:</span>
                        <span>{order.order_type}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Modo:</span>
                        <span>{order.trade_mode}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Criada em:</span>
                        <span>{formatDate(order.created_at)}</span>
                    </div>
                    {order.created_by && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Criado Por:</span>
                            <Badge variant="outline">
                                {order.created_by === 'USER_MANUAL' ? 'Manual' :
                                 order.created_by === 'WEBHOOK' ? 'Webhook' :
                                 order.created_by === 'SLTP_MONITOR' ? 'Monitor TP/SL' :
                                 order.created_by}
                            </Badge>
                        </div>
                    )}
                    {order.limit_order_expires_at && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Expira em:</span>
                            <span>{formatDate(order.limit_order_expires_at)}</span>
                        </div>
                    )}
                    {order.reason_message && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Mensagem:</span>
                            <span>{order.reason_message}</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Actions */}
            {order.status === 'PENDING' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Ações</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (confirm('Tem certeza que deseja cancelar esta ordem?')) {
                                    cancelMutation.mutate()
                                }
                            }}
                            disabled={cancelMutation.isPending}
                        >
                            <X className="mr-2 h-4 w-4" />
                            {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar Ordem'}
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

