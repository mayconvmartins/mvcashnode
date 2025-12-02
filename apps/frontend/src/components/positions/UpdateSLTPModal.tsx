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

interface UpdateSLTPModalProps {
    position: Position
    open: boolean
    onClose: () => void
}

export function UpdateSLTPModal({ position, open, onClose }: UpdateSLTPModalProps) {
    const queryClient = useQueryClient()
    const [stopLoss, setStopLoss] = useState(position.stopLoss?.toString() || '')
    const [takeProfit, setTakeProfit] = useState(position.takeProfit?.toString() || '')

    const updateMutation = useMutation({
        mutationFn: () => positionsService.updateSLTP(position.id, {
            stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
            takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['position', position.id] })
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            toast.success('SL/TP atualizado com sucesso!')
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao atualizar SL/TP')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        updateMutation.mutate()
    }

    const slPercent = stopLoss && position.entryPrice
        ? ((parseFloat(stopLoss) - position.entryPrice) / position.entryPrice * 100).toFixed(2)
        : null

    const tpPercent = takeProfit && position.entryPrice
        ? ((parseFloat(takeProfit) - position.entryPrice) / position.entryPrice * 100).toFixed(2)
        : null

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Atualizar Stop Loss / Take Profit</DialogTitle>
                    <DialogDescription>
                        {position.symbol} • {position.side} • Entrada: ${position.entryPrice}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="stopLoss">Stop Loss</Label>
                        <Input
                            id="stopLoss"
                            type="number"
                            step="0.01"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(e.target.value)}
                            placeholder="Ex: 50000"
                        />
                        {slPercent && (
                            <p className={`text-sm mt-1 ${parseFloat(slPercent) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {parseFloat(slPercent) >= 0 ? '+' : ''}{slPercent}% da entrada
                            </p>
                        )}
                    </div>
                    <div>
                        <Label htmlFor="takeProfit">Take Profit</Label>
                        <Input
                            id="takeProfit"
                            type="number"
                            step="0.01"
                            value={takeProfit}
                            onChange={(e) => setTakeProfit(e.target.value)}
                            placeholder="Ex: 60000"
                        />
                        {tpPercent && (
                            <p className={`text-sm mt-1 ${parseFloat(tpPercent) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {parseFloat(tpPercent) >= 0 ? '+' : ''}{tpPercent}% da entrada
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Atualizando...' : 'Atualizar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

