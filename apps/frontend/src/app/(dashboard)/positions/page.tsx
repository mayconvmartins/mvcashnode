'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, TrendingUp, TrendingDown, DollarSign, Filter, ChevronDown, RefreshCw, Settings } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { DataTableAdvanced, type Column as ColumnAdvanced } from '@/components/shared/DataTableAdvanced'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { SymbolDisplay } from '@/components/shared/SymbolDisplay'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { positionsService } from '@/lib/api/positions.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import type { Position, PaginatedResponse } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'
import { Skeleton } from '@/components/ui/skeleton'

export default function PositionsPage() {
    const { tradeMode } = useTradeMode()
    const queryClient = useQueryClient()
    const [selectedSymbol, setSelectedSymbol] = useState<string>('all')
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('all')
    const [closedPage, setClosedPage] = useState(1)
    const [filtersOpen, setFiltersOpen] = useState(false)
    const closedLimit = 20
    const [selectedPositionIds, setSelectedPositionIds] = useState<(string | number)[]>([])
    const [bulkSLTPDialogOpen, setBulkSLTPDialogOpen] = useState(false)
    const [bulkSLEnabled, setBulkSLEnabled] = useState(false)
    const [bulkSLPct, setBulkSLPct] = useState<string>('')
    const [bulkTPEnabled, setBulkTPEnabled] = useState(false)
    const [bulkTPPct, setBulkTPPct] = useState<string>('')

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    // Construir filtros para posições abertas
    const openFilters = useMemo(() => {
        const filters: any = {
            status: 'OPEN',
            trade_mode: tradeMode,
        }
        if (selectedSymbol !== 'all') filters.symbol = selectedSymbol
        if (selectedAccount !== 'all') filters.exchange_account_id = parseInt(selectedAccount)
        if (dateFrom) filters.from = dateFrom
        if (dateTo) filters.to = dateTo
        return filters
    }, [tradeMode, selectedSymbol, selectedAccount, dateFrom, dateTo])

    // Construir filtros para posições fechadas
    const closedFilters = useMemo(() => {
        const filters: any = {
            status: 'CLOSED',
            trade_mode: tradeMode,
            page: closedPage,
            limit: closedLimit,
        }
        if (selectedSymbol !== 'all') filters.symbol = selectedSymbol
        if (selectedAccount !== 'all') filters.exchange_account_id = parseInt(selectedAccount)
        if (dateFrom) filters.from = dateFrom
        if (dateTo) filters.to = dateTo
        return filters
    }, [tradeMode, selectedSymbol, selectedAccount, dateFrom, dateTo, closedPage])

    const { data: openPositionsData, isLoading: loadingOpen } = useQuery({
        queryKey: ['positions', 'OPEN', openFilters],
        queryFn: () => positionsService.list(openFilters),
        refetchInterval: 30000, // Refetch a cada 30s
    })

    const { data: closedPositionsData, isLoading: loadingClosed } = useQuery({
        queryKey: ['positions', 'CLOSED', closedFilters],
        queryFn: () => positionsService.list(closedFilters),
    })

    // Extrair dados, paginação e summary
    const openPositions = Array.isArray(openPositionsData) 
        ? openPositionsData 
        : (openPositionsData as any)?.data || []
    const openSummary = (openPositionsData as any)?.summary

    const closedPositions = Array.isArray(closedPositionsData) 
        ? closedPositionsData 
        : (closedPositionsData as any)?.data || []
    const closedPagination = (closedPositionsData as any)?.pagination
    const closedSummary = (closedPositionsData as any)?.summary

    // Obter lista de símbolos únicos
    const uniqueSymbols = useMemo(() => {
        const symbols = new Set<string>()
        openPositions?.forEach((p: Position) => symbols.add(p.symbol))
        closedPositions?.forEach((p: Position) => symbols.add(p.symbol))
        return Array.from(symbols).sort()
    }, [openPositions, closedPositions])

    // Usar summary do backend quando disponível, senão calcular no frontend
    const consolidatedMetrics = useMemo(() => {
        // Se temos summary do backend, usar ele (combinando abertas e fechadas)
        if (openSummary || closedSummary) {
            const totalInvested = (openSummary?.total_invested || 0) + (closedSummary?.total_invested || 0)
            const totalCurrentValue = (openSummary?.total_current_value || 0) + (closedSummary?.total_current_value || 0)
            const totalUnrealizedPnl = (openSummary?.total_unrealized_pnl || 0) + (closedSummary?.total_unrealized_pnl || 0)
            const totalRealizedPnl = (openSummary?.total_realized_pnl || 0) + (closedSummary?.total_realized_pnl || 0)
            
            // Calcular percentual baseado no total investido
            const unrealizedPnlPct = totalInvested > 0 
                ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 
                : (openSummary?.total_unrealized_pnl_pct || closedSummary?.total_unrealized_pnl_pct || 0)

            // Contar posições fechadas com lucro
            const closedCount = closedPositions.filter((p: Position) => 
                Number(p.realized_profit_usd || 0) !== 0
            ).length

            return {
                totalInvested,
                totalCurrentValue,
                totalUnrealizedPnl,
                unrealizedPnlPct,
                totalRealizedPnl,
                closedCount,
            }
        }

        // Fallback: calcular no frontend se não tiver summary
        const openPos = openPositions || []
        const closedPos = closedPositions || []
        
        let totalInvested = 0
        let totalCurrentValue = 0
        let totalUnrealizedPnl = 0
        let totalRealizedPnl = 0
        let closedCount = 0

        // Calcular para posições abertas
        openPos.forEach((position: Position) => {
            if (position.invested_value_usd) {
                totalInvested += position.invested_value_usd
            } else {
                const qtyTotal = Number(position.qty_total || 0)
                const priceOpen = Number(position.price_open || 0)
                totalInvested += qtyTotal * priceOpen
            }

            if (position.current_value_usd) {
                totalCurrentValue += position.current_value_usd
            } else if (position.current_price) {
                const qtyRemaining = Number(position.qty_remaining || 0)
                totalCurrentValue += qtyRemaining * position.current_price
            }

            if (position.unrealized_pnl !== null && position.unrealized_pnl !== undefined) {
                totalUnrealizedPnl += position.unrealized_pnl
            } else if (position.current_price) {
                const qtyRemaining = Number(position.qty_remaining || 0)
                const priceOpen = Number(position.price_open || 0)
                totalUnrealizedPnl += (position.current_price - priceOpen) * qtyRemaining
            }
        })

        // Calcular PnL realizado
        openPos.forEach((position: Position) => {
            totalRealizedPnl += Number(position.realized_profit_usd || 0)
        })

        closedPos.forEach((position: Position) => {
            totalRealizedPnl += Number(position.realized_profit_usd || 0)
            if (Number(position.realized_profit_usd || 0) !== 0) {
                closedCount++
            }
        })

        const unrealizedPnlPct = totalInvested > 0 
            ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 
            : 0

        return {
            totalInvested,
            totalCurrentValue,
            totalUnrealizedPnl,
            unrealizedPnlPct,
            totalRealizedPnl,
            closedCount,
        }
    }, [openPositions, closedPositions, openSummary, closedSummary])

    const handleDateChange = useCallback((from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
        // Resetar página quando mudar filtros
        setClosedPage(1)
    }, [])

    const syncMissingMutation = useMutation({
        mutationFn: positionsService.syncMissing,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['operations'] })
            if (data.positions_created > 0 || data.executions_updated > 0) {
                toast.success(
                    `Sincronização concluída: ${data.positions_created} posição(ões) criada(s), ${data.executions_updated} execução(ões) atualizada(s)`
                )
            } else {
                toast.info('Nenhuma posição faltante encontrada')
            }
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} erro(s) durante a sincronização`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao sincronizar posições')
        },
    })

    const bulkUpdateSLTPMutation = useMutation({
        mutationFn: positionsService.bulkUpdateSLTP,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            setBulkSLTPDialogOpen(false)
            setSelectedPositionIds([])
            setBulkSLEnabled(false)
            setBulkSLPct('')
            setBulkTPEnabled(false)
            setBulkTPPct('')
            if (data.updated > 0) {
                toast.success(`${data.updated} posição(ões) atualizada(s) com sucesso`)
            }
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} erro(s) durante a atualização`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao atualizar TP/SL em massa')
        },
    })

    const handleBulkUpdateSLTP = () => {
        if (selectedPositionIds.length === 0) {
            toast.error('Selecione pelo menos uma posição')
            return
        }

        const updateData: any = {
            positionIds: selectedPositionIds.map(id => Number(id)),
        }

        if (bulkSLEnabled && bulkSLPct) {
            updateData.slEnabled = true
            updateData.slPct = parseFloat(bulkSLPct)
        } else if (bulkSLEnabled === false) {
            updateData.slEnabled = false
        }

        if (bulkTPEnabled && bulkTPPct) {
            updateData.tpEnabled = true
            updateData.tpPct = parseFloat(bulkTPPct)
        } else if (bulkTPEnabled === false) {
            updateData.tpEnabled = false
        }

        bulkUpdateSLTPMutation.mutate(updateData)
    }

    const columns: (Column<Position> | ColumnAdvanced<Position>)[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (position) => (
                <SymbolDisplay
                    exchange={position.exchange_account_id as any}
                    symbol={position.symbol}
                    showExchange={false}
                />
            ),
        },
        {
            key: 'exchange_account',
            label: 'Conta',
            render: (position) => {
                const account = (position as any).exchange_account;
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
            key: 'side',
            label: 'Lado',
            render: (position) => (
                <Badge variant={position.side === 'LONG' ? 'success' : 'destructive'}>
                    {position.side === 'LONG' ? 'COMPRA' : position.side}
                </Badge>
            ),
        },
        {
            key: 'qty_remaining',
            label: 'Quantidade',
            render: (position) => <span className="font-mono">{Number(position.qty_remaining || 0).toFixed(4)}</span>,
        },
        {
            key: 'price_open',
            label: 'Preço Entrada',
            render: (position) => <span className="font-mono">{formatCurrency(Number(position.price_open || 0))}</span>,
        },
        {
            key: 'current_price',
            label: 'Preço Atual',
            render: (position) => {
                // Para posições fechadas, mostrar preço de venda executado
                if (position.status === 'CLOSED') {
                    return (
                        <span className="font-mono">
                            {position.price_close ? formatCurrency(position.price_close) : '-'}
                        </span>
                    )
                }
                // Para posições abertas, mostrar preço atual
                return (
                    <span className="font-mono">
                        {position.current_price ? formatCurrency(position.current_price) : '-'}
                    </span>
                )
            },
        },
        {
            key: 'invested_value_usd',
            label: 'Valor Comprado',
            render: (position) => (
                <span className="font-mono">
                    {position.invested_value_usd ? formatCurrency(position.invested_value_usd) : '-'}
                </span>
            ),
        },
        {
            key: 'realized_profit_usd',
            label: 'PnL Realizado',
            render: (position) => <PnLBadge value={Number(position.realized_profit_usd || 0)} />,
        },
        {
            key: 'unrealized_pnl',
            label: 'PnL Não Realizado',
            render: (position) => <PnLBadge value={position.unrealized_pnl || 0} />,
        },
        {
            key: 'sl_tp',
            label: 'SL/TP',
            render: (position) => (
                <div className="flex gap-1">
                    {position.sl_enabled && <Badge variant="outline">SL</Badge>}
                    {position.tp_enabled && <Badge variant="outline">TP</Badge>}
                </div>
            ),
        },
        {
            key: 'min_profit_pct',
            label: 'Lucro Mínimo',
            render: (position) => (
                position.min_profit_pct !== null && position.min_profit_pct !== undefined ? (
                    <Badge variant="outline" className="font-mono">
                        {Number(position.min_profit_pct).toFixed(2)}%
                    </Badge>
                ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                )
            ),
        },
        {
            key: 'created_at',
            label: 'Abertura',
            render: (position) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(position.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (position) => (
                <Link href={`/positions/${position.id}`}>
                    <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                    </Button>
                </Link>
            ),
        },
    ]

    const hasActiveFilters = selectedSymbol !== 'all' || selectedAccount !== 'all' || datePreset !== 'all'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Posições</h1>
                    <p className="text-muted-foreground mt-1">Gerencie suas posições de trading</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => syncMissingMutation.mutate()}
                        disabled={syncMissingMutation.isPending}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncMissingMutation.isPending ? 'animate-spin' : ''}`} />
                        Sincronizar Posições Faltantes
                    </Button>
                    <ModeToggle />
                </div>
            </div>

            {/* Cards de Resumo Consolidado */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Valor Investido
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingOpen ? (
                            <Skeleton className="h-8 w-32" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">
                                    {formatCurrency(consolidatedMetrics.totalInvested)}
                                </div>
                                {consolidatedMetrics.totalCurrentValue > 0 && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Valor atual: {formatCurrency(consolidatedMetrics.totalCurrentValue)}
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            {consolidatedMetrics.totalUnrealizedPnl >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            PnL Não Realizado
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingOpen ? (
                            <Skeleton className="h-8 w-32" />
                        ) : (
                            <>
                                <div className={`text-2xl font-bold ${
                                    consolidatedMetrics.totalUnrealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
                                }`}>
                                    {formatCurrency(consolidatedMetrics.totalUnrealizedPnl)}
                                </div>
                                {consolidatedMetrics.unrealizedPnlPct !== 0 && (
                                    <p className={`text-sm mt-1 ${
                                        consolidatedMetrics.unrealizedPnlPct >= 0 ? 'text-green-500' : 'text-red-500'
                                    }`}>
                                        {consolidatedMetrics.unrealizedPnlPct >= 0 ? '+' : ''}
                                        {consolidatedMetrics.unrealizedPnlPct.toFixed(2)}%
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription className="flex items-center gap-2">
                            {consolidatedMetrics.totalRealizedPnl >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            PnL Realizado
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingOpen ? (
                            <Skeleton className="h-8 w-32" />
                        ) : (
                            <>
                                <div className={`text-2xl font-bold ${
                                    consolidatedMetrics.totalRealizedPnl >= 0 ? 'text-green-500' : 'text-red-500'
                                }`}>
                                    {formatCurrency(consolidatedMetrics.totalRealizedPnl)}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {consolidatedMetrics.closedCount} {consolidatedMetrics.closedCount === 1 ? 'venda concluída' : 'vendas concluídas'}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Filtros Colapsáveis */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    <CardTitle className="text-lg">Filtros</CardTitle>
                                    {hasActiveFilters && (
                                        <Badge variant="secondary" className="ml-2">
                                            Ativos
                                        </Badge>
                                    )}
                                </div>
                                <ChevronDown 
                                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                                        filtersOpen ? 'transform rotate-180' : ''
                                    }`}
                                />
                            </div>
                            {!filtersOpen && hasActiveFilters && (
                                <CardDescription className="mt-2">
                                    {selectedSymbol !== 'all' && `Símbolo: ${selectedSymbol} • `}
                                    {selectedAccount !== 'all' && accounts && `Conta: ${accounts.find(a => a.id.toString() === selectedAccount)?.label} • `}
                                    {datePreset !== 'all' && `Período: ${datePreset === 'custom' ? 'Personalizado' : datePreset}`}
                                </CardDescription>
                            )}
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="symbol-filter">Símbolo</Label>
                                    <Select value={selectedSymbol} onValueChange={(value) => {
                                        setSelectedSymbol(value)
                                        setClosedPage(1)
                                    }}>
                                        <SelectTrigger id="symbol-filter">
                                            <SelectValue placeholder="Todos os símbolos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos os símbolos</SelectItem>
                                            {uniqueSymbols.map(symbol => (
                                                <SelectItem key={symbol} value={symbol}>
                                                    {symbol}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="account-filter">Conta</Label>
                                    <Select value={selectedAccount} onValueChange={(value) => {
                                        setSelectedAccount(value)
                                        setClosedPage(1)
                                    }}>
                                        <SelectTrigger id="account-filter">
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
                                </div>
                            </div>

                            <DateRangeFilter
                                from={dateFrom}
                                to={dateTo}
                                preset={datePreset}
                                onDateChange={handleDateChange}
                            />
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Tabs defaultValue="open" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="open">Abertas ({openPositions?.length || 0})</TabsTrigger>
                    <TabsTrigger value="closed">
                        Fechadas ({closedPagination?.total_items || closedPositions?.length || 0})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="open">
                    <Card className="glass">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>
                                    Posições Abertas - {tradeMode}
                                    {selectedSymbol !== 'all' && ` • ${selectedSymbol}`}
                                    {selectedAccount !== 'all' && accounts && ` • ${accounts.find(a => a.id.toString() === selectedAccount)?.label}`}
                                </CardTitle>
                                {selectedPositionIds.length > 0 && (
                                    <Button
                                        onClick={() => setBulkSLTPDialogOpen(true)}
                                        variant="default"
                                        size="sm"
                                    >
                                        <Settings className="h-4 w-4 mr-2" />
                                        Definir TP/SL ({selectedPositionIds.length})
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <DataTableAdvanced
                                data={openPositions || []}
                                columns={columns}
                                loading={loadingOpen}
                                enableSelection={true}
                                selectedIds={selectedPositionIds}
                                onSelectionChange={setSelectedPositionIds}
                                bulkActions={(selectedIds) => (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">
                                            {selectedIds.length} selecionada(s)
                                        </span>
                                        <Button
                                            onClick={() => setBulkSLTPDialogOpen(true)}
                                            variant="default"
                                            size="sm"
                                        >
                                            <Settings className="h-4 w-4 mr-2" />
                                            Definir TP/SL
                                        </Button>
                                    </div>
                                )}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">
                                            {hasActiveFilters
                                                ? 'Nenhuma posição aberta encontrada com os filtros aplicados'
                                                : 'Nenhuma posição aberta'
                                            }
                                        </p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="closed">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>
                                Posições Fechadas - {tradeMode}
                                {selectedSymbol !== 'all' && ` • ${selectedSymbol}`}
                                {selectedAccount !== 'all' && accounts && ` • ${accounts.find(a => a.id.toString() === selectedAccount)?.label}`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={closedPositions || []}
                                columns={columns}
                                loading={loadingClosed}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">
                                            {hasActiveFilters
                                                ? 'Nenhuma posição fechada encontrada com os filtros aplicados'
                                                : 'Nenhuma posição fechada'
                                            }
                                        </p>
                                    </div>
                                }
                            />
                            
                            {/* Paginação para posições fechadas */}
                            {closedPagination && closedPagination.total_pages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <div className="text-sm text-muted-foreground">
                                        Página {closedPagination.current_page} de {closedPagination.total_pages} 
                                        ({closedPagination.total_items} total)
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={closedPage <= 1 || loadingClosed}
                                            onClick={() => setClosedPage(prev => Math.max(1, prev - 1))}
                                        >
                                            Anterior
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={closedPage >= closedPagination.total_pages || loadingClosed}
                                            onClick={() => setClosedPage(prev => prev + 1)}
                                        >
                                            Próxima
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialog para definir TP/SL em massa */}
            <Dialog open={bulkSLTPDialogOpen} onOpenChange={setBulkSLTPDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Definir TP/SL em Massa</DialogTitle>
                        <DialogDescription>
                            Configure Take Profit e Stop Loss para {selectedPositionIds.length} posição(ões) selecionada(s)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        {/* Stop Loss */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="bulk-sl-enabled"
                                    checked={bulkSLEnabled}
                                    onCheckedChange={(checked) => setBulkSLEnabled(checked === true)}
                                />
                                <Label htmlFor="bulk-sl-enabled" className="font-medium">
                                    Habilitar Stop Loss
                                </Label>
                            </div>
                            {bulkSLEnabled && (
                                <div className="space-y-2 pl-6">
                                    <Label htmlFor="bulk-sl-pct">Stop Loss (%)</Label>
                                    <Input
                                        id="bulk-sl-pct"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        placeholder="Ex: 2.0"
                                        value={bulkSLPct}
                                        onChange={(e) => setBulkSLPct(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Take Profit */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="bulk-tp-enabled"
                                    checked={bulkTPEnabled}
                                    onCheckedChange={(checked) => setBulkTPEnabled(checked === true)}
                                />
                                <Label htmlFor="bulk-tp-enabled" className="font-medium">
                                    Habilitar Take Profit
                                </Label>
                            </div>
                            {bulkTPEnabled && (
                                <div className="space-y-2 pl-6">
                                    <Label htmlFor="bulk-tp-pct">Take Profit (%)</Label>
                                    <Input
                                        id="bulk-tp-pct"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        placeholder="Ex: 5.0"
                                        value={bulkTPPct}
                                        onChange={(e) => setBulkTPPct(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setBulkSLTPDialogOpen(false)
                                setBulkSLEnabled(false)
                                setBulkSLPct('')
                                setBulkTPEnabled(false)
                                setBulkTPPct('')
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleBulkUpdateSLTP}
                            disabled={bulkUpdateSLTPMutation.isPending || (!bulkSLEnabled && !bulkTPEnabled)}
                        >
                            {bulkUpdateSLTPMutation.isPending ? 'Atualizando...' : 'Aplicar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
