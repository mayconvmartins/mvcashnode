'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import type { Position } from '@/lib/types'

interface SellLimitModalProps {
    position: Position
    open: boolean
    onClose: () => void
}

export function SellLimitModal({ position, open, onClose }: SellLimitModalProps) {
    const queryClient = useQueryClient()
    const [price, setPrice] = useState('')
    const [orderType, setOrderType] = useState<'full' | 'partial'>('full')
    const [percentage, setPercentage] = useState('')
    const [manualQuantity, setManualQuantity] = useState('')
    const [quantityInputMode, setQuantityInputMode] = useState<'percentage' | 'manual'>('percentage')
    
    const positionQtyRemaining = Number(position.qty_remaining || 0)

    // Calcular quantidade baseada no tipo de ordem e modo selecionado
    const calculatedQuantity = useMemo(() => {
        if (orderType === 'full') {
            return positionQtyRemaining
        }
        
        if (orderType === 'partial') {
            if (quantityInputMode === 'percentage') {
                const pct = parseFloat(percentage)
                if (!isNaN(pct) && pct > 0 && pct <= 100) {
                    return (pct / 100) * positionQtyRemaining
                }
            } else {
                const qty = parseFloat(manualQuantity)
                if (!isNaN(qty) && qty > 0) {
                    return qty
                }
            }
        }
        
        return 0
    }, [orderType, quantityInputMode, percentage, manualQuantity, positionQtyRemaining])

    const sellLimitMutation = useMutation({
        mutationFn: () => {
            const payload: { limitPrice: number; quantity?: number } = {
                limitPrice: parseFloat(price),
            }
            
            // Se for parcial, enviar a quantidade calculada
            if (orderType === 'partial' && calculatedQuantity > 0) {
                payload.quantity = calculatedQuantity
            } else if (orderType === 'full') {
                // Se for completa, enviar a quantidade total
                payload.quantity = positionQtyRemaining
            }
            
            return positionsService.sellLimit(position.id, payload)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
            toast.success('Ordem limite criada com sucesso!')
            onClose()
            // Resetar estados
            setPrice('')
            setOrderType('full')
            setPercentage('')
            setManualQuantity('')
            setQuantityInputMode('percentage')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao criar ordem limite')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        const priceVal = parseFloat(price)
        
        if (!priceVal || priceVal <= 0) {
            toast.error('Preço inválido')
            return
        }
        
        if (orderType === 'full') {
            if (positionQtyRemaining <= 0) {
                toast.error('Posição não possui quantidade disponível')
                return
            }
        } else {
            // Validações para ordem parcial
            if (quantityInputMode === 'percentage') {
                const pct = parseFloat(percentage)
                if (!percentage || isNaN(pct) || pct <= 0 || pct > 100) {
                    toast.error('Porcentagem inválida. Deve estar entre 0 e 100')
                    return
                }
            } else {
                const qty = parseFloat(manualQuantity)
                if (!manualQuantity || isNaN(qty) || qty <= 0) {
                    toast.error('Quantidade inválida')
                    return
                }
                if (qty > positionQtyRemaining) {
                    toast.error(`Quantidade excede o disponível (${positionQtyRemaining.toFixed(8)})`)
                    return
                }
            }
            
            if (calculatedQuantity <= 0) {
                toast.error('Quantidade calculada inválida')
                return
            }
        }
        
        sellLimitMutation.mutate()
    }

    const pricePercent = price && position.price_open
        ? ((parseFloat(price) - Number(position.price_open || 0)) / Number(position.price_open || 0) * 100).toFixed(2)
        : null

    const handlePercentageChange = (value: string) => {
        setPercentage(value)
        // Limpar quantidade manual quando mudar para porcentagem
        if (quantityInputMode === 'manual') {
            setManualQuantity('')
        }
    }

    const handleManualQuantityChange = (value: string) => {
        setManualQuantity(value)
        // Limpar porcentagem quando mudar para manual
        if (quantityInputMode === 'percentage') {
            setPercentage('')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Criar Ordem Limite de Venda</DialogTitle>
                    <DialogDescription>
                        {position.symbol} • Quantidade Disponível: {positionQtyRemaining.toFixed(8)}
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
                                {parseFloat(pricePercent) >= 0 ? '+' : ''}{pricePercent}% da entrada ({formatCurrency(Number(position.price_open || 0))})
                            </p>
                        )}
                    </div>

                    <div>
                        <Label>Tipo de Ordem</Label>
                        <RadioGroup value={orderType} onValueChange={(value: 'full' | 'partial') => setOrderType(value)} className="mt-2">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="full" id="full" />
                                <Label htmlFor="full" className="font-normal cursor-pointer">
                                    Encerrar toda a posição ({positionQtyRemaining.toFixed(8)})
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="partial" id="partial" />
                                <Label htmlFor="partial" className="font-normal cursor-pointer">
                                    Criar ordem limite parcial
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {orderType === 'partial' && (
                        <div className="space-y-4 border rounded-lg p-4">
                            <div>
                                <Label>Modo de Quantidade</Label>
                                <RadioGroup 
                                    value={quantityInputMode} 
                                    onValueChange={(value: 'percentage' | 'manual') => {
                                        setQuantityInputMode(value)
                                        if (value === 'percentage') {
                                            setManualQuantity('')
                                        } else {
                                            setPercentage('')
                                        }
                                    }} 
                                    className="mt-2"
                                >
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="percentage" id="percentage-mode" />
                                        <Label htmlFor="percentage-mode" className="font-normal cursor-pointer">
                                            Porcentagem
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="manual" id="manual-mode" />
                                        <Label htmlFor="manual-mode" className="font-normal cursor-pointer">
                                            Quantidade Manual
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {quantityInputMode === 'percentage' && (
                                <div>
                                    <Label htmlFor="percentage">Porcentagem (%)</Label>
                                    <Input
                                        id="percentage"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={percentage}
                                        onChange={(e) => handlePercentageChange(e.target.value)}
                                        placeholder="Ex: 50"
                                    />
                                    {percentage && !isNaN(parseFloat(percentage)) && (
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Quantidade: {((parseFloat(percentage) / 100) * positionQtyRemaining).toFixed(8)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {quantityInputMode === 'manual' && (
                                <div>
                                    <Label htmlFor="manualQuantity">Quantidade</Label>
                                    <Input
                                        id="manualQuantity"
                                        type="number"
                                        step="0.00000001"
                                        min="0"
                                        max={positionQtyRemaining}
                                        value={manualQuantity}
                                        onChange={(e) => handleManualQuantityChange(e.target.value)}
                                        placeholder={`Máx: ${positionQtyRemaining.toFixed(8)}`}
                                    />
                                    {manualQuantity && !isNaN(parseFloat(manualQuantity)) && (
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Restante: {(positionQtyRemaining - parseFloat(manualQuantity)).toFixed(8)}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {orderType === 'full' && (
                        <div>
                            <Label htmlFor="quantity">Quantidade</Label>
                            <Input
                                id="quantity"
                                type="number"
                                step="0.00000001"
                                value={positionQtyRemaining.toFixed(8)}
                                readOnly
                                disabled
                                className="bg-muted cursor-not-allowed"
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                A ordem limit encerrará toda a posição quando executada
                            </p>
                        </div>
                    )}

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Resumo</h4>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Quantidade:</span>
                                <span className="font-medium">
                                    {calculatedQuantity > 0 ? calculatedQuantity.toFixed(8) : '0.00000000'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Total:</span>
                                <span className="font-medium">
                                    {price && calculatedQuantity > 0 
                                        ? formatCurrency(parseFloat(price) * calculatedQuantity) 
                                        : formatCurrency(0)
                                    }
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">PnL Estimado:</span>
                                <span className={`font-medium ${pricePercent && parseFloat(pricePercent) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {price && calculatedQuantity > 0
                                        ? formatCurrency((parseFloat(price) - Number(position.price_open || 0)) * calculatedQuantity)
                                        : formatCurrency(0)
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
                            disabled={
                                sellLimitMutation.isPending || 
                                !price || 
                                calculatedQuantity <= 0 ||
                                (orderType === 'partial' && quantityInputMode === 'percentage' && (!percentage || parseFloat(percentage) <= 0)) ||
                                (orderType === 'partial' && quantityInputMode === 'manual' && (!manualQuantity || parseFloat(manualQuantity) <= 0))
                            }
                        >
                            {sellLimitMutation.isPending ? 'Criando...' : 'Criar Ordem'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

