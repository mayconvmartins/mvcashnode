'use client';

import { useState } from 'react';
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
        subscriber_id: searchParams.get('subscriber_id') || '',
        symbol: '',
        status: '',
        side: '',
        trade_mode: 'REAL' as 'REAL' | 'SIMULATION' | '',
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
            subscriber_id: filters.subscriber_id ? parseInt(filters.subscriber_id) : undefined,
            symbol: filters.symbol || undefined,
            status: filters.status || undefined,
            side: filters.side as any || undefined,
            trade_mode: filters.trade_mode || undefined,
            page: filters.page,
            limit: filters.limit,
        }),
    });

    const columns: Column<SubscriberOperation>[] = [
        {
            key: 'subscriber',
            label: 'Assinante',
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
            key: 'id',
            label: 'ID',
            render: (op) => <span className="font-mono text-sm">#{op.id}</span>,
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (op) => (
                <SymbolDisplay symbol={op.symbol} exchange={op.exchange_account?.exchange as any || 'BINANCE_SPOT'} showExchange={false} />
            ),
        },
        {
            key: 'side',
            label: 'Lado',
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
            key: 'status',
            label: 'Status',
            render: (op) => (
                <Badge variant={statusColors[op.status] || 'outline'}>
                    {op.status}
                </Badge>
            ),
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
            key: 'total_value_usd',
            label: 'Valor',
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
            key: 'created_at',
            label: 'Criado em',
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
                            <Select
                                value={filters.subscriber_id}
                                onValueChange={(value) => setFilters({ ...filters, subscriber_id: value, page: 1 })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">Todos</SelectItem>
                                    {subscribers?.map((sub: any) => (
                                        <SelectItem key={sub.id} value={sub.id.toString()}>
                                            {sub.profile?.full_name || sub.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                                    <SelectItem value="">Todos</SelectItem>
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
                                    <SelectItem value="">Todos</SelectItem>
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
                                    <SelectItem value="">Todos</SelectItem>
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
                            data={operationsData?.data || []}
                            columns={columns}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

