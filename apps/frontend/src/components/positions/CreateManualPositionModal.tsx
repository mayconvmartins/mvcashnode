'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { accountsService } from '@/lib/api/accounts.service'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { CreateManualPositionDto, ExchangeAccount } from '@/lib/types'
import { PositionStatus } from '@/lib/types'

// Tipo estendido para contas retornadas pelo listAll (admin)
type ExchangeAccountWithUser = ExchangeAccount & {
    user_email?: string
    user_id?: number
    trade_mode?: 'REAL' | 'SIMULATION'
}

interface CreateManualPositionModalProps {
    open: boolean
    onClose: () => void
}

export function CreateManualPositionModal({ open, onClose }: CreateManualPositionModalProps) {
    const queryClient = useQueryClient()
    const [activeTab, setActiveTab] = useState<'exchange' | 'manual'>('exchange')

    // Estados para aba EXCHANGE_ORDER
    const [exchangeAccountId, setExchangeAccountId] = useState<string>('')
    const [exchangeSide, setExchangeSide] = useState<'BUY' | 'SELL'>('BUY')
    const [exchangePositionId, setExchangePositionId] = useState<string>('')
    const [exchangeOrderId, setExchangeOrderId] = useState('')
    const [exchangeSymbol, setExchangeSymbol] = useState('')
    const [fetchingOrder, setFetchingOrder] = useState(false)
    const [orderData, setOrderData] = useState<any>(null)

    // Estados para aba MANUAL
    const [manualAccountId, setManualAccountId] = useState<string>('')
    const [manualTradeMode, setManualTradeMode] = useState<'REAL' | 'SIMULATION'>('REAL')
    const [manualSymbol, setManualSymbol] = useState('')
    const [manualQty, setManualQty] = useState('')
    const [manualPrice, setManualPrice] = useState('')
    const [manualOrderId, setManualOrderId] = useState('')
    const [manualCreatedAt, setManualCreatedAt] = useState('')

    // Buscar todas as contas (admin only)
    const { data: allAccounts, isLoading: loadingAccounts } = useQuery<ExchangeAccountWithUser[]>({
        queryKey: ['accounts', 'all'],
        queryFn: accountsService.listAll,
        enabled: open,
    })

    // Buscar posições abertas quando for SELL
    const { data: openPositions, isLoading: loadingPositions } = useQuery({
        queryKey: ['positions', 'open', exchangeAccountId, exchangeSymbol],
        queryFn: () => positionsService.list({
            status: PositionStatus.OPEN,
            exchange_account_id: exchangeAccountId ? parseInt(exchangeAccountId) : undefined,
            symbol: exchangeSymbol || undefined,
            limit: 100,
        }),
        enabled: open && exchangeSide === 'SELL' && !!exchangeAccountId && !!exchangeSymbol,
    })

    const createMutation = useMutation({
        mutationFn: (data: CreateManualPositionDto) => positionsService.createManual(data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['operations'] })
            const message = variables.side === 'SELL' 
                ? 'Venda vinculada à posição com sucesso!' 
                : 'Posição criada com sucesso!'
            toast.success(message)
            handleClose()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || error.message || 'Erro ao processar operação')
        },
    })

    const handleClose = () => {
        // Resetar estados
        setActiveTab('exchange')
        setExchangeAccountId('')
        setExchangeSide('BUY')
        setExchangePositionId('')
        setExchangeOrderId('')
        setExchangeSymbol('')
        setOrderData(null)
        setManualAccountId('')
        setManualTradeMode('REAL')
        setManualSymbol('')
        setManualQty('')
        setManualPrice('')
        setManualOrderId('')
        setManualCreatedAt('')
        onClose()
    }

    const handleFetchOrder = async () => {
        if (!exchangeAccountId || !exchangeOrderId || !exchangeSymbol) {
            toast.error('Preencha todos os campos obrigatórios')
            return
        }

        if (exchangeSide === 'SELL' && !exchangePositionId) {
            toast.error('Selecione uma posição para vincular a venda')
            return
        }

        setFetchingOrder(true)
        try {
            const testData: CreateManualPositionDto = {
                method: 'EXCHANGE_ORDER',
                exchange_account_id: parseInt(exchangeAccountId),
                side: exchangeSide,
                position_id: exchangeSide === 'SELL' ? parseInt(exchangePositionId) : undefined,
                exchange_order_id: exchangeOrderId,
                symbol: exchangeSymbol,
            }

            toast.info(`Buscando dados da ordem ${exchangeSide} na exchange...`)
            
            // Criar a posição/venda diretamente (o backend vai buscar os dados)
            createMutation.mutate(testData)
        } catch (error: any) {
            toast.error(error.message || 'Erro ao buscar ordem')
        } finally {
            setFetchingOrder(false)
        }
    }

    const handleSubmitManual = (e: React.FormEvent) => {
        e.preventDefault()

        if (!manualAccountId || !manualSymbol || !manualQty || !manualPrice) {
            toast.error('Preencha todos os campos obrigatórios')
            return
        }

        const qty = parseFloat(manualQty)
        const price = parseFloat(manualPrice)

        if (isNaN(qty) || qty <= 0) {
            toast.error('Quantidade inválida')
            return
        }

        if (isNaN(price) || price <= 0) {
            toast.error('Preço inválido')
            return
        }

        const data: CreateManualPositionDto = {
            method: 'MANUAL',
            exchange_account_id: parseInt(manualAccountId),
            manual_symbol: manualSymbol,
            qty_total: qty,
            price_open: price,
            trade_mode: manualTradeMode,
            manual_exchange_order_id: manualOrderId || undefined,
            created_at: manualCreatedAt || undefined,
        }

        createMutation.mutate(data)
    }

    const selectedExchangeAccount = allAccounts?.find((acc) => acc.id.toString() === exchangeAccountId)
    const selectedManualAccount = allAccounts?.find((acc) => acc.id.toString() === manualAccountId)

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Adicionar Posição Manual</DialogTitle>
                    <DialogDescription>
                        Crie uma posição manualmente buscando dados de uma ordem na exchange ou inserindo todos os dados.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'exchange' | 'manual')}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="exchange">Buscar na Exchange</TabsTrigger>
                        <TabsTrigger value="manual">Inserir Manualmente</TabsTrigger>
                    </TabsList>

                    <TabsContent value="exchange" className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="exchange-account">Conta de Exchange *</Label>
                            <Select value={exchangeAccountId} onValueChange={setExchangeAccountId} disabled={loadingAccounts}>
                                <SelectTrigger id="exchange-account">
                                    <SelectValue placeholder="Selecione uma conta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {allAccounts?.map((account) => (
                                        <SelectItem key={account.id} value={account.id.toString()}>
                                            {account.label} ({account.exchange}) - {account.is_simulation ? 'SIMULATION' : 'REAL'}
                                            {account.user_email && ` - ${account.user_email}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedExchangeAccount?.is_simulation && (
                                <p className="text-sm text-yellow-600">
                                    ⚠️ Contas de simulação não podem buscar ordens na exchange
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="exchange-side">Tipo de Operação *</Label>
                            <Select value={exchangeSide} onValueChange={(value) => {
                                setExchangeSide(value as 'BUY' | 'SELL')
                                setExchangePositionId('') // Resetar posição ao mudar tipo
                            }}>
                                <SelectTrigger id="exchange-side">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BUY">BUY (Criar Nova Posição)</SelectItem>
                                    <SelectItem value="SELL">SELL (Vincular a Posição Existente)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {exchangeSide === 'SELL' && (
                            <div className="space-y-2">
                                <Label htmlFor="exchange-position">Posição para Vincular *</Label>
                                <Select 
                                    value={exchangePositionId} 
                                    onValueChange={setExchangePositionId}
                                    disabled={loadingPositions || !exchangeAccountId || !exchangeSymbol}
                                >
                                    <SelectTrigger id="exchange-position">
                                        <SelectValue placeholder={
                                            !exchangeAccountId || !exchangeSymbol 
                                                ? "Selecione conta e símbolo primeiro" 
                                                : loadingPositions 
                                                    ? "Carregando posições..." 
                                                    : "Selecione uma posição"
                                        } />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(() => {
                                            const positions = Array.isArray(openPositions) 
                                                ? openPositions 
                                                : (openPositions as any)?.data || []
                                            return positions.map((position: any) => (
                                                <SelectItem key={position.id} value={position.id.toString()}>
                                                    Posição #{position.id} - {position.symbol} - Qty: {position.qty_remaining?.toFixed(8) || '0'} - Preço: ${position.price_open?.toFixed(2) || '0'}
                                                </SelectItem>
                                            ))
                                        })()}
                                    </SelectContent>
                                </Select>
                                {(() => {
                                    const positions = Array.isArray(openPositions) 
                                        ? openPositions 
                                        : (openPositions as any)?.data || []
                                    return positions.length === 0 && exchangeAccountId && exchangeSymbol && !loadingPositions && (
                                        <p className="text-sm text-yellow-600">
                                            ⚠️ Nenhuma posição aberta encontrada para este símbolo nesta conta
                                        </p>
                                    )
                                })()}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="exchange-order-id">Número da Operação na Exchange *</Label>
                            <Input
                                id="exchange-order-id"
                                type="text"
                                value={exchangeOrderId}
                                onChange={(e) => setExchangeOrderId(e.target.value)}
                                placeholder="Ex: 12345678"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="exchange-symbol">Símbolo *</Label>
                            <Input
                                id="exchange-symbol"
                                type="text"
                                value={exchangeSymbol}
                                onChange={(e) => {
                                    setExchangeSymbol(e.target.value.toUpperCase())
                                    setExchangePositionId('') // Resetar posição ao mudar símbolo
                                }}
                                placeholder="Ex: BTCUSDT"
                            />
                        </div>

                        {orderData && (
                            <div className="bg-muted p-4 rounded-lg space-y-2">
                                <h4 className="font-medium">Dados da Ordem:</h4>
                                <div className="text-sm space-y-1">
                                    <p>Quantidade: {orderData.filled}</p>
                                    <p>Preço Médio: {orderData.average}</p>
                                    <p>Custo Total: {orderData.cost}</p>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleClose}>
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                onClick={handleFetchOrder}
                                disabled={
                                    fetchingOrder ||
                                    createMutation.isPending ||
                                    !exchangeAccountId ||
                                    !exchangeOrderId ||
                                    !exchangeSymbol ||
                                    (exchangeSide === 'SELL' && !exchangePositionId) ||
                                    selectedExchangeAccount?.is_simulation
                                }
                            >
                                {fetchingOrder || createMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        {createMutation.isPending ? 'Criando...' : 'Buscando...'}
                                    </>
                                ) : (
                                    exchangeSide === 'SELL' ? 'Buscar e Vincular Venda' : 'Buscar e Criar Posição'
                                )}
                            </Button>
                        </DialogFooter>
                    </TabsContent>

                    <TabsContent value="manual" className="space-y-4 mt-4">
                        <form onSubmit={handleSubmitManual} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="manual-account">Conta de Exchange *</Label>
                                <Select value={manualAccountId} onValueChange={setManualAccountId} disabled={loadingAccounts}>
                                    <SelectTrigger id="manual-account">
                                        <SelectValue placeholder="Selecione uma conta" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allAccounts?.map((account) => (
                                            <SelectItem key={account.id} value={account.id.toString()}>
                                                {account.label} ({account.exchange}) - {account.is_simulation ? 'SIMULATION' : 'REAL'}
                                                {account.user_email && ` - ${account.user_email}`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-trade-mode">Modo de Trading *</Label>
                                <Select value={manualTradeMode} onValueChange={(value) => setManualTradeMode(value as 'REAL' | 'SIMULATION')}>
                                    <SelectTrigger id="manual-trade-mode">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="REAL">REAL</SelectItem>
                                        <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-symbol">Símbolo *</Label>
                                <Input
                                    id="manual-symbol"
                                    type="text"
                                    value={manualSymbol}
                                    onChange={(e) => setManualSymbol(e.target.value.toUpperCase())}
                                    placeholder="Ex: BTCUSDT"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-qty">Quantidade Total *</Label>
                                <Input
                                    id="manual-qty"
                                    type="number"
                                    step="0.00000001"
                                    min="0.00000001"
                                    value={manualQty}
                                    onChange={(e) => setManualQty(e.target.value)}
                                    placeholder="Ex: 0.001"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-price">Preço de Abertura *</Label>
                                <Input
                                    id="manual-price"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={manualPrice}
                                    onChange={(e) => setManualPrice(e.target.value)}
                                    placeholder="Ex: 50000.00"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-order-id">Número da Operação (Opcional)</Label>
                                <Input
                                    id="manual-order-id"
                                    type="text"
                                    value={manualOrderId}
                                    onChange={(e) => setManualOrderId(e.target.value)}
                                    placeholder="Ex: 12345678"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="manual-created-at">Data de Criação (Opcional)</Label>
                                <Input
                                    id="manual-created-at"
                                    type="datetime-local"
                                    value={manualCreatedAt}
                                    onChange={(e) => setManualCreatedAt(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Use para posições antigas. Deixe em branco para usar data atual.
                                </p>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={handleClose}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={createMutation.isPending || !manualAccountId || !manualSymbol || !manualQty || !manualPrice}>
                                    {createMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Criando...
                                        </>
                                    ) : (
                                        'Criar Posição'
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

