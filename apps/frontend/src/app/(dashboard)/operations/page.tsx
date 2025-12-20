'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ResponsiveFilters, FilterField } from '@/components/shared/ResponsiveFilters'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { operationsService } from '@/lib/api/operations.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { formatDateTime, formatCurrency } from '@/lib/utils/format'
import { Eye, Search } from 'lucide-react'
import Link from 'next/link'

export default function OperationsPage() {
    const { tradeMode } = useTradeMode()
    const router = useRouter()
    const [page, setPage] = useState(1)
    const pageSize = 20

    // Estados dos filtros
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [sideFilter, setSideFilter] = useState<string>('all')
    const [symbolFilter, setSymbolFilter] = useState<string>('all')
    const [accountFilter, setAccountFilter] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('all')
    const [searchId, setSearchId] = useState<string>('')

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { 
            trade_mode: tradeMode,
            page,
            limit: pageSize,
        }
        if (statusFilter !== 'all') f.status = statusFilter
        if (sideFilter !== 'all') f.side = sideFilter
        if (symbolFilter !== 'all') f.symbol = symbolFilter
        if (accountFilter !== 'all') f.exchange_account_id = parseInt(accountFilter)
        if (dateFrom) f.from = dateFrom
        if (dateTo) f.to = dateTo
        if (searchId) f.id = parseInt(searchId)
        return f
    }, [tradeMode, page, statusFilter, sideFilter, symbolFilter, accountFilter, dateFrom, dateTo, searchId])

    // Buscar operações
    const { data: operationsResponse, isLoading } = useQuery({
        queryKey: ['operations', filters],
        queryFn: () => operationsService.list(filters),
    })

    // Extrair símbolos únicos das operações
    const availableSymbols = useMemo(() => {
        const symbols = new Set<string>()
        operationsResponse?.data?.forEach((op: any) => {
            if (op.job?.symbol) symbols.add(op.job.symbol)
        })
        return Array.from(symbols).sort()
    }, [operationsResponse])

    // Filtros ativos para exibir
    const activeFilters = useMemo(() => {
        const filters: Array<{ id: string; label: string; value: string }> = []
        if (statusFilter !== 'all') {
            filters.push({ id: 'status', label: 'Status', value: statusFilter })
        }
        if (sideFilter !== 'all') {
            filters.push({ id: 'side', label: 'Lado', value: sideFilter })
        }
        if (symbolFilter !== 'all') {
            filters.push({ id: 'symbol', label: 'Símbolo', value: symbolFilter })
        }
        if (accountFilter !== 'all') {
            const account = accounts?.find(a => a.id.toString() === accountFilter)
            filters.push({ id: 'account', label: 'Conta', value: account?.label || accountFilter })
        }
        if (datePreset !== 'all' || dateFrom || dateTo) {
            filters.push({ id: 'date', label: 'Data', value: datePreset === 'all' ? 'Personalizado' : datePreset })
        }
        if (searchId) {
            filters.push({ id: 'id', label: 'ID', value: searchId })
        }
        return filters
    }, [statusFilter, sideFilter, symbolFilter, accountFilter, datePreset, dateFrom, dateTo, searchId, accounts])

    const handleClearFilter = (id: string) => {
        switch (id) {
            case 'status':
                setStatusFilter('all')
                break
            case 'side':
                setSideFilter('all')
                break
            case 'symbol':
                setSymbolFilter('all')
                break
            case 'account':
                setAccountFilter('all')
                break
            case 'date':
                setDatePreset('all')
                setDateFrom(undefined)
                setDateTo(undefined)
                break
            case 'id':
                setSearchId('')
                break
        }
        setPage(1)
    }

    const handleClearAll = () => {
        setStatusFilter('all')
        setSideFilter('all')
        setSymbolFilter('all')
        setAccountFilter('all')
        setDatePreset('all')
        setDateFrom(undefined)
        setDateTo(undefined)
        setSearchId('')
        setPage(1)
    }

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
        setPage(1)
    }

    const operations = operationsResponse?.data || []

    const columns: Column<any>[] = [
        { 
            key: 'id', 
            label: 'ID', 
            render: (op) => <span className="font-mono">#{op.job.id}</span> 
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (op) => <span className="font-mono">{op.job.symbol}</span>
        },
        {
            key: 'account',
            label: 'Conta',
            render: (op) => {
                const account = op.job.exchange_account;
                if (account) {
                    return (
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{account.label}</span>
                            <span className="text-xs text-muted-foreground">{account.exchange}</span>
                        </div>
                    );
                }
                return <span className="text-sm text-muted-foreground">-</span>;
            },
        },
        {
            key: 'value',
            label: 'Valor',
            render: (op) => {
                const totalValue = op.executions.reduce((sum: number, exec: any) => {
                    return sum + (exec.cumm_quote_qty || 0);
                }, 0);
                return (
                    <span className="font-mono text-sm">
                        {totalValue > 0 ? formatCurrency(totalValue) : '-'}
                    </span>
                );
            },
        },
        {
            key: 'side',
            label: 'Lado',
            render: (op) => (
                <Badge variant={op.job.side === 'BUY' ? 'success' : 'destructive'}>
                    {op.job.side}
                </Badge>
            ),
        },
        {
            key: 'status',
            label: 'Status',
            render: (op) => {
                const variant =
                    op.job.status === 'FILLED'
                        ? 'success'
                        : op.job.status === 'FAILED'
                        ? 'destructive'
                        : 'secondary'
                return <Badge variant={variant}>{op.job.status}</Badge>
            },
        },
        {
            key: 'order_type',
            label: 'Tipo',
            render: (op) => <Badge variant="outline">{op.job.order_type}</Badge>,
        },
        {
            key: 'position_to_close',
            label: 'Posição Alvo',
            render: (op) => {
                if (op.job.side === 'SELL') {
                    if (op.job.position_id_to_close) {
                        return (
                            <Link
                                href={`/positions/${op.job.position_id_to_close}`}
                                className="text-primary hover:underline font-mono text-sm"
                            >
                                #{op.job.position_id_to_close}
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
            key: 'executions',
            label: 'Execuções',
            render: (op) => <span>{op.executions.length}</span>
        },
        { 
            key: 'created_at', 
            label: 'Criado em', 
            render: (op) => <span className="text-sm">{formatDateTime(op.job.created_at)}</span> 
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (op) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/operations/${op.job.id}`)}
                >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Detalhes
                </Button>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Operações</h1>
                    <p className="text-muted-foreground mt-1">Visualize jobs e execuções de trading</p>
                </div>
                <ModeToggle />
            </div>

            {/* Filtros */}
            <Card className="glass">
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveFilters
                        activeFilters={activeFilters}
                        onClearFilter={handleClearFilter}
                        onClearAll={handleClearAll}
                        title="Filtros de Operações"
                        description="Filtre operações por status, lado, símbolo, conta, data ou ID"
                    >
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            <FilterField label="Pesquisar por ID">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="number"
                                        placeholder="ID da operação"
                                        value={searchId}
                                        onChange={(e) => {
                                            setSearchId(e.target.value)
                                            setPage(1)
                                        }}
                                        className="pl-8"
                                    />
                                </div>
                            </FilterField>

                            <FilterField label="Status">
                                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos os status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os status</SelectItem>
                                        <SelectItem value="PENDING">PENDING</SelectItem>
                                        <SelectItem value="PENDING_LIMIT">PENDING_LIMIT</SelectItem>
                                        <SelectItem value="EXECUTING">EXECUTING</SelectItem>
                                        <SelectItem value="FILLED">FILLED</SelectItem>
                                        <SelectItem value="FAILED">FAILED</SelectItem>
                                        <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FilterField>

                            <FilterField label="Lado">
                                <Select value={sideFilter} onValueChange={(v) => { setSideFilter(v); setPage(1) }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos os lados" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os lados</SelectItem>
                                        <SelectItem value="BUY">COMPRA</SelectItem>
                                        <SelectItem value="SELL">VENDA</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FilterField>

                            <FilterField label="Símbolo">
                                <Select value={symbolFilter} onValueChange={(v) => { setSymbolFilter(v); setPage(1) }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos os símbolos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos os símbolos</SelectItem>
                                        {availableSymbols.map((symbol) => (
                                            <SelectItem key={symbol} value={symbol}>
                                                {symbol}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FilterField>

                            <FilterField label="Conta de Exchange">
                                <Select value={accountFilter} onValueChange={(v) => { setAccountFilter(v); setPage(1) }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todas as contas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas as contas</SelectItem>
                                        {accounts?.filter(acc => {
                                            const accTradeMode = acc.is_simulation ? 'SIMULATION' : 'REAL'
                                            return accTradeMode === tradeMode
                                        }).map(account => (
                                            <SelectItem key={account.id} value={account.id.toString()}>
                                                {account.label} ({account.exchange})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FilterField>
                        </div>

                        <div className="mt-4">
                            <DateRangeFilter
                                from={dateFrom}
                                to={dateTo}
                                preset={datePreset}
                                onDateChange={handleDateChange}
                            />
                        </div>
                    </ResponsiveFilters>
                </CardContent>
            </Card>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todas as Operações - {tradeMode}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={operations}
                        columns={columns}
                        loading={isLoading}
                        pagination={!!operationsResponse?.pagination}
                        currentPage={operationsResponse?.pagination?.current_page || page}
                        totalPages={operationsResponse?.pagination?.total_pages || 1}
                        pageSize={pageSize}
                        onPageChange={(newPage) => {
                            setPage(newPage)
                        }}
                        emptyState={
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">Nenhuma operação encontrada</p>
                            </div>
                        }
                    />
                </CardContent>
            </Card>
        </div>
    )
}


