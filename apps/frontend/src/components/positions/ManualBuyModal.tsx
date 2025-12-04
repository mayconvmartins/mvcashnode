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
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { CreateManualBuyDto, ExchangeAccount } from '@/lib/types'
import { useAuth } from '@/lib/hooks/useAuth'
import { UserRole } from '@/lib/types'

interface ManualBuyModalProps {
    open: boolean
    onClose: () => void
}

export function ManualBuyModal({ open, onClose }: ManualBuyModalProps) {
    const queryClient = useQueryClient()
    const { user } = useAuth()
    
    const [exchangeAccountId, setExchangeAccountId] = useState<string>('')
    const [symbol, setSymbol] = useState('')
    const [quoteAmount, setQuoteAmount] = useState('')
    const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET')
    const [limitPrice, setLimitPrice] = useState('')

    // Verificar se o usuário é admin
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue === UserRole.ADMIN || roleValue?.toLowerCase?.() === 'admin'
    }) || false

    // Buscar contas: admin vê todas, user vê só suas
    const { data: accounts, isLoading: loadingAccounts } = useQuery<ExchangeAccount[]>({
        queryKey: isAdmin ? ['accounts', 'all'] : ['accounts'],
        queryFn: isAdmin ? accountsService.listAll : accountsService.list,
        enabled: open,
    })

    const createMutation = useMutation({
        mutationFn: (data: CreateManualBuyDto) => positionsService.createManualBuy(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['operations'] })
            queryClient.invalidateQueries({ queryKey: ['trade-jobs'] })
            toast.success('Compra manual criada com sucesso! O job foi enfileirado para execução.')
            handleClose()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || error.message || 'Erro ao criar compra manual')
        },
    })

    const handleClose = () => {
        // Resetar estados
        setExchangeAccountId('')
        setSymbol('')
        setQuoteAmount('')
        setOrderType('MARKET')
        setLimitPrice('')
        onClose()
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!exchangeAccountId || !symbol || !quoteAmount) {
            toast.error('Preencha todos os campos obrigatórios')
            return
        }

        const amount = parseFloat(quoteAmount)
        if (isNaN(amount) || amount <= 0) {
            toast.error('Valor em USDT deve ser maior que zero')
            return
        }

        if (orderType === 'LIMIT') {
            const price = parseFloat(limitPrice)
            if (isNaN(price) || price <= 0) {
                toast.error('Preço limite é obrigatório e deve ser maior que zero para ordens LIMIT')
                return
            }
        }

        const data: CreateManualBuyDto = {
            exchange_account_id: parseInt(exchangeAccountId),
            symbol: symbol.toUpperCase().trim(),
            quote_amount: amount,
            order_type: orderType,
            limit_price: orderType === 'LIMIT' ? parseFloat(limitPrice) : undefined,
        }

        createMutation.mutate(data)
    }

    const selectedAccount = accounts?.find((acc) => acc.id.toString() === exchangeAccountId)

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Compra Manual</DialogTitle>
                    <DialogDescription>
                        Crie uma compra que será executada na exchange. O job será processado automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="account">Conta de Exchange *</Label>
                        <Select value={exchangeAccountId} onValueChange={setExchangeAccountId} disabled={loadingAccounts}>
                            <SelectTrigger id="account">
                                <SelectValue placeholder="Selecione uma conta" />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts?.map((account) => (
                                    <SelectItem key={account.id} value={account.id.toString()}>
                                        {account.label} ({account.exchange}) - {account.is_simulation ? 'SIMULATION' : 'REAL'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="symbol">Símbolo *</Label>
                        <Input
                            id="symbol"
                            type="text"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            placeholder="Ex: BTCUSDT"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="quote-amount">Valor em USDT *</Label>
                        <Input
                            id="quote-amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={quoteAmount}
                            onChange={(e) => setQuoteAmount(e.target.value)}
                            placeholder="Ex: 100.00"
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Valor total em USDT a ser investido na compra
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="order-type">Tipo de Ordem *</Label>
                        <Select value={orderType} onValueChange={(value) => setOrderType(value as 'MARKET' | 'LIMIT')}>
                            <SelectTrigger id="order-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MARKET">MARKET</SelectItem>
                                <SelectItem value="LIMIT">LIMIT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {orderType === 'LIMIT' && (
                        <div className="space-y-2">
                            <Label htmlFor="limit-price">Preço Limite *</Label>
                            <Input
                                id="limit-price"
                                type="number"
                                step="0.01"
                                min="0.00000001"
                                value={limitPrice}
                                onChange={(e) => setLimitPrice(e.target.value)}
                                placeholder="Ex: 50000.00"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Preço máximo a pagar pela compra (ordem será executada quando o preço atingir este valor)
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={
                                createMutation.isPending || 
                                !exchangeAccountId || 
                                !symbol || 
                                !quoteAmount ||
                                (orderType === 'LIMIT' && !limitPrice)
                            }
                        >
                            {createMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                'Criar Compra'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

