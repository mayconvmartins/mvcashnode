'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import {
    ArrowLeft,
    RefreshCw,
    User,
    DollarSign,
    Package,
    Activity,
    Calendar,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
} from 'lucide-react'
import { formatCurrency, formatDateTime, formatAssetAmount } from '@/lib/utils/format'
import { SymbolDisplay } from '@/components/shared/SymbolDisplay'

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: 'outline',
    PENDING_EXECUTION: 'outline',
    EXECUTING: 'secondary',
    FILLED: 'default',
    PARTIALLY_FILLED: 'secondary',
    CANCELLED: 'destructive',
    FAILED: 'destructive',
    SKIPPED: 'outline',
}

const statusIcons: Record<string, any> = {
    PENDING: Clock,
    PENDING_EXECUTION: Clock,
    EXECUTING: Activity,
    FILLED: CheckCircle,
    PARTIALLY_FILLED: AlertTriangle,
    CANCELLED: XCircle,
    FAILED: XCircle,
    SKIPPED: AlertTriangle,
}

export default function SubscriberOperationDetailPage() {
    const params = useParams()
    const router = useRouter()
    const operationId = parseInt(params.id as string)

    const { data: operation, isLoading, refetch } = useQuery({
        queryKey: ['admin', 'subscriber-operation', operationId],
        queryFn: () => adminService.getSubscriberOperation(operationId),
        enabled: !isNaN(operationId),
    })

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

    if (!operation) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Operação não encontrada</h2>
                <Button onClick={() => router.push('/subscribers-admin/operations')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Operações
                </Button>
            </div>
        )
    }

    const StatusIcon = statusIcons[operation.status] || Clock

    const executionColumns: Column<any>[] = [
        {
            key: 'id',
            label: 'ID',
            render: (exec) => <span className="font-mono">#{exec.id}</span>,
        },
        {
            key: 'exchange_order_id',
            label: 'Order ID Exchange',
            render: (exec) => <span className="font-mono text-xs">{exec.exchange_order_id}</span>,
        },
        {
            key: 'status_exchange',
            label: 'Status',
            render: (exec) => (
                <Badge variant={exec.status_exchange === 'FILLED' ? 'default' : 'outline'}>
                    {exec.status_exchange}
                </Badge>
            ),
        },
        {
            key: 'executed_qty',
            label: 'Quantidade',
            render: (exec) => <span className="font-mono">{formatAssetAmount(exec.executed_qty)}</span>,
        },
        {
            key: 'avg_price',
            label: 'Preço Médio',
            render: (exec) => formatCurrency(exec.avg_price),
        },
        {
            key: 'cumm_quote_qty',
            label: 'Valor Total',
            render: (exec) => formatCurrency(exec.cumm_quote_qty),
        },
        {
            key: 'fee',
            label: 'Taxa',
            render: (exec) => (
                <span className="text-sm">
                    {formatAssetAmount(exec.fee_amount)} {exec.fee_currency}
                </span>
            ),
        },
        {
            key: 'created_at',
            label: 'Data',
            render: (exec) => formatDateTime(exec.created_at),
        },
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/subscribers-admin/operations')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold">Operação #{operation.id}</h1>
                            <Badge variant="outline" className="bg-primary/10">
                                <User className="h-3 w-3 mr-1" />
                                {operation.subscriber?.full_name || operation.subscriber?.email}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">
                            <SymbolDisplay symbol={operation.symbol} exchange={operation.exchange_account?.exchange || 'BINANCE_SPOT'} showExchange={false} />
                            {' • '}
                            {operation.side === 'BUY' ? 'COMPRA' : 'VENDA'}
                            {' • '}
                            {operation.trade_mode}
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                </Button>
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
                            <p className="font-medium">{operation.subscriber?.full_name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Email</p>
                            <p className="font-medium">{operation.subscriber?.email}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Status</p>
                            <Badge variant={operation.subscriber?.is_active ? 'default' : 'secondary'}>
                                {operation.subscriber?.is_active ? 'Ativo' : 'Inativo'}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/subscribers-admin/subscribers/${operation.subscriber?.id}`)}
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
                        <StatusIcon className={`h-4 w-4 ${operation.status === 'FILLED' ? 'text-green-500' : operation.status === 'FAILED' ? 'text-red-500' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <Badge variant={statusColors[operation.status] || 'outline'} className="text-lg">
                            {operation.status}
                        </Badge>
                        {operation.reason_code && (
                            <p className="text-xs text-muted-foreground mt-2">
                                {operation.reason_code}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tipo de Ordem</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{operation.order_type}</div>
                        {operation.limit_price && (
                            <p className="text-xs text-muted-foreground">
                                Limite: {formatCurrency(operation.limit_price)}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Quantidade</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatAssetAmount(operation.base_quantity)}</div>
                        <p className="text-xs text-muted-foreground">
                            Executado: {formatAssetAmount(operation.executed_qty)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(operation.total_value_usd)}</div>
                        {operation.avg_price > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Preço médio: {formatCurrency(operation.avg_price)}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Detalhes adicionais */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhes da Operação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <p className="text-sm text-muted-foreground">Conta de Exchange</p>
                                <p className="font-medium">{operation.exchange_account?.label}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Exchange</p>
                                <p className="font-medium">{operation.exchange_account?.exchange}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Criado por</p>
                                <Badge variant="outline">{operation.created_by || 'SYSTEM'}</Badge>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Criado em</p>
                                <p className="font-medium">{formatDateTime(operation.created_at)}</p>
                            </div>
                        </div>
                        {operation.reason_message && (
                            <div>
                                <p className="text-sm text-muted-foreground">Mensagem</p>
                                <p className="font-medium text-sm">{operation.reason_message}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Posições Relacionadas</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {operation.position_to_close && (
                            <div className="p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Badge variant="destructive">Posição a Fechar</Badge>
                                        <p className="text-sm mt-1">#{operation.position_to_close.id} - {operation.position_to_close.symbol}</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push(`/subscribers-admin/positions/${operation.position_to_close?.id}`)}
                                    >
                                        Ver Posição
                                    </Button>
                                </div>
                            </div>
                        )}
                        {operation.position_open && (
                            <div className="p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Badge variant="default">Posição Aberta</Badge>
                                        <p className="text-sm mt-1">#{operation.position_open.id} - {operation.position_open.symbol}</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push(`/subscribers-admin/positions/${operation.position_open?.id}`)}
                                    >
                                        Ver Posição
                                    </Button>
                                </div>
                            </div>
                        )}
                        {!operation.position_to_close && !operation.position_open && (
                            <p className="text-muted-foreground text-center py-4">
                                Nenhuma posição relacionada
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Tabs com Execuções */}
            <Tabs defaultValue="executions">
                <TabsList>
                    <TabsTrigger value="executions">Execuções ({operation.executions?.length || 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="executions">
                    <Card>
                        <CardHeader>
                            <CardTitle>Execuções na Exchange</CardTitle>
                            <CardDescription>
                                Histórico de todas as execuções desta operação
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {operation.executions && operation.executions.length > 0 ? (
                                <DataTable data={operation.executions} columns={executionColumns} />
                            ) : (
                                <p className="text-muted-foreground text-center py-8">
                                    Nenhuma execução encontrada
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

