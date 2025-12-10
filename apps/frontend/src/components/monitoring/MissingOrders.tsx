'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, CheckCircle2, Download, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { adminService } from '@/lib/api/admin.service'
import { accountsService } from '@/lib/api/accounts.service'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface MissingOrder {
    exchangeOrderId: string
    symbol: string
    side: 'BUY' | 'SELL'
    qty: number
    price: number
    cost: number
    fee: number
    feeCurrency: string
    timestamp: string
    info: any
}

interface OpenPosition {
    id: number
    symbol: string
    qty_total: number
    qty_remaining: number
    price_open: number
    created_at: string
}

export function MissingOrders() {
    const [accounts, setAccounts] = useState<any[]>([])
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
    const [missing, setMissing] = useState<MissingOrder[]>([])
    const [selected, setSelected] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    
    // Mapa de posições por símbolo
    const [positionsBySymbol, setPositionsBySymbol] = useState<Record<string, OpenPosition[]>>({})
    // Mapa de posição selecionada por ordem SELL
    const [selectedPositions, setSelectedPositions] = useState<Record<string, number>>({})
    // Ordens expandidas
    const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({})
    
    // Filtros de data
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last7days')

    useEffect(() => {
        loadAccounts()
        handleDateChange(undefined, undefined, 'last7days')
    }, [])

    const loadAccounts = async () => {
        try {
            const data = await accountsService.list()
            setAccounts(data)
        } catch (error) {
            console.error('Erro ao carregar contas:', error)
        }
    }

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    const detectMissing = async () => {
        if (!selectedAccountId) {
            toast.error('Selecione uma conta de exchange')
            return
        }

        try {
            setLoading(true)
            const data = await adminService.detectMissingOrders(selectedAccountId, dateFrom, dateTo)
            setMissing(data.missing)
            
            // Buscar posições abertas para cada símbolo SELL
            const sellSymbols = [...new Set(data.missing.filter(o => o.side === 'SELL').map(o => o.symbol))]
            const positionsMap: Record<string, OpenPosition[]> = {}
            
            for (const symbol of sellSymbols) {
                try {
                    const positions = await adminService.getOpenPositions(selectedAccountId, symbol)
                    positionsMap[symbol] = positions
                } catch (error) {
                    console.error(`Erro ao buscar posições para ${symbol}:`, error)
                    positionsMap[symbol] = []
                }
            }
            
            setPositionsBySymbol(positionsMap)
            
            if (data.total > 0) {
                const sellCount = data.missing.filter(o => o.side === 'SELL').length
                toast.warning(
                    `${data.total} ordem(ns) faltante(s): ${data.total - sellCount} BUY, ${sellCount} SELL`
                )
            } else {
                toast.success('Nenhuma ordem faltante encontrada')
            }
        } catch (error: any) {
            toast.error(`Erro ao buscar ordens faltantes: ${error.response?.data?.message || error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const importSelected = async () => {
        if (selected.length === 0) {
            toast.error('Selecione pelo menos uma ordem')
            return
        }

        const selectedOrders = missing.filter(order => selected.includes(order.exchangeOrderId))
        const sellOrders = selectedOrders.filter(order => order.side === 'SELL')
        const buyOrders = selectedOrders.filter(order => order.side === 'BUY')
        
        // Filtrar SELLs que têm posição selecionada
        const sellsWithPosition = sellOrders.filter(order => selectedPositions[order.exchangeOrderId])
        const sellsWithoutPosition = sellOrders.filter(order => !selectedPositions[order.exchangeOrderId])
        
        const totalToImport = buyOrders.length + sellsWithPosition.length
        
        if (totalToImport === 0) {
            toast.error('Nenhuma ordem válida para importar. SELLs precisam de posições selecionadas.')
            return
        }

        let message = `Importar ${totalToImport} ordem(ns)?\n\n`
        message += `- ${buyOrders.length} BUY (novas posições)\n`
        message += `- ${sellsWithPosition.length} SELL (vincular a posições)\n`
        if (sellsWithoutPosition.length > 0) {
            message += `\n⚠️ ${sellsWithoutPosition.length} SELL sem posição serão ignoradas.`
        }
        
        const confirmed = confirm(message)
        if (!confirmed) return

        try {
            setLoading(true)
            
            // Importar apenas BUYs e SELLs com posição
            const ordersToImport = [
                ...buyOrders.map(order => ({
                    exchangeOrderId: order.exchangeOrderId,
                    symbol: order.symbol,
                    side: order.side,
                    qty: order.qty,
                    price: order.price,
                    cost: order.cost,
                    fee: order.fee,
                    feeCurrency: order.feeCurrency,
                    timestamp: order.timestamp,
                })),
                ...sellsWithPosition.map(order => ({
                    exchangeOrderId: order.exchangeOrderId,
                    symbol: order.symbol,
                    side: order.side,
                    qty: order.qty,
                    price: order.price,
                    cost: order.cost,
                    fee: order.fee,
                    feeCurrency: order.feeCurrency,
                    timestamp: order.timestamp,
                    positionId: selectedPositions[order.exchangeOrderId],
                }))
            ]

            const result = await adminService.importMissingOrders({
                accountId: selectedAccountId!,
                orders: ordersToImport,
            })
            
            let resultMsg = `${result.imported} ordem(ns) importada(s)`
            if (result.failed > 0) {
                resultMsg += `, ${result.failed} falhada(s)`
                toast.warning(resultMsg)
            } else {
                toast.success(resultMsg)
            }
            
            if (sellsWithoutPosition.length > 0) {
                toast.info(`${sellsWithoutPosition.length} SELL ignorada(s) (sem posição)`)
            }
            
            setSelected([])
            setSelectedPositions({})
            await detectMissing() // Recarregar
        } catch (error: any) {
            toast.error(`Erro ao importar: ${error.response?.data?.message || error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const toggleAll = () => {
        if (selected.length === missing.length) {
            setSelected([])
        } else {
            setSelected(missing.map(order => order.exchangeOrderId))
        }
    }

    const toggleExpanded = (orderId: string) => {
        setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }))
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5 text-blue-500" />
                    Ordens Faltantes (Exchange → Sistema)
                </CardTitle>
                <CardDescription>
                    Detecta ordens executadas na exchange que não estão no sistema
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Select
                            value={selectedAccountId?.toString() || ''}
                            onValueChange={(value) => setSelectedAccountId(parseInt(value))}
                        >
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Selecione uma conta..." />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts?.map((account) => (
                                    <SelectItem key={account.id} value={account.id.toString()}>
                                        {account.label} ({account.exchange}) - {account.is_simulation ? 'SIMULATION' : 'REAL'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <Button 
                            onClick={detectMissing} 
                            disabled={loading || !selectedAccountId}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Detectando...' : 'Detectar'}
                        </Button>
                    </div>

                    <DateRangeFilter
                        from={dateFrom}
                        to={dateTo}
                        preset={datePreset}
                        onDateChange={handleDateChange}
                    />
                </div>

                {missing.length > 0 && (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                                {missing.length} ordem(ns) encontrada(s)
                            </span>
                            <Button variant="ghost" size="sm" onClick={toggleAll}>
                                {selected.length === missing.length ? 'Desmarcar' : 'Marcar'} Todos
                            </Button>
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {missing.map((order) => {
                                const isSell = order.side === 'SELL'
                                const positions = isSell ? positionsBySymbol[order.symbol] || [] : []
                                const isExpanded = expandedOrders[order.exchangeOrderId]
                                const hasPositionSelected = selectedPositions[order.exchangeOrderId]

                                return (
                                    <div key={order.exchangeOrderId} className="border rounded hover:bg-accent/50">
                                        <div className="flex items-start gap-3 p-3">
                                            <Checkbox
                                                checked={selected.includes(order.exchangeOrderId)}
                                                onCheckedChange={(checked) => {
                                                    setSelected(prev =>
                                                        checked
                                                            ? [...prev, order.exchangeOrderId]
                                                            : prev.filter(id => id !== order.exchangeOrderId)
                                                    )
                                                }}
                                            />
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium">{order.symbol}</div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={order.side === 'BUY' ? 'default' : 'destructive'}>
                                                            {order.side}
                                                        </Badge>
                                                        {isSell && positions.length > 0 && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => toggleExpanded(order.exchangeOrderId)}
                                                                className="h-6 px-2"
                                                            >
                                                                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div className="text-sm text-muted-foreground">
                                                    Order #{order.exchangeOrderId} | Qty: {order.qty.toFixed(4)} | Preço: ${order.price.toFixed(2)} | Total: ${order.cost.toFixed(2)}
                                                </div>
                                                
                                                <div className="text-xs text-muted-foreground">
                                                    Taxa: {order.fee.toFixed(4)} {order.feeCurrency} | {new Date(order.timestamp).toLocaleString('pt-BR')}
                                                </div>

                                                {/* Seletor de Posição para SELL */}
                                                {isSell && (
                                                    <div className="space-y-2 pt-2">
                                                        {positions.length > 0 ? (
                                                            <>
                                                                <Label className="text-xs">Vincular à posição:</Label>
                                                                <Select
                                                                    value={selectedPositions[order.exchangeOrderId]?.toString() || 'SKIP'}
                                                                    onValueChange={(value) => {
                                                                        if (value && value !== 'SKIP') {
                                                                            setSelectedPositions(prev => ({
                                                                                ...prev,
                                                                                [order.exchangeOrderId]: parseInt(value),
                                                                            }))
                                                                        } else {
                                                                            setSelectedPositions(prev => {
                                                                                const newState = { ...prev }
                                                                                delete newState[order.exchangeOrderId]
                                                                                return newState
                                                                            })
                                                                        }
                                                                    }}
                                                                >
                                                                    <SelectTrigger className="h-8">
                                                                        <SelectValue placeholder="Selecione posição..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="SKIP">Nenhuma (ignorar esta venda)</SelectItem>
                                                                        {positions.map((pos) => (
                                                                            <SelectItem key={pos.id} value={pos.id.toString()}>
                                                                                #{pos.id} - Restante: {pos.qty_remaining.toFixed(4)} | Abertura: ${pos.price_open.toFixed(2)} | {new Date(pos.created_at).toLocaleDateString('pt-BR')}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                {!hasPositionSelected && selected.includes(order.exchangeOrderId) && (
                                                                    <div className="text-xs text-orange-600">
                                                                        ⚠️ Selecione uma posição ou esta ordem será ignorada
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                                                                ❌ Nenhuma posição OPEN encontrada para {order.symbol}. Esta ordem não pode ser importada.
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Detalhes da Posição Selecionada */}
                                                {isSell && hasPositionSelected && (
                                                    <Collapsible open={isExpanded}>
                                                        <CollapsibleContent>
                                                            {(() => {
                                                                const pos = positions.find(p => p.id === selectedPositions[order.exchangeOrderId])
                                                                if (!pos) return null
                                                                
                                                                const projectedProfit = (order.price - pos.price_open) * Math.min(order.qty, pos.qty_remaining)
                                                                const profitPct = ((order.price - pos.price_open) / pos.price_open) * 100
                                                                
                                                                return (
                                                                    <div className="mt-2 p-2 bg-muted rounded text-xs space-y-1">
                                                                        <div className="font-medium">Posição #{pos.id}</div>
                                                                        <div>Total: {pos.qty_total.toFixed(4)} | Restante: {pos.qty_remaining.toFixed(4)}</div>
                                                                        <div>Preço abertura: ${pos.price_open.toFixed(2)}</div>
                                                                        <div>Preço venda: ${order.price.toFixed(2)}</div>
                                                                        <div className={projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                            Lucro estimado: ${projectedProfit.toFixed(2)} ({profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%)
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })()}
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {selected.length > 0 && (
                            <Button 
                                onClick={importSelected} 
                                disabled={loading} 
                                className="w-full"
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Importar Selecionadas ({selected.length})
                            </Button>
                        )}
                    </>
                )}

                {missing.length === 0 && !loading && selectedAccountId && (
                    <div className="text-center text-sm text-muted-foreground py-8">
                        Nenhuma ordem faltante encontrada. Selecione uma conta e clique em "Detectar".
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
