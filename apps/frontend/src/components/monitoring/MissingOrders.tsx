'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RefreshCw, CheckCircle2, X, Download } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { adminService } from '@/lib/api/admin.service'
import { useAccounts } from '@/hooks/use-accounts'

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

interface PositionOption {
    id: number
    symbol: string
    qty_remaining: number
    created_at: string
}

export function MissingOrders() {
    const { data: accounts } = useAccounts()
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
    const [missing, setMissing] = useState<MissingOrder[]>([])
    const [selected, setSelected] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [showPositionModal, setShowPositionModal] = useState(false)
    const [sellOrdersNeedingPosition, setSellOrdersNeedingPosition] = useState<MissingOrder[]>([])
    const [selectedPositions, setSelectedPositions] = useState<Record<string, number>>({})
    const [availablePositions, setAvailablePositions] = useState<Record<string, PositionOption[]>>({})

    const detectMissing = async () => {
        if (!selectedAccountId) {
            toast.error('Selecione uma conta de exchange')
            return
        }

        try {
            setLoading(true)
            const data = await adminService.detectMissingOrders(selectedAccountId)
            setMissing(data.missing)
            if (data.total > 0) {
                toast.warning(`${data.total} ordem(ns) faltante(s) encontrada(s) na conta ${data.accountName}`)
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
        if (selected.length === 0) return

        const confirmed = confirm(
            `Importar ${selected.length} ordem(ns) faltante(s)?\n\n` +
            'Isso irá criar TradeJob, TradeExecution e TradePosition (BUY) ou vincular a posições existentes (SELL).'
        )
        
        if (!confirmed) return

        // Separar BUYs e SELLs
        const selectedOrders = missing.filter(order => selected.includes(order.exchangeOrderId))
        const sellOrders = selectedOrders.filter(order => order.side === 'SELL')

        // Se há SELLs, precisa selecionar posições
        if (sellOrders.length > 0) {
            toast.info(`${sellOrders.length} ordem(ns) SELL precisam de posições. Buscando posições abertas...`)
            
            // Buscar posições para cada símbolo
            const positionsBySymbol: Record<string, PositionOption[]> = {}
            
            for (const order of sellOrders) {
                if (!positionsBySymbol[order.symbol]) {
                    try {
                        // Aqui precisamos buscar posições abertas do símbolo
                        // Como não temos endpoint específico, vamos usar o availablePositions
                        // Por ora, vamos apenas abrir o modal e o usuário seleciona
                        positionsBySymbol[order.symbol] = [] // Placeholder
                    } catch (error) {
                        console.error(`Erro ao buscar posições para ${order.symbol}:`, error)
                    }
                }
            }
            
            setAvailablePositions(positionsBySymbol)
            setSellOrdersNeedingPosition(sellOrders)
            setShowPositionModal(true)
            return
        }

        // Se só tem BUYs, importar direto
        await executeImport(selectedOrders)
    }

    const executeImport = async (orders: MissingOrder[]) => {
        if (!selectedAccountId) return

        try {
            setLoading(true)
            
            const ordersToImport = orders.map(order => ({
                exchangeOrderId: order.exchangeOrderId,
                symbol: order.symbol,
                side: order.side,
                qty: order.qty,
                price: order.price,
                cost: order.cost,
                fee: order.fee,
                feeCurrency: order.feeCurrency,
                timestamp: order.timestamp,
                positionId: order.side === 'SELL' ? selectedPositions[order.exchangeOrderId] : undefined,
            }))

            const result = await adminService.importMissingOrders({
                accountId: selectedAccountId,
                orders: ordersToImport,
            })
            
            if (result.failed > 0) {
                toast.warning(`${result.imported} importadas, ${result.failed} falhadas`)
            } else {
                toast.success(`${result.imported} ordem(ns) importada(s) com sucesso`)
            }
            
            setSelected([])
            setSellOrdersNeedingPosition([])
            setSelectedPositions({})
            setShowPositionModal(false)
            await detectMissing() // Recarregar
        } catch (error: any) {
            toast.error(`Erro ao importar ordens: ${error.response?.data?.message || error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const importWithPositions = async () => {
        const sellOrders = sellOrdersNeedingPosition
        const missingPositions = sellOrders.filter(order => !selectedPositions[order.exchangeOrderId])
        
        if (missingPositions.length > 0) {
            toast.error(`Selecione posições para todas as ordens SELL (${missingPositions.length} faltando)`)
            return
        }

        // Importar SELLs com posições selecionadas
        const allOrders = missing.filter(order => selected.includes(order.exchangeOrderId))
        await executeImport(allOrders)
    }

    const toggleAll = () => {
        if (selected.length === missing.length) {
            setSelected([])
        } else {
            setSelected(missing.map(order => order.exchangeOrderId))
        }
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5 text-blue-500" />
                        Ordens Faltantes (Exchange → Sistema)
                    </CardTitle>
                    <CardDescription>
                        Detecta ordens executadas na exchange nos últimos 7 dias que não estão no sistema
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                                        {account.name} ({account.exchange_type})
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

                    {missing.length > 0 && (
                        <>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    {missing.length} ordem(ns) faltante(s) encontrada(s)
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAll}
                                >
                                    {selected.length === missing.length ? 'Desmarcar' : 'Marcar'} Todos
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {missing.map((order) => (
                                    <div key={order.exchangeOrderId} className="flex items-start gap-3 p-3 border rounded hover:bg-accent/50">
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
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium">
                                                    {order.symbol}
                                                </div>
                                                <Badge variant={order.side === 'BUY' ? 'default' : 'destructive'}>
                                                    {order.side}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Order #{order.exchangeOrderId} | Qty: {order.qty.toFixed(4)} | Preço: ${order.price.toFixed(2)} | Total: ${order.cost.toFixed(2)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Taxa: {order.fee.toFixed(4)} {order.feeCurrency} | {new Date(order.timestamp).toLocaleString('pt-BR')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {selected.length > 0 && (
                                <Button 
                                    onClick={importSelected} 
                                    disabled={loading} 
                                    className="w-full"
                                    variant="default"
                                >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Importar {selected.length} Selecionada(s)
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

            {/* Modal de Seleção de Posições para SELLs */}
            <Dialog open={showPositionModal} onOpenChange={setShowPositionModal}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Vincular Ordens SELL a Posições</DialogTitle>
                        <DialogDescription>
                            Selecione a posição aberta que cada ordem SELL deve fechar. Ordens BUY criarão novas posições automaticamente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {sellOrdersNeedingPosition.map((order) => (
                            <div key={order.exchangeOrderId} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="font-semibold">
                                            {order.symbol} - SELL
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Qty: {order.qty.toFixed(4)} | Preço: ${order.price.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Order #{order.exchangeOrderId} | {new Date(order.timestamp).toLocaleString('pt-BR')}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-sm text-orange-600">
                                    ⚠️ Você precisa buscar manualmente a posição ID no sistema e informá-la aqui.
                                    <br />
                                    Exemplo: vá em /positions, filtre por {order.symbol} e copie o ID da posição aberta.
                                </div>

                                <div className="space-y-2">
                                    <Label>ID da Posição a Fechar:</Label>
                                    <input
                                        type="number"
                                        className="w-full px-3 py-2 border rounded"
                                        placeholder="Digite o ID da posição (ex: 113)"
                                        value={selectedPositions[order.exchangeOrderId] || ''}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value)
                                            if (!isNaN(value)) {
                                                setSelectedPositions(prev => ({
                                                    ...prev,
                                                    [order.exchangeOrderId]: value,
                                                }))
                                            } else {
                                                setSelectedPositions(prev => {
                                                    const newState = { ...prev }
                                                    delete newState[order.exchangeOrderId]
                                                    return newState
                                                })
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowPositionModal(false)
                                setSelectedPositions({})
                            }}
                        >
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button 
                            onClick={importWithPositions}
                            disabled={loading || Object.keys(selectedPositions).length !== sellOrdersNeedingPosition.length}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Confirmar Importação
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

