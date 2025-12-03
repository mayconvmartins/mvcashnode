'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, X } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { limitOrdersService } from '@/lib/api/limit-orders.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'

export default function LimitOrdersPage() {
    const queryClient = useQueryClient()
    const { tradeMode } = useTradeMode()

    const { data: orders, isLoading } = useQuery({
        queryKey: ['limit-orders', tradeMode],
        queryFn: () => limitOrdersService.list({ trade_mode: tradeMode }),
    })

    const cancelMutation = useMutation({
        mutationFn: (id: number) => limitOrdersService.cancel(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
            toast.success('Ordem cancelada com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao cancelar ordem')
        },
    })

    const columns: Column<any>[] = [
        { key: 'symbol', label: 'Símbolo', render: (order) => <span className="font-mono">{order.symbol}</span> },
        {
            key: 'side',
            label: 'Lado',
            render: (order) => (
                <Badge variant={order.side === 'BUY' ? 'success' : 'destructive'}>{order.side}</Badge>
            ),
        },
        { key: 'quantity', label: 'Quantidade', render: (order) => <span className="font-mono">{order.quantity}</span> },
        { key: 'price', label: 'Preço', render: (order) => <span className="font-mono">{formatCurrency(order.price)}</span> },
        {
            key: 'status',
            label: 'Status',
            render: (order) => <Badge variant="secondary">{order.status}</Badge>,
        },
        { key: 'created_at', label: 'Criado em', render: (order) => <span className="text-sm">{formatDateTime(order.created_at)}</span> },
        {
            key: 'actions',
            label: 'Ações',
            render: (order) => (
                <div className="flex gap-2">
                    <Link href={`/limit-orders/${order.id}`}>
                        <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                        </Button>
                    </Link>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelMutation.mutate(order.id)}
                        disabled={cancelMutation.isPending}
                    >
                        <X className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Ordens Limit</h1>
                    <p className="text-muted-foreground mt-1">Gerencie suas ordens limit pendentes</p>
                </div>
                <ModeToggle />
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Ordens Pendentes - {tradeMode}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={orders || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">Nenhuma ordem limit pendente</p>
                            </div>
                        }
                    />
                </CardContent>
            </Card>
        </div>
    )
}

