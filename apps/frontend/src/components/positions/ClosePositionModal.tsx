'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { positionsService } from '@/lib/api/positions.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import type { Position } from '@/lib/types'

interface ClosePositionModalProps {
    position: Position
    open: boolean
    onClose: () => void
}

export function ClosePositionModal({ position, open, onClose }: ClosePositionModalProps) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [closeType, setCloseType] = useState<'full' | 'partial'>('full')
    const [quantity, setQuantity] = useState('')

    const closeMutation = useMutation({
        mutationFn: () => positionsService.close(position.id, {
            quantity: closeType === 'partial' && quantity ? parseFloat(quantity) : undefined,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['position', position.id] })
            toast.success('Posição fechada com sucesso!')
            onClose()
            if (closeType === 'full') {
                router.push('/positions')
            }
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao fechar posição')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (closeType === 'partial') {
            const qty = parseFloat(quantity)
            if (!qty || qty <= 0 || qty > position.quantity) {
                toast.error('Quantidade inválida')
                return
            }
        }
        
        closeMutation.mutate()
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Fechar Posição</DialogTitle>
                    <DialogDescription>
                        {position.symbol} • {position.side} • Quantidade Total: {position.quantity}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <RadioGroup value={closeType} onValueChange={(value: any) => setCloseType(value)}>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="full" id="full" />
                            <Label htmlFor="full">Fechar Totalmente</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="partial" id="partial" />
                            <Label htmlFor="partial">Fechar Parcialmente</Label>
                        </div>
                    </RadioGroup>

                    {closeType === 'partial' && (
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
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                Restante: {quantity ? (position.quantity - parseFloat(quantity)).toFixed(3) : position.quantity}
                            </p>
                        </div>
                    )}

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Confirmação</h4>
                        <p className="text-sm text-muted-foreground">
                            {closeType === 'full' 
                                ? `Você está prestes a fechar toda a posição de ${position.quantity} ${position.symbol}.`
                                : `Você está prestes a fechar ${quantity || '0'} de ${position.quantity} ${position.symbol}.`
                            }
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            variant="destructive"
                            disabled={closeMutation.isPending || (closeType === 'partial' && !quantity)}
                        >
                            {closeMutation.isPending ? 'Fechando...' : 'Fechar Posição'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

