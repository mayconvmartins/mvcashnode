'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, TrendingUp, TrendingDown, DollarSign, Filter, ChevronDown, RefreshCw, Settings, Target, Layers, Lock, Unlock } from 'lucide-react'
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
import { useAuth } from '@/lib/hooks/useAuth'
import type { Position, PaginatedResponse, GroupPreview } from '@/lib/types'
import { UserRole } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateManualPositionModal } from '@/components/positions/CreateManualPositionModal'
import { ManualBuyModal } from '@/components/positions/ManualBuyModal'
import { GroupPositionsModal } from '@/components/positions/GroupPositionsModal'
import { Plus, ShoppingCart } from 'lucide-react'

export default function PositionsPage() {
    const { tradeMode } = useTradeMode()
    const { user, isLoading: isLoadingUser } = useAuth()
    const queryClient = useQueryClient()
    const [selectedSymbol, setSelectedSymbol] = useState<string>('all')
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('all')
    const [closedPage, setClosedPage] = useState(1)
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [closedLimit, setClosedLimit] = useState(20)
    const [selectedPositionIds, setSelectedPositionIds] = useState<(string | number)[]>([])
    const [bulkSLTPDialogOpen, setBulkSLTPDialogOpen] = useState(false)
    const [bulkSLEnabled, setBulkSLEnabled] = useState(false)
    const [bulkSLPct, setBulkSLPct] = useState<string>('')
    const [bulkWebhookDialogOpen, setBulkWebhookDialogOpen] = useState(false)
    const [bulkWebhookLockAction, setBulkWebhookLockAction] = useState<boolean | null>(null)
    const [bulkTPEnabled, setBulkTPEnabled] = useState(false)
    const [bulkTPPct, setBulkTPPct] = useState<string>('')
    const [bulkSGEnabled, setBulkSGEnabled] = useState(false)
    const [bulkSGPct, setBulkSGPct] = useState<string>('')
    const [bulkSGDropPct, setBulkSGDropPct] = useState<string>('')
    const [createManualModalOpen, setCreateManualModalOpen] = useState(false)
    const [manualBuyModalOpen, setManualBuyModalOpen] = useState(false)
    const [bulkMinProfitDialogOpen, setBulkMinProfitDialogOpen] = useState(false)
    const [bulkMinProfitPct, setBulkMinProfitPct] = useState<string>('')
    const [bulkMinProfitRemove, setBulkMinProfitRemove] = useState(false)
    const [groupModalOpen, setGroupModalOpen] = useState(false)
    const [groupPreview, setGroupPreview] = useState<GroupPreview | null>(null)
    const [dustPage, setDustPage] = useState(1)
    const [dustLimit, setDustLimit] = useState(20)
    const [positionTypeFilter, setPositionTypeFilter] = useState<'normal' | 'todas'>('normal')

    // Verificar se o usuário é admin (usando a mesma lógica dos outros componentes)
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue === UserRole.ADMIN || roleValue?.toLowerCase?.() === 'admin'
    }) || false

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
            limit: 1000, // Carregar todas as posições abertas
        }
        if (selectedSymbol !== 'all') filters.symbol = selectedSymbol
        if (selectedAccount !== 'all') filters.exchange_account_id = parseInt(selectedAccount)
        if (dateFrom) filters.from = dateFrom
        if (dateTo) filters.to = dateTo
        // Por padrão, excluir resíduos. Só incluir se o filtro for "todas"
        if (positionTypeFilter === 'normal') {
            filters.is_dust = false
        }
        return filters
    }, [tradeMode, selectedSymbol, selectedAccount, dateFrom, dateTo, positionTypeFilter])

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
    }, [tradeMode, selectedSymbol, selectedAccount, dateFrom, dateTo, closedPage, closedLimit])

    // Construir filtros para posições resíduo
    const dustFilters = useMemo(() => {
        const filters: any = {
            status: 'OPEN',
            trade_mode: tradeMode,
            is_dust: true,
            page: dustPage,
            limit: dustLimit,
        }
        if (selectedSymbol !== 'all') filters.symbol = selectedSymbol
        if (selectedAccount !== 'all') filters.exchange_account_id = parseInt(selectedAccount)
        if (dateFrom) filters.from = dateFrom
        if (dateTo) filters.to = dateTo
        return filters
    }, [tradeMode, selectedSymbol, selectedAccount, dateFrom, dateTo, dustPage, dustLimit])

    const { data: openPositionsData, isLoading: loadingOpen } = useQuery({
        queryKey: ['positions', 'OPEN', openFilters],
        queryFn: () => positionsService.list(openFilters),
        refetchInterval: 60000, // Refetch a cada 60s (otimizado de 30s)
        staleTime: 30000, // Dados considerados frescos por 30 segundos
    })

    const { data: closedPositionsData, isLoading: loadingClosed } = useQuery({
        queryKey: ['positions', 'CLOSED', closedFilters],
        queryFn: () => positionsService.list(closedFilters),
        staleTime: 60000, // Posições fechadas mudam pouco, staleTime maior
    })

    const { data: dustPositionsData, isLoading: loadingDust } = useQuery({
        queryKey: ['positions', 'DUST', dustFilters],
        queryFn: () => positionsService.list(dustFilters),
        refetchInterval: 60000, // Refetch a cada 60s (otimizado de 30s)
        staleTime: 30000, // Dados considerados frescos por 30 segundos
    })

    // Extrair dados, paginação e summary
    const openPositions = Array.isArray(openPositionsData) 
        ? openPositionsData 
        : (openPositionsData as any)?.data || []
    const openSummary = (openPositionsData as any)?.summary

    const closedPositions = Array.isArray(closedPositionsData) 
        ? closedPositionsData 
        : (closedPositionsData as any)?.data || []

    const dustPositions = Array.isArray(dustPositionsData) 
        ? dustPositionsData 
        : (dustPositionsData as any)?.data || []
    
    const dustPagination = Array.isArray(dustPositionsData) 
        ? null 
        : (dustPositionsData as any)?.pagination || null
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
            setBulkSGEnabled(false)
            setBulkSGPct('')
            setBulkSGDropPct('')
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

        if (bulkSGEnabled && bulkSGPct && bulkSGDropPct) {
            // Validações
            const sgPctNum = parseFloat(bulkSGPct)
            const sgDropPctNum = parseFloat(bulkSGDropPct)
            const tpPctNum = bulkTPPct ? parseFloat(bulkTPPct) : undefined
            
            if (tpPctNum && sgPctNum >= tpPctNum) {
                toast.error('Stop Gain deve ser menor que Take Profit')
                return
            }
            
            if (sgDropPctNum <= 0 || sgDropPctNum >= sgPctNum) {
                toast.error('Queda do Stop Gain deve ser > 0 e < Stop Gain')
                return
            }
            
            updateData.sgEnabled = true
            updateData.sgPct = sgPctNum
            updateData.sgDropPct = sgDropPctNum
        } else if (bulkSGEnabled === false) {
            updateData.sgEnabled = false
        }

        bulkUpdateSLTPMutation.mutate(updateData)
    }

    const bulkUpdateMinProfitMutation = useMutation({
        mutationFn: positionsService.bulkUpdateMinProfit,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            setBulkMinProfitDialogOpen(false)
            setSelectedPositionIds([])
            setBulkMinProfitPct('')
            setBulkMinProfitRemove(false)
            if (data.updated > 0) {
                toast.success(`${data.updated} posição(ões) atualizada(s) com sucesso`)
            }
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} erro(s) durante a atualização`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao atualizar lucro mínimo em massa')
        },
    })

    const handleBulkUpdateMinProfit = () => {
        if (selectedPositionIds.length === 0) {
            toast.error('Selecione pelo menos uma posição')
            return
        }

        const updateData: any = {
            positionIds: selectedPositionIds.map(id => Number(id)),
        }

        if (bulkMinProfitRemove) {
            updateData.minProfitPct = null
        } else if (bulkMinProfitPct) {
            const pct = parseFloat(bulkMinProfitPct)
            if (isNaN(pct) || pct <= 0) {
                toast.error('Lucro mínimo deve ser maior que zero')
                return
            }
            updateData.minProfitPct = pct
        } else {
            toast.error('Defina um valor de lucro mínimo ou marque para remover')
            return
        }

        bulkUpdateMinProfitMutation.mutate(updateData)
    }

    // Verificar se posições selecionadas são elegíveis para agrupamento
    const canGroupPositions = useMemo(() => {
        if (selectedPositionIds.length < 2) return false
        
        const selected = openPositions.filter((p: Position) => 
            selectedPositionIds.includes(p.id)
        )
        
        if (selected.length !== selectedPositionIds.length) return false
        if (selected.some((p: Position) => p.status !== 'OPEN')) return false
        if (selected.some((p: Position) => Number(p.qty_remaining || 0) <= 0)) return false
        
        // Todas devem ter mesmo símbolo
        const symbols = new Set(selected.map((p: Position) => p.symbol))
        if (symbols.size > 1) return false
        
        // Todas devem ter mesma conta
        const accounts = new Set(selected.map((p: Position) => p.exchange_account_id))
        if (accounts.size > 1) return false
        
        // Todas devem ter mesmo trade_mode
        const modes = new Set(selected.map((p: Position) => p.trade_mode))
        if (modes.size > 1) return false
        
        return true
    }, [selectedPositionIds, openPositions])

    const handleGroupPreview = async () => {
        try {
            const preview = await positionsService.groupPreview(
                selectedPositionIds.map(id => Number(id))
            )
            setGroupPreview(preview)
            setGroupModalOpen(true)
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Erro ao obter preview do agrupamento')
        }
    }
    
    const handleGroupConfirm = async () => {
        try {
            await positionsService.groupPositions(
                selectedPositionIds.map(id => Number(id))
            )
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            setGroupModalOpen(false)
            setSelectedPositionIds([])
            setGroupPreview(null)
            toast.success('Posições agrupadas com sucesso')
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Erro ao agrupar posições')
            throw error
        }
    }

    const handleBulkLockWebhook = async (lock: boolean) => {
        try {
            const selected = openPositions.filter((p: Position) => 
                selectedPositionIds.includes(p.id)
            )
            
            const promises = selected.map((position: Position) =>
                positionsService.lockSellByWebhook(position.id, lock)
            )
            
            await Promise.all(promises)
            
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success(`${selected.length} posição(ões) ${lock ? 'bloqueada(s)' : 'desbloqueada(s)'} para webhook`)
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Erro ao atualizar bloqueio de webhook')
        }
    }

    // Colunas para DataTableAdvanced (posições abertas com seleção)
    // DataTableAdvanced só aceita label como string, não como função
    const openColumns = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (position: Position) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <SymbolDisplay
                            exchange={position.exchange_account_id as any}
                            symbol={position.symbol}
                            showExchange={false}
                        />
                        {position.is_dust && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/50 text-xs">
                                Resíduo
                            </Badge>
                        )}
                        {position.is_grouped && (
                            <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                    position.grouping_open === true
                                        ? 'bg-green-500/10 text-green-600 border-green-500/50' 
                                        : position.grouping_open === false
                                        ? 'bg-red-500/10 text-red-600 border-red-500/50'
                                        : 'bg-gray-500/10 text-gray-600 border-gray-500/50'
                                }`}
                            >
                                {position.grouping_open === true ? 'Grupo Aberto' : 
                                 position.grouping_open === false ? 'Grupo Fechado' : 
                                 'Grupo'}
                            </Badge>
                        )}
                    </div>
                    {position.lock_sell_by_webhook ? (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/50 text-xs w-fit">
                            Webhook Bloqueado
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/50 text-xs w-fit">
                            Webhook Liberado
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            key: 'exchange_account',
            label: 'Conta',
            render: (position: Position) => {
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
            key: 'type',
            label: 'Tipo',
            render: (position: Position) => (
                <div className="flex flex-col gap-1">
                    <Badge variant={position.is_grouped ? 'default' : 'outline'}>
                        {position.is_grouped ? 'Agrupada' : 'Única'}
                    </Badge>
                </div>
            ),
        },
        {
            key: 'qty_remaining',
            label: 'Quantidade',
            render: (position: Position) => {
                // Para posições fechadas, mostrar quantidade total comprada
                // Para posições abertas, mostrar quantidade restante
                const qty = position.status === 'CLOSED' 
                    ? Number(position.qty_total || 0)
                    : Number(position.qty_remaining || 0);
                return <span className="font-mono">{qty.toFixed(4)}</span>;
            },
        },
        {
            key: 'price_open',
            label: 'Preço Entrada',
            render: (position: Position) => <span className="font-mono">{formatCurrency(Number(position.price_open || 0))}</span>,
        },
        {
            key: 'current_price',
            label: 'Preço Atual',
            render: (position: Position) => {
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
            render: (position: Position) => (
                <span className="font-mono">
                    {position.invested_value_usd ? formatCurrency(position.invested_value_usd) : '-'}
                </span>
            ),
        },
        {
            key: 'sold_value_usd',
            label: 'Valor Vendido',
            render: (position: Position) => {
                // Mostrar apenas para posições fechadas
                if (position.status === 'CLOSED') {
                    return (
                        <span className="font-mono">
                            {position.sold_value_usd ? formatCurrency(position.sold_value_usd) : '-'}
                        </span>
                    );
                }
                return <span className="text-muted-foreground">-</span>;
            },
        },
        {
            key: 'realized_profit_usd',
            label: 'PnL Realizado',
            render: (position: Position) => {
                const realizedPnl = Number(position.realized_profit_usd || 0);
                const investedValue = Number(position.invested_value_usd || 0);
                const profitPct = investedValue > 0 ? (realizedPnl / investedValue) * 100 : 0;
                
                return (
                    <div className="flex flex-col gap-1">
                        <PnLBadge value={realizedPnl} />
                        {position.status === 'CLOSED' && realizedPnl !== 0 && (
                            <span className={`text-xs font-mono ${
                                profitPct >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                                {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'unrealized_pnl',
            label: 'PnL Não Realizado',
            render: (position: Position) => {
                // Não mostrar para posições fechadas
                if (position.status === 'CLOSED') {
                    return <span className="text-muted-foreground">-</span>;
                }
                
                const unrealizedPnl = position.unrealized_pnl || 0
                // Calcular porcentagem: usar unrealized_pnl_pct se disponível, senão calcular
                let pnlPct: number | null = null
                if (position.unrealized_pnl_pct !== null && position.unrealized_pnl_pct !== undefined) {
                    pnlPct = position.unrealized_pnl_pct
                } else if (position.price_open && position.current_price) {
                    const priceOpen = Number(position.price_open)
                    const currentPrice = Number(position.current_price)
                    if (priceOpen > 0) {
                        pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100
                    }
                }
                
                return (
                    <div className="flex flex-col gap-1">
                        <PnLBadge value={unrealizedPnl} />
                        {pnlPct !== null && (
                            <span
                                className={`text-xs font-mono ${
                                    pnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                }`}
                            >
                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                            </span>
                        )}
                    </div>
                )
            },
        },
        {
            key: 'sl_tp',
            label: 'SL/TP',
            render: (position: Position) => (
                <div className="flex gap-1 flex-wrap">
                    {position.sl_enabled && <Badge variant="outline">SL</Badge>}
                    {position.tp_enabled && <Badge variant="outline">TP</Badge>}
                    {position.sg_enabled ? (
                        <Badge 
                            variant="outline" 
                            className={`text-xs ${position.sg_activated ? 'bg-green-500/10 text-green-600 border-green-500/50' : ''}`}
                        >
                            SG: {position.sg_pct}% (-{position.sg_drop_pct}%)
                            {position.sg_activated && ' ✓'}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs opacity-50 text-muted-foreground">
                            SG: -
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            key: 'min_profit_pct',
            label: 'Lucro Mínimo',
            render: (position: Position) => (
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
            render: (position: Position) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(position.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (position: Position) => (
                <Link href={`/positions/${position.id}`}>
                    <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                    </Button>
                </Link>
            ),
        },
    ]

    // Colunas para DataTable normal (posições fechadas)
    const closedColumns: Column<Position>[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (position) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <SymbolDisplay
                            exchange={position.exchange_account_id as any}
                            symbol={position.symbol}
                            showExchange={false}
                        />
                        {position.is_dust && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/50 text-xs">
                                Resíduo
                            </Badge>
                        )}
                        {position.is_grouped && (
                            <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                    position.grouping_open === true
                                        ? 'bg-green-500/10 text-green-600 border-green-500/50' 
                                        : position.grouping_open === false
                                        ? 'bg-red-500/10 text-red-600 border-red-500/50'
                                        : 'bg-gray-500/10 text-gray-600 border-gray-500/50'
                                }`}
                            >
                                {position.grouping_open === true ? 'Grupo Aberto' : 
                                 position.grouping_open === false ? 'Grupo Fechado' : 
                                 'Grupo'}
                            </Badge>
                        )}
                    </div>
                    {position.lock_sell_by_webhook ? (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/50 text-xs w-fit">
                            Webhook Bloqueado
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/50 text-xs w-fit">
                            Webhook Liberado
                        </Badge>
                    )}
                </div>
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
            key: 'type',
            label: 'Tipo',
            render: (position) => (
                <Badge variant={position.is_grouped ? 'default' : 'outline'}>
                    {position.is_grouped ? 'Agrupada' : 'Única'}
                </Badge>
            ),
        },
        {
            key: 'qty_remaining',
            label: 'Quantidade',
            render: (position) => {
                // Para posições fechadas, mostrar quantidade total comprada
                // Para posições abertas, mostrar quantidade restante
                const qty = position.status === 'CLOSED' 
                    ? Number(position.qty_total || 0)
                    : Number(position.qty_remaining || 0);
                return <span className="font-mono">{qty.toFixed(4)}</span>;
            },
        },
        {
            key: 'price_open',
            label: 'Preço Entrada',
            render: (position) => <span className="font-mono">{formatCurrency(Number(position.price_open || 0))}</span>,
        },
        {
            key: 'current_price',
            label: (data) => {
                // Verificar se há posições fechadas nos dados
                const hasClosed = data.some((p: Position) => p.status === 'CLOSED')
                const hasOpen = data.some((p: Position) => p.status === 'OPEN')
                // Se houver apenas fechadas, mostrar "Preço de Venda"
                if (hasClosed && !hasOpen) return 'Preço de Venda'
                // Se houver apenas abertas, mostrar "Preço Atual"
                if (hasOpen && !hasClosed) return 'Preço Atual'
                // Se houver ambos, usar label genérico
                return 'Preço'
            },
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
            key: 'sold_value_usd',
            label: 'Valor Vendido',
            render: (position) => {
                // Mostrar apenas para posições fechadas
                if (position.status === 'CLOSED') {
                    return (
                        <span className="font-mono">
                            {position.sold_value_usd ? formatCurrency(position.sold_value_usd) : '-'}
                        </span>
                    );
                }
                return <span className="text-muted-foreground">-</span>;
            },
        },
        {
            key: 'total_fees_paid_usd',
            label: 'Taxas',
            render: (position) => (
                <span className="font-mono text-sm text-muted-foreground">
                    {position.total_fees_paid_usd ? formatCurrency(Number(position.total_fees_paid_usd)) : '-'}
                </span>
            ),
        },
        {
            key: 'realized_profit_usd',
            label: 'PnL Realizado',
            render: (position: Position) => {
                const realizedPnl = Number(position.realized_profit_usd || 0);
                const investedValue = Number(position.invested_value_usd || 0);
                const profitPct = investedValue > 0 ? (realizedPnl / investedValue) * 100 : 0;
                
                return (
                    <div className="flex flex-col gap-1">
                        <PnLBadge value={realizedPnl} />
                        {position.status === 'CLOSED' && realizedPnl !== 0 && (
                            <span className={`text-xs font-mono ${
                                profitPct >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                                {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'unrealized_pnl',
            label: 'PnL Não Realizado',
            render: (position) => {
                // Não mostrar para posições fechadas
                if (position.status === 'CLOSED') {
                    return <span className="text-muted-foreground">-</span>;
                }
                
                const unrealizedPnl = position.unrealized_pnl || 0
                // Calcular porcentagem: usar unrealized_pnl_pct se disponível, senão calcular
                let pnlPct: number | null = null
                if (position.unrealized_pnl_pct !== null && position.unrealized_pnl_pct !== undefined) {
                    pnlPct = position.unrealized_pnl_pct
                } else if (position.price_open && position.current_price) {
                    const priceOpen = Number(position.price_open)
                    const currentPrice = Number(position.current_price)
                    if (priceOpen > 0) {
                        pnlPct = ((currentPrice - priceOpen) / priceOpen) * 100
                    }
                }
                
                return (
                    <div className="flex flex-col gap-1">
                        <PnLBadge value={unrealizedPnl} />
                        {pnlPct !== null && (
                            <span
                                className={`text-xs font-mono ${
                                    pnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                }`}
                            >
                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                            </span>
                        )}
                    </div>
                )
            },
        },
        {
            key: 'sl_tp',
            label: 'SL/TP',
            render: (position) => (
                <div className="flex gap-1 flex-wrap">
                    {position.sl_enabled && <Badge variant="outline">SL</Badge>}
                    {position.tp_enabled && <Badge variant="outline">TP</Badge>}
                    {position.sg_enabled ? (
                        <Badge 
                            variant="outline" 
                            className={`text-xs ${position.sg_activated ? 'bg-green-500/10 text-green-600 border-green-500/50' : ''}`}
                        >
                            SG: {position.sg_pct}% (-{position.sg_drop_pct}%)
                            {position.sg_activated && ' ✓'}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-xs opacity-50 text-muted-foreground">
                            SG: -
                        </Badge>
                    )}
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
            key: 'closed_at',
            label: 'Fechamento',
            render: (position) => {
                // Mostrar apenas para posições fechadas
                if (position.status === 'CLOSED' && position.closed_at) {
                    return (
                        <span className="text-sm text-muted-foreground">
                            {formatDateTime(position.closed_at)}
                        </span>
                    );
                }
                return <span className="text-muted-foreground">-</span>;
            },
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

    const hasActiveFilters = selectedSymbol !== 'all' || selectedAccount !== 'all' || datePreset !== 'all' || positionTypeFilter !== 'normal'

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Posições</h1>
                    <p className="text-muted-foreground mt-1">Gerencie suas posições de trading</p>
                </div>
                <div className="flex items-center gap-2">
                    {!isLoadingUser && (
                        <Button
                            variant="default"
                            onClick={() => setManualBuyModalOpen(true)}
                            className="bg-primary hover:bg-primary/90"
                        >
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Compra Manual
                        </Button>
                    )}
                    {!isLoadingUser && isAdmin && (
                        <Button
                            variant="default"
                            onClick={() => setCreateManualModalOpen(true)}
                            className="bg-primary hover:bg-primary/90"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Posição Manual
                        </Button>
                    )}
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
                            Valor Atual
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingOpen ? (
                            <Skeleton className="h-8 w-32" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(consolidatedMetrics.totalCurrentValue)}
                            </div>
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

                            <div className="space-y-2">
                                <Label htmlFor="position-type-filter">Tipo de Posição (Abertas)</Label>
                                <Select value={positionTypeFilter} onValueChange={(value: 'normal' | 'todas') => {
                                    setPositionTypeFilter(value)
                                }}>
                                    <SelectTrigger id="position-type-filter">
                                        <SelectValue placeholder="Tipo de posição" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="normal">Normais (sem resíduos)</SelectItem>
                                        <SelectItem value="todas">Todas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
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
                    <TabsTrigger value="dust">
                        Resíduos ({dustPagination?.total_items || dustPositions?.length || 0})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="open">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>
                                Posições Abertas - {tradeMode}
                                {selectedSymbol !== 'all' && ` • ${selectedSymbol}`}
                                {selectedAccount !== 'all' && accounts && ` • ${accounts.find(a => a.id.toString() === selectedAccount)?.label}`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTableAdvanced<Position>
                                data={openPositions || []}
                                columns={openColumns as ColumnAdvanced<Position>[]}
                                loading={loadingOpen}
                                enableSelection={true}
                                selectedIds={selectedPositionIds}
                                onSelectionChange={setSelectedPositionIds}
                                bulkActions={(selectedIds) => {
                                    const selected = openPositions.filter((p: Position) => 
                                        selectedIds.includes(p.id)
                                    )
                                    const canGroup = selectedIds.length >= 2 &&
                                        selected.length === selectedIds.length &&
                                        selected.every((p: Position) => p.status === 'OPEN' && Number(p.qty_remaining || 0) > 0) &&
                                        new Set(selected.map((p: Position) => p.symbol)).size === 1 &&
                                        new Set(selected.map((p: Position) => p.exchange_account_id)).size === 1 &&
                                        new Set(selected.map((p: Position) => p.trade_mode)).size === 1
                                    
                                    // Verificar estado de bloqueio webhook das posições selecionadas
                                    const allLocked = selected.length > 0 && selected.every((p: Position) => p.lock_sell_by_webhook)
                                    const allUnlocked = selected.length > 0 && selected.every((p: Position) => !p.lock_sell_by_webhook)
                                    const webhookLockStatus = allLocked ? 'all_locked' : allUnlocked ? 'all_unlocked' : 'mixed'
                                    
                                    return (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">
                                                {selectedIds.length} selecionada(s)
                                            </span>
                                            {canGroup && (
                                                <Button
                                                    onClick={handleGroupPreview}
                                                    variant="default"
                                                    size="sm"
                                                    className="bg-blue-600 hover:bg-blue-700"
                                                >
                                                    <Layers className="h-4 w-4 mr-2" />
                                                    Agrupar
                                                </Button>
                                            )}
                                            <Button
                                                onClick={() => setBulkSLTPDialogOpen(true)}
                                                variant="default"
                                                size="sm"
                                            >
                                                <Settings className="h-4 w-4 mr-2" />
                                                Definir TP/SL
                                            </Button>
                                            <Button
                                                onClick={() => setBulkMinProfitDialogOpen(true)}
                                                variant="default"
                                                size="sm"
                                            >
                                                <Target className="h-4 w-4 mr-2" />
                                                Definir Lucro Mínimo
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    if (webhookLockStatus === 'all_locked') {
                                                        handleBulkLockWebhook(false)
                                                    } else if (webhookLockStatus === 'all_unlocked') {
                                                        handleBulkLockWebhook(true)
                                                    } else {
                                                        // Se misturado, abrir dialog para escolher ação
                                                        setBulkWebhookLockAction(null)
                                                        setBulkWebhookDialogOpen(true)
                                                    }
                                                }}
                                                variant="default"
                                                size="sm"
                                                className={webhookLockStatus === 'all_locked' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
                                            >
                                                {webhookLockStatus === 'all_locked' ? (
                                                    <>
                                                        <Unlock className="h-4 w-4 mr-2" />
                                                        Desbloquear Webhook
                                                    </>
                                                ) : webhookLockStatus === 'all_unlocked' ? (
                                                    <>
                                                        <Lock className="h-4 w-4 mr-2" />
                                                        Bloquear Webhook
                                                    </>
                                                ) : (
                                                    <>
                                                        <Lock className="h-4 w-4 mr-2" />
                                                        Alternar Bloqueio
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )
                                }}
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
                                columns={closedColumns}
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
                            {closedPagination && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Itens por página:</span>
                                        <Select
                                            value={closedLimit.toString()}
                                            onValueChange={(value) => {
                                                setClosedLimit(Number(value))
                                                setClosedPage(1) // Resetar para primeira página
                                            }}
                                        >
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="20">20</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                                <SelectItem value="100">100</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-sm text-muted-foreground">
                                            Página {closedPagination.current_page} de {closedPagination.total_pages} 
                                            ({closedPagination.total_items} total)
                                        </span>
                                    </div>
                                    {closedPagination.total_pages > 1 && (
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
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="dust">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>
                                Posições Resíduo - {tradeMode}
                                {selectedSymbol !== 'all' && ` • ${selectedSymbol}`}
                                {selectedAccount !== 'all' && accounts && ` • ${accounts.find(a => a.id.toString() === selectedAccount)?.label}`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={dustPositions || []}
                                columns={closedColumns.map(col => {
                                    // Adicionar badge de resíduo na coluna de símbolo
                                    if (col.key === 'symbol') {
                                        return {
                                            ...col,
                                            render: (position: Position) => (
                                                <div className="flex items-center gap-2">
                                                    <SymbolDisplay
                                                        exchange={position.exchange_account_id as any}
                                                        symbol={position.symbol}
                                                        showExchange={false}
                                                    />
                                                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/50">
                                                        Resíduo
                                                    </Badge>
                                                    {position.is_grouped && (
                                                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/50">
                                                            Agrupada
                                                        </Badge>
                                                    )}
                                                </div>
                                            ),
                                        }
                                    }
                                    return col
                                })}
                                loading={loadingDust}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">
                                            {hasActiveFilters
                                                ? 'Nenhuma posição resíduo encontrada com os filtros aplicados'
                                                : 'Nenhuma posição resíduo'}
                                        </p>
                                    </div>
                                }
                            />
                            
                            {/* Paginação para posições resíduo */}
                            {dustPagination && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Itens por página:</span>
                                        <Select
                                            value={dustLimit.toString()}
                                            onValueChange={(value) => {
                                                setDustLimit(Number(value))
                                                setDustPage(1) // Resetar para primeira página
                                            }}
                                        >
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="20">20</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                                <SelectItem value="100">100</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-sm text-muted-foreground">
                                            Página {dustPagination.current_page} de {dustPagination.total_pages}
                                            ({dustPagination.total_items} total)
                                        </span>
                                    </div>
                                    {dustPagination.total_pages > 1 && (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={dustPage <= 1 || loadingDust}
                                                onClick={() => setDustPage(prev => Math.max(1, prev - 1))}
                                            >
                                                Anterior
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={dustPage >= dustPagination.total_pages || loadingDust}
                                                onClick={() => setDustPage(prev => prev + 1)}
                                            >
                                                Próxima
                                            </Button>
                                        </div>
                                    )}
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

                        {/* Stop Gain */}
                        {bulkTPEnabled && (
                            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border border-dashed">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="bulk-sg-enabled"
                                        checked={bulkSGEnabled}
                                        onCheckedChange={(checked) => setBulkSGEnabled(checked === true)}
                                    />
                                    <Label htmlFor="bulk-sg-enabled" className="font-medium">
                                        Ativar Stop Gain (Saída Antecipada)
                                    </Label>
                                </div>
                                {bulkSGEnabled && (
                                    <div className="space-y-2 pl-6">
                                        <Label htmlFor="bulk-sg-pct">Stop Gain (%) - Vende antes do TP</Label>
                                        <Input
                                            id="bulk-sg-pct"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max={bulkTPPct ? parseFloat(bulkTPPct) : undefined}
                                            placeholder="Ex: 2.0"
                                            value={bulkSGPct}
                                            onChange={(e) => setBulkSGPct(e.target.value)}
                                        />
                                        {bulkSGPct && bulkTPPct && parseFloat(bulkSGPct) >= parseFloat(bulkTPPct) && (
                                            <p className="text-sm text-destructive">Stop Gain deve ser menor que Take Profit</p>
                                        )}
                                        {bulkSGPct && bulkTPPct && parseFloat(bulkSGPct) < parseFloat(bulkTPPct) && (
                                            <p className="text-sm text-muted-foreground">
                                                Ativa quando atingir {bulkSGPct}%
                                            </p>
                                        )}
                                        
                                        {bulkSGPct && bulkTPPct && parseFloat(bulkSGPct) < parseFloat(bulkTPPct) && (
                                            <div className="mt-3">
                                                <Label htmlFor="bulk-sg-drop-pct">Queda do Stop Gain (%) *</Label>
                                                <Input
                                                    id="bulk-sg-drop-pct"
                                                    type="number"
                                                    step="0.1"
                                                    min="0.1"
                                                    max={bulkSGPct ? parseFloat(bulkSGPct) : undefined}
                                                    placeholder="Ex: 0.5"
                                                    value={bulkSGDropPct}
                                                    onChange={(e) => setBulkSGDropPct(e.target.value)}
                                                />
                                                {bulkSGDropPct && bulkSGPct && 
                                                    (parseFloat(bulkSGDropPct) <= 0 || parseFloat(bulkSGDropPct) >= parseFloat(bulkSGPct)) ? (
                                                    <p className="text-sm text-destructive">Queda deve ser > 0 e < Stop Gain</p>
                                                ) : null}
                                                {bulkSGDropPct && bulkSGPct && 
                                                    parseFloat(bulkSGDropPct) > 0 && parseFloat(bulkSGDropPct) < parseFloat(bulkSGPct) ? (
                                                    <p className="text-sm text-muted-foreground">
                                                        Vende se cair {bulkSGDropPct}% após ativar (venda em {parseFloat(bulkSGPct) - parseFloat(bulkSGDropPct)}%)
                                                    </p>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
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
                                setBulkSGEnabled(false)
                                setBulkSGPct('')
                                setBulkSGDropPct('')
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleBulkUpdateSLTP}
                            disabled={
                                bulkUpdateSLTPMutation.isPending || 
                                (!bulkSLEnabled && !bulkTPEnabled && !bulkSGEnabled) ||
                                (bulkSGEnabled && bulkSGPct && bulkTPPct && parseFloat(bulkSGPct) >= parseFloat(bulkTPPct)) ||
                                (bulkSGEnabled && bulkSGDropPct && bulkSGPct && 
                                    (parseFloat(bulkSGDropPct) <= 0 || parseFloat(bulkSGDropPct) >= parseFloat(bulkSGPct)))
                            }
                        >
                            {bulkUpdateSLTPMutation.isPending ? 'Atualizando...' : 'Aplicar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para definir Lucro Mínimo em massa */}
            <Dialog open={bulkMinProfitDialogOpen} onOpenChange={setBulkMinProfitDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Definir Lucro Mínimo em Massa</DialogTitle>
                        <DialogDescription>
                            Configure o lucro mínimo para {selectedPositionIds.length} posição(ões) selecionada(s)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="bulk-min-profit-remove"
                                    checked={bulkMinProfitRemove}
                                    onCheckedChange={(checked) => {
                                        setBulkMinProfitRemove(checked === true)
                                        if (checked) {
                                            setBulkMinProfitPct('')
                                        }
                                    }}
                                />
                                <Label htmlFor="bulk-min-profit-remove" className="font-medium">
                                    Remover lucro mínimo (definir como null)
                                </Label>
                            </div>
                            {!bulkMinProfitRemove && (
                                <div className="space-y-2 pl-6">
                                    <Label htmlFor="bulk-min-profit-pct">Lucro Mínimo (%) *</Label>
                                    <Input
                                        id="bulk-min-profit-pct"
                                        type="number"
                                        step="0.1"
                                        min="0.01"
                                        max="100"
                                        placeholder="Ex: 2.5"
                                        value={bulkMinProfitPct}
                                        onChange={(e) => setBulkMinProfitPct(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        O lucro mínimo impede vendas abaixo deste percentual de lucro
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setBulkMinProfitDialogOpen(false)
                                setBulkMinProfitPct('')
                                setBulkMinProfitRemove(false)
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleBulkUpdateMinProfit}
                            disabled={bulkUpdateMinProfitMutation.isPending || (!bulkMinProfitRemove && !bulkMinProfitPct)}
                        >
                            {bulkUpdateMinProfitMutation.isPending ? 'Atualizando...' : 'Aplicar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para bloquear/desbloquear webhook em massa (quando estados misturados) */}
            <Dialog open={bulkWebhookDialogOpen} onOpenChange={setBulkWebhookDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Bloquear/Desbloquear Webhook em Massa</DialogTitle>
                        <DialogDescription>
                            Algumas posições estão bloqueadas e outras não. Escolha a ação para {selectedPositionIds.length} posição(ões) selecionada(s)
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Selecione a ação:</Label>
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        id="webhook-lock"
                                        name="webhook-action"
                                        value="lock"
                                        checked={bulkWebhookLockAction === true}
                                        onChange={() => setBulkWebhookLockAction(true)}
                                        className="h-4 w-4"
                                    />
                                    <Label htmlFor="webhook-lock" className="font-normal cursor-pointer">
                                        Bloquear todas as posições
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        id="webhook-unlock"
                                        name="webhook-action"
                                        value="unlock"
                                        checked={bulkWebhookLockAction === false}
                                        onChange={() => setBulkWebhookLockAction(false)}
                                        className="h-4 w-4"
                                    />
                                    <Label htmlFor="webhook-unlock" className="font-normal cursor-pointer">
                                        Desbloquear todas as posições
                                    </Label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setBulkWebhookDialogOpen(false)
                                setBulkWebhookLockAction(null)
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => {
                                if (bulkWebhookLockAction !== null) {
                                    handleBulkLockWebhook(bulkWebhookLockAction)
                                    setBulkWebhookDialogOpen(false)
                                    setBulkWebhookLockAction(null)
                                }
                            }}
                            disabled={bulkWebhookLockAction === null}
                        >
                            Aplicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Adicionar Posição Manual */}
            <CreateManualPositionModal
                open={createManualModalOpen}
                onClose={() => setCreateManualModalOpen(false)}
            />

            {/* Modal de Compra Manual */}
            <ManualBuyModal
                open={manualBuyModalOpen}
                onClose={() => setManualBuyModalOpen(false)}
            />

            {/* Modal de Agrupamento de Posições */}
            <GroupPositionsModal
                open={groupModalOpen}
                preview={groupPreview}
                onClose={() => {
                    setGroupModalOpen(false)
                    setGroupPreview(null)
                }}
                onConfirm={handleGroupConfirm}
            />
        </div>
    )
}
