'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import type { Position } from '@/lib/types'

interface UpdateSLTPModalProps {
    position: Position
    open: boolean
    onClose: () => void
}

export function UpdateSLTPModal({ position, open, onClose }: UpdateSLTPModalProps) {
    const queryClient = useQueryClient()
    // Usar percentual em vez de preço absoluto
    const [slPct, setSlPct] = useState(position.sl_pct?.toString() || '')
    const [tpPct, setTpPct] = useState(position.tp_pct?.toString() || '')
    const [slEnabled, setSlEnabled] = useState(position.sl_enabled)
    const [tpEnabled, setTpEnabled] = useState(position.tp_enabled)
    const [sgEnabled, setSgEnabled] = useState(position.sg_enabled)
    const [sgPct, setSgPct] = useState(position.sg_pct?.toString() || '')

    // Validação: Stop Gain deve ser menor que Take Profit
    const sgError = sgEnabled && tpEnabled && sgPct && tpPct && 
      parseFloat(sgPct) >= parseFloat(tpPct) 
      ? 'Stop Gain deve ser menor que Take Profit' 
      : null

    const updateMutation = useMutation({
        mutationFn: () => positionsService.updateSLTP(position.id, {
            slEnabled: slEnabled,
            slPct: slEnabled && slPct ? parseFloat(slPct) : undefined,
            tpEnabled: tpEnabled,
            tpPct: tpEnabled && tpPct ? parseFloat(tpPct) : undefined,
            sgEnabled: sgEnabled,
            sgPct: sgEnabled && sgPct ? parseFloat(sgPct) : undefined,
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

    const slPrice = slEnabled && slPct && position.price_open
        ? position.price_open * (1 - parseFloat(slPct) / 100)
        : null

    const tpPrice = tpEnabled && tpPct && position.price_open
        ? position.price_open * (1 + parseFloat(tpPct) / 100)
        : null

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Atualizar Stop Loss / Take Profit</DialogTitle>
                    <DialogDescription>
                        {position.symbol} • {position.side} • Entrada: {formatCurrency(position.price_open)}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="slEnabled"
                            checked={slEnabled}
                            onChange={(e) => setSlEnabled(e.target.checked)}
                            className="rounded"
                        />
                        <Label htmlFor="slEnabled">Habilitar Stop Loss</Label>
                    </div>
                    {slEnabled && (
                        <div>
                            <Label htmlFor="slPct">Stop Loss (%)</Label>
                            <Input
                                id="slPct"
                                type="number"
                                step="0.1"
                                min="0"
                                value={slPct}
                                onChange={(e) => setSlPct(e.target.value)}
                                placeholder="Ex: 2.0"
                            />
                            {slPrice && (
                                <p className="text-sm mt-1 text-muted-foreground">
                                    Preço: {formatCurrency(slPrice)} ({slPct}% abaixo da entrada)
                                </p>
                            )}
                        </div>
                    )}
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="tpEnabled"
                            checked={tpEnabled}
                            onChange={(e) => setTpEnabled(e.target.checked)}
                            className="rounded"
                        />
                        <Label htmlFor="tpEnabled">Habilitar Take Profit</Label>
                    </div>
                    {tpEnabled && (
                        <div>
                            <Label htmlFor="tpPct">Take Profit (%)</Label>
                            <Input
                                id="tpPct"
                                type="number"
                                step="0.1"
                                min="0"
                                value={tpPct}
                                onChange={(e) => setTpPct(e.target.value)}
                                placeholder="Ex: 5.0"
                            />
                    {tpPrice && (
                        <p className="text-sm mt-1 text-muted-foreground">
                            Preço: {formatCurrency(tpPrice)} ({tpPct}% acima da entrada)
                        </p>
                    )}
                </div>
            )}
            {tpEnabled && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                    <div className="flex items-center space-x-2 mb-3">
                        <input
                            type="checkbox"
                            id="sgEnabled"
                            checked={sgEnabled}
                            onChange={(e) => setSgEnabled(e.target.checked)}
                            className="rounded"
                        />
                        <Label htmlFor="sgEnabled">Ativar Stop Gain (Saída Antecipada)</Label>
                    </div>
                    {sgEnabled && (
                        <div>
                            <Label htmlFor="sgPct">Stop Gain (%) - Vende antes do TP</Label>
                            <Input
                                id="sgPct"
                                type="number"
                                step="0.1"
                                min="0"
                                max={tpPct ? parseFloat(tpPct) : undefined}
                                value={sgPct}
                                onChange={(e) => setSgPct(e.target.value)}
                                placeholder="Ex: 2.0"
                            />
                            {sgError && <p className="text-sm text-destructive mt-1">{sgError}</p>}
                            {sgPct && tpPct && !sgError && (
                                <p className="text-sm text-muted-foreground mt-1">
                                    Vende se atingir {sgPct}% antes do TP de {tpPct}%
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending || !!sgError}>
                    {updateMutation.isPending ? 'Atualizando...' : 'Atualizar'}
                </Button>
            </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

