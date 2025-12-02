'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { Position } from '@/lib/types'

interface SellLimitModalProps {
    position: Position
    open: boolean
    onClose: () => void
}

export function SellLimitModal({ position, open, onClose }: SellLimitModalProps) {
    const queryClient = useQueryClient()
    const [price, setPrice] = useState('')
    const [quantity, setQuantity] = useState(position.quantity.toString())

    const sellLimitMutation = useMutation({
        mutationFn: () => positionsService.sellLimit(position.id, {
            price: parseFloat(price),
            quantity: parseFloat(quantity),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
            toast.success('Ordem limite criada com sucesso!')
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao criar ordem limite')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        const priceVal = parseFloat(price)
        const qtyVal = parseFloat(quantity)
        
        if (!priceVal || priceVal <= 0) {
            toast.error('Preço inválido')
            return
        }
        
        if (!qtyVal || qtyVal <= 0 || qtyVal > position.quantity) {
            toast.error('Quantidade inválida')
            return
        }
        
        sellLimitMutation.mutate()
    }

    const pricePercent = price && position.entryPrice
        ? ((parseFloat(price) - position.entryPrice) / position.entryPrice * 100).toFixed(2)
        : null

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Criar Ordem Limite de Venda</DialogTitle>
                    <DialogDescription>
                        {position.symbol} • Quantidade Disponível: {position.quantity}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="price">Preço</Label>
                        <Input
                            id="price"
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="Ex: 55000"
                            required
                        />
                        {pricePercent && (
                            <p className={`text-sm mt-1 ${parseFloat(pricePercent) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {parseFloat(pricePercent) >= 0 ? '+' : ''}{pricePercent}% da entrada (${position.entryPrice})
                            </p>
                        )}
                    </div>
                    <div>
                        <Label htmlFor="quantity">Quantidade</Label>
                        <Input
                            id="quantity"
                            type="number"
                            step="0.001"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder={`Máx: ${position.quantity}`}
                            max={position.quantity}
                            required
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                            Máximo disponível: {position.quantity}
                        </p>
                    </div>

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Resumo</h4>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total:</span>
                                <span className="font-medium">
                                    ${price && quantity ? (parseFloat(price) * parseFloat(quantity)).toFixed(2) : '0.00'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">PnL Estimado:</span>
                                <span className={`font-medium ${pricePercent && parseFloat(pricePercent) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {price && quantity 
                                        ? `$${((parseFloat(price) - position.entryPrice) * parseFloat(quantity) * (position.side === 'BUY' ? 1 : -1)).toFixed(2)}`
                                        : '$0.00'
                                    }
                                </span>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit"
                            disabled={sellLimitMutation.isPending || !price || !quantity}
                        >
                            {sellLimitMutation.isPending ? 'Criando...' : 'Criar Ordem'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

