'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminService } from '@/lib/api/admin.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, Column } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Filter, RefreshCw, User, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';
import { SymbolDisplay } from '@/components/shared/SymbolDisplay';
import { SubscriberSelect } from '@/components/shared/SubscriberSelect';
import { SubscriberOperation } from '@/lib/types';

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: 'outline',
    PENDING_EXECUTION: 'outline',
    EXECUTING: 'secondary',
    FILLED: 'default',
    PARTIALLY_FILLED: 'secondary',
    CANCELLED: 'destructive',
    FAILED: 'destructive',
    SKIPPED: 'outline',
};

export default function SubscriberOperationsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [filters, setFilters] = useState({
        subscriber_id: searchParams.get('subscriber_id') || 'ALL',
        symbol: '',
        status: 'ALL',
        side: 'ALL',
        trade_mode: 'REAL' as 'REAL' | 'SIMULATION' | 'ALL',
        page: 1,
        limit: 50,
    });

    const { data: subscribers } = useQuery({
        queryKey: ['admin', 'subscribers'],
        queryFn: () => adminService.listSubscribers(),
    });

    const { data: operationsData, isLoading, refetch } = useQuery({
        queryKey: ['admin', 'subscriber-operations', filters],
        queryFn: () => adminService.listSubscriberOperations({
            subscriber_id: filters.subscriber_id && filters.subscriber_id !== 'ALL' ? parseInt(filters.subscriber_id) : undefined,
            symbol: filters.symbol || undefined,
            status: filters.status && filters.status !== 'ALL' ? filters.status : undefined,
            side: filters.side && filters.side !== 'ALL' ? filters.side as any : undefined,
            trade_mode: filters.trade_mode && filters.trade_mode !== 'ALL' ? filters.trade_mode : undefined,
            page: filters.page,
            limit: filters.limit,
        }),
    });

    const operations = operationsData?.data || []

    // Preparar dados para ordenação (adicionar campos calculados)
    const operationsWithSortValues = useMemo(() => {
        return operations.map((op: SubscriberOperation) => ({
            ...op,
            // Campos para ordenação
            _sort_id: op.id,
            _sort_symbol: op.symbol,
            _sort_subscriber: op.subscriber?.email || op.subscriber?.full_name || '',
            _sort_value: op.total_value_usd || 0,
            _sort_side: op.side,
            _sort_status: op.status,
            _sort_created_at: new Date(op.created_at).getTime(),
        }))
    }, [operations])

    // Função helper para formatar motivo resumido
    const getReasonLabel = (reasonCode: string | null | undefined): string => {
        if (!reasonCode) return ''
        const reasonMap: Record<string, string> = {
            'INVALID_PRECISION': 'Precisão Inválida',
            'NO_ELIGIBLE_POSITIONS': 'Sem Posições',
            'POSITION_NOT_AVAILABLE': 'Posição Indisponível',
            'POSITION_ALREADY_CLOSED': 'Posição Fechada',
            'WEBHOOK_LOCK': 'Bloqueado por Webhook',
            'SKIPPED': 'Ignorado',
            'DEBUG_BREAKEVEN': 'Debug Breakeven',
        }
        return reasonMap[reasonCode] || reasonCode
    }

    // Função helper para obter variant do badge de motivo
    const getReasonVariant = (reasonCode: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
        if (!reasonCode) return 'outline'
        if (reasonCode === 'INVALID_PRECISION') return 'default' // amarelo/laranja
        if (reasonCode === 'NO_ELIGIBLE_POSITIONS' || reasonCode === 'SKIPPED') return 'secondary' // cinza
        if (reasonCode === 'POSITION_NOT_AVAILABLE' || reasonCode === 'POSITION_ALREADY_CLOSED') return 'destructive' // vermelho
        return 'outline'
    }

    const columns: Column<SubscriberOperation>[] = [
        {
            key: '_sort_subscriber',
            label: 'Assinante',
            sortable: true,
            render: (op) => (
                <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                        {op.subscriber?.email?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">{op.subscriber?.full_name || op.subscriber?.email}</span>
                        <span className="text-xs text-muted-foreground">{op.subscriber?.email}</span>
                    </div>
                </div>
            ),
        },
        {
            key: '_sort_id',
            label: 'ID',
            sortable: true,
            render: (op) => <span className="font-mono text-sm">#{op.id}</span>,
        },
        {
            key: '_sort_symbol',
            label: 'Símbolo',
            sortable: true,
            render: (op) => (
                <SymbolDisplay symbol={op.symbol} exchange={op.exchange_account?.exchange as any || 'BINANCE_SPOT'} showExchange={false} />
            ),
        },
        {
            key: '_sort_side',
            label: 'Lado',
            sortable: true,
            render: (op) => (
                <div className="flex items-center gap-1">
                    {op.side === 'BUY' ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <Badge variant={op.side === 'BUY' ? 'default' : 'destructive'}>
                        {op.side === 'BUY' ? 'COMPRA' : 'VENDA'}
                    </Badge>
                </div>
            ),
        },
        {
            key: '_sort_status',
            label: 'Status',
            sortable: true,
            render: (op) => (
                <Badge variant={statusColors[op.status] || 'outline'}>
                    {op.status}
                </Badge>
            ),
        },
        {
            key: 'status_reason',
            label: 'Status/Motivo',
            sortable: false,
            render: (op) => {
                const statusVariant = statusColors[op.status] || 'outline'
                const hasReason = op.reason_code && op.status !== 'FILLED'
                
                return (
                    <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant} className="w-fit">
                            {op.status}
                        </Badge>
                        {hasReason && (
                            <Badge 
                                variant={getReasonVariant(op.reason_code)} 
                                className="w-fit text-xs"
                            >
                                {getReasonLabel(op.reason_code)}
                            </Badge>
                        )}
                    </div>
                )
            },
        },
        {
            key: 'order_type',
            label: 'Tipo',
            render: (op) => (
                <Badge variant="outline">{op.order_type}</Badge>
            ),
        },
        {
            key: 'base_quantity',
            label: 'Quantidade',
            render: (op) => <span className="font-mono text-sm">{Number(op.base_quantity || 0).toFixed(4)}</span>,
        },
        {
            key: '_sort_value',
            label: 'Valor',
            sortable: true,
            render: (op) => op.total_value_usd ? formatCurrency(op.total_value_usd) : '-',
        },
        {
            key: 'position_to_close',
            label: 'Posição',
            render: (op) => {
                if (op.side === 'BUY') return '-';
                if (op.position_to_close) {
                    return (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/subscribers-admin/positions/${op.position_to_close?.id}`)}
                        >
                            #{op.position_to_close.id}
                        </Button>
                    );
                }
                return <Badge variant="destructive">Sem posição</Badge>;
            },
        },
        {
            key: '_sort_created_at',
            label: 'Criado em',
            sortable: true,
            render: (op) => formatDateTime(op.created_at),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (op) => (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/subscribers-admin/operations/${op.id}`)}
                >
                    Detalhes
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Operações de Assinantes</h1>
                    <p className="text-muted-foreground">
                        Visualização de todas as operações (trade jobs) de assinantes
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                </Button>
            </div>

            {/* Resumo por Status */}
            {operationsData?.summary?.by_status && (
                <div className="flex flex-wrap gap-2">
                    {operationsData.summary.by_status.map((item: any) => (
                        <Badge key={item.status} variant={statusColors[item.status] || 'outline'} className="text-sm">
                            {item.status}: {item._count?.id || 0}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Filtros */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filtros
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-5">
                        <div className="space-y-2">
                            <Label>Assinante</Label>
                            <SubscriberSelect
                                subscribers={subscribers || []}
                                value={filters.subscriber_id}
                                onValueChange={(value) => setFilters({ ...filters, subscriber_id: value, page: 1 })}
                                placeholder="Todos"
                                allLabel="Todos"
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Símbolo</Label>
                            <Input
                                placeholder="Ex: BTCUSDT"
                                value={filters.symbol}
                                onChange={(e) => setFilters({ ...filters, symbol: e.target.value, page: 1 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Lado</Label>
                            <Select
                                value={filters.side}
                                onValueChange={(value) => setFilters({ ...filters, side: value, page: 1 })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos</SelectItem>
                                    <SelectItem value="BUY">Compra</SelectItem>
                                    <SelectItem value="SELL">Venda</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={filters.status}
                                onValueChange={(value) => setFilters({ ...filters, status: value, page: 1 })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="PENDING_EXECUTION">Pending Execution</SelectItem>
                                    <SelectItem value="EXECUTING">Executing</SelectItem>
                                    <SelectItem value="FILLED">Filled</SelectItem>
                                    <SelectItem value="PARTIALLY_FILLED">Partially Filled</SelectItem>
                                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                    <SelectItem value="FAILED">Failed</SelectItem>
                                    <SelectItem value="SKIPPED">Skipped</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Modo</Label>
                            <Select
                                value={filters.trade_mode}
                                onValueChange={(value) => setFilters({ ...filters, trade_mode: value as any, page: 1 })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos</SelectItem>
                                    <SelectItem value="REAL">REAL</SelectItem>
                                    <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabela */}
            <Card>
                <CardHeader>
                    <CardTitle>Operações</CardTitle>
                    <CardDescription>
                        {operationsData?.pagination?.total || 0} operação(ões) encontrada(s)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <DataTable
                            data={operationsWithSortValues}
                            columns={columns}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

