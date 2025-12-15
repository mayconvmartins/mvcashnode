'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, X, History } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { limitOrdersService } from '@/lib/api/limit-orders.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime, formatAssetAmount } from '@/lib/utils/format'
import type { PaginatedResponse } from '@/lib/types'

export default function LimitOrdersPage() {
    const queryClient = useQueryClient()
    const { tradeMode } = useTradeMode()
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
    const [historyPage, setHistoryPage] = useState(1)
    const [pendingPage, setPendingPage] = useState(1)
    const pageSize = 50

    const { data: ordersData, isLoading } = useQuery({
        queryKey: ['limit-orders', tradeMode, activeTab, activeTab === 'history' ? historyPage : pendingPage],
        queryFn: () => {
            if (activeTab === 'history') {
                return limitOrdersService.getHistory({ page: historyPage, limit: pageSize })
            }
            return limitOrdersService.list({ trade_mode: tradeMode, page: pendingPage, limit: pageSize })
        },
    })

    // Extrair dados e paginação da resposta
    const isPaginated = ordersData && typeof ordersData === 'object' && 'data' in ordersData && 'pagination' in ordersData
    const orders = isPaginated ? (ordersData as PaginatedResponse<any>).data : (Array.isArray(ordersData) ? ordersData : [])
    const pagination = isPaginated ? (ordersData as PaginatedResponse<any>).pagination : null

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
        { 
            key: 'id', 
            label: 'ID', 
            render: (order) => (
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">#{order.id}</span>
                    {order.created_by && (
                        <Badge variant="outline" className="text-xs">
                            {order.created_by === 'USER_MANUAL' ? 'Manual' :
                             order.created_by === 'WEBHOOK' ? 'Webhook' :
                             order.created_by === 'SLTP_MONITOR' ? 'Monitor TP/SL' :
                             order.created_by}
                        </Badge>
                    )}
                </div>
            )
        },
        { 
            key: 'symbol', 
            label: 'Símbolo', 
            render: (order) => <span className="font-mono">{order.symbol}</span> 
        },
        {
            key: 'side',
            label: 'Lado',
            render: (order) => (
                <Badge variant={order.side === 'BUY' ? 'success' : 'destructive'}>{order.side}</Badge>
            ),
        },
        { 
            key: 'quantity', 
            label: 'Quantidade', 
            render: (order) => {
                const qty = order.base_quantity || order.quote_amount
                if (!qty) return <span className="text-muted-foreground">-</span>
                if (order.base_quantity) {
                    const baseAsset = order.symbol.split('/')[0] || order.symbol
                    return <span className="font-mono">{formatAssetAmount(order.base_quantity, baseAsset)}</span>
                }
                return <span className="font-mono">{formatCurrency(order.quote_amount)}</span>
            }
        },
        { 
            key: 'price', 
            label: 'Preço Limite', 
            render: (order) => (
                <span className="font-mono">
                    {order.limit_price ? formatCurrency(order.limit_price) : '-'}
                </span>
            )
        },
        {
            key: 'position',
            label: 'Posição',
            render: (order) => {
                if (order.side === 'SELL') {
                    if (order.position_id_to_close) {
                        return (
                            <Link
                                href={`/positions/${order.position_id_to_close}`}
                                className="text-primary hover:underline font-mono text-sm"
                            >
                                #{order.position_id_to_close}
                            </Link>
                        )
                    } else {
                        return (
                            <Badge variant="destructive" className="text-xs">
                                Sem posição
                            </Badge>
                        )
                    }
                }
                return <span className="text-muted-foreground">-</span>
            },
        },
        {
            key: 'status',
            label: 'Status',
            render: (order) => {
                const variant = 
                    order.status === 'FILLED' ? 'success' :
                    order.status === 'CANCELED' || order.status === 'EXPIRED' ? 'destructive' :
                    'secondary'
                return <Badge variant={variant}>{order.status}</Badge>
            },
        },
        { 
            key: 'created_at', 
            label: 'Criado em', 
            render: (order) => <span className="text-sm">{formatDateTime(order.created_at)}</span> 
        },
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
                    {['PENDING', 'PENDING_LIMIT', 'EXECUTING'].includes(order.status) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                if (confirm('Tem certeza que deseja cancelar esta ordem?')) {
                                    cancelMutation.mutate(order.id)
                                }
                            }}
                            disabled={cancelMutation.isPending}
                        >
                            <X className="h-4 w-4 text-destructive" />
                        </Button>
                    )}
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Ordens Limit</h1>
                    <p className="text-muted-foreground mt-1">Gerencie suas ordens limit pendentes e histórico</p>
                </div>
                <ModeToggle />
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'history')} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="pending">Pendentes</TabsTrigger>
                    <TabsTrigger value="history">
                        <History className="h-4 w-4 mr-2" />
                        Histórico
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Ordens Pendentes - {tradeMode}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={orders || []}
                                columns={columns}
                                loading={isLoading}
                                pagination={pagination !== null}
                                currentPage={pagination?.current_page || pendingPage}
                                totalPages={pagination?.total_pages || 1}
                                pageSize={pageSize}
                                onPageChange={(page) => {
                                    setPendingPage(page)
                                }}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">Nenhuma ordem limit pendente</p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Histórico de Ordens Limit - {tradeMode}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={orders || []}
                                columns={columns}
                                loading={isLoading}
                                pagination={pagination !== null}
                                currentPage={pagination?.current_page || historyPage}
                                totalPages={pagination?.total_pages || 1}
                                pageSize={pageSize}
                                onPageChange={(page) => {
                                    setHistoryPage(page)
                                }}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">Nenhuma ordem limit no histórico</p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

