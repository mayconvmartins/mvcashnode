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
            if (!qty || qty <= 0 || qty > position.qty_remaining) {
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
                        {position.symbol} • {position.side} • Quantidade Restante: {Number(position.qty_remaining || 0).toFixed(8)}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <RadioGroup value={closeType} onValueChange={(value: any) => setCloseType(value)}>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="full" id="full" />
                            <Label htmlFor="full">Fechar Totalmente ({Number(position.qty_remaining || 0).toFixed(8)})</Label>
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
                                step="0.00000001"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                placeholder={`Máx: ${Number(position.qty_remaining || 0).toFixed(8)}`}
                                max={Number(position.qty_remaining || 0)}
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                Restante: {quantity ? (Number(position.qty_remaining || 0) - parseFloat(quantity)).toFixed(8) : Number(position.qty_remaining || 0).toFixed(8)}
                            </p>
                        </div>
                    )}

                    <div className="bg-muted p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Confirmação</h4>
                        <p className="text-sm text-muted-foreground">
                            {closeType === 'full' 
                                ? `Você está prestes a fechar toda a posição de ${Number(position.qty_remaining || 0).toFixed(8)} ${position.symbol}.`
                                : `Você está prestes a fechar ${quantity || '0'} de ${Number(position.qty_remaining || 0).toFixed(8)} ${position.symbol}.`
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

