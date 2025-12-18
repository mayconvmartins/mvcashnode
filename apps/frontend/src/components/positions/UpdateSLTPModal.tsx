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
    const [sgDropPct, setSgDropPct] = useState(position.sg_drop_pct?.toString() || '')
    const [tsgEnabled, setTsgEnabled] = useState(position.tsg_enabled)
    const [tsgActivationPct, setTsgActivationPct] = useState(position.tsg_activation_pct?.toString() || '')
    const [tsgDropPct, setTsgDropPct] = useState(position.tsg_drop_pct?.toString() || '')

    // Validação: Stop Gain deve ser menor que Take Profit
    const sgError = sgEnabled && tpEnabled && sgPct && tpPct && 
      parseFloat(sgPct) >= parseFloat(tpPct) 
      ? 'Stop Gain deve ser menor que Take Profit' 
      : null

    // Validação: sgDropPct deve ser > 0 e < sgPct
    const sgDropError = sgEnabled && sgDropPct && sgPct && 
      (parseFloat(sgDropPct) <= 0 || parseFloat(sgDropPct) >= parseFloat(sgPct))
      ? 'Queda deve ser maior que 0 e menor que Stop Gain'
      : null

    // Validação: TSG e SG fixo são mutuamente exclusivos
    const tsgSgConflict = tsgEnabled && sgEnabled
      ? 'Trailing Stop Gain e Stop Gain fixo não podem estar habilitados ao mesmo tempo'
      : null

    // Validação: tsgActivationPct deve ser > 0
    const tsgActivationError = tsgEnabled && tsgActivationPct && parseFloat(tsgActivationPct) <= 0
      ? '% de ativação deve ser maior que 0'
      : null

    // Validação: tsgDropPct deve ser > 0
    const tsgDropError = tsgEnabled && tsgDropPct && parseFloat(tsgDropPct) <= 0
      ? '% de queda deve ser maior que 0'
      : null

    const updateMutation = useMutation({
        mutationFn: () => {
            const payload: any = {
                slEnabled: slEnabled,
                slPct: slEnabled && slPct ? parseFloat(slPct) : undefined,
                tpEnabled: tpEnabled,
                tpPct: tpEnabled && tpPct ? parseFloat(tpPct) : undefined,
                sgEnabled: sgEnabled,
            }
            
            // Quando sgEnabled é false, enviar explicitamente undefined para limpar valores no backend
            if (sgEnabled === false) {
                payload.sgPct = undefined
                payload.sgDropPct = undefined
            } else if (sgEnabled && sgPct && sgDropPct) {
                payload.sgPct = parseFloat(sgPct)
                payload.sgDropPct = parseFloat(sgDropPct)
            }

            // TSG - Pode funcionar junto com TP (TP como teto máximo)
            payload.tsgEnabled = tsgEnabled
            
            // Se TSG está sendo ativado, apenas SG é desativado (TSG tem prioridade sobre SG)
            // TP continua ativo como "lucro máximo garantido"
            if (tsgEnabled === true) {
                payload.sgEnabled = false
                payload.sgPct = undefined
                payload.sgDropPct = undefined
            }
            
            if (tsgEnabled === false) {
                payload.tsgActivationPct = undefined
                payload.tsgDropPct = undefined
            } else if (tsgEnabled && tsgActivationPct && tsgDropPct) {
                payload.tsgActivationPct = parseFloat(tsgActivationPct)
                payload.tsgDropPct = parseFloat(tsgDropPct)
            }
            
            return positionsService.updateSLTP(position.id, payload)
        },
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
                                    Ativa quando atingir {sgPct}%
                                </p>
                            )}
                            
                            {sgPct && !sgError && (
                                <div className="mt-3">
                                    <Label htmlFor="sgDropPct">Queda do Stop Gain (%) - Threshold de Venda</Label>
                                    <Input
                                        id="sgDropPct"
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        max={sgPct ? parseFloat(sgPct) : undefined}
                                        value={sgDropPct}
                                        onChange={(e) => setSgDropPct(e.target.value)}
                                        placeholder="Ex: 0.5"
                                    />
                                    {sgDropError && <p className="text-sm text-destructive mt-1">{sgDropError}</p>}
                                    {sgDropPct && sgPct && !sgDropError && (
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Vende se cair {sgDropPct}% após ativar o SG (venda em {parseFloat(sgPct) - parseFloat(sgDropPct)}%)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* TSG - Independente de TP */}
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-dashed">
                <div className="flex items-center space-x-2 mb-3">
                    <input
                        type="checkbox"
                        id="tsgEnabled"
                        checked={tsgEnabled}
                        onChange={(e) => {
                            const checked = e.target.checked
                            setTsgEnabled(checked)
                            // TSG pode funcionar junto com TP (TP como teto máximo)
                            // Apenas SG é desativado quando TSG está ativo
                            if (checked) {
                                setSgEnabled(false)
                            }
                        }}
                        className="rounded"
                        disabled={sgEnabled}
                    />
                    <Label htmlFor="tsgEnabled" className="text-foreground">
                        Ativar Trailing Stop Gain (Rastreamento Dinâmico de Lucro)
                    </Label>
                </div>
                {sgEnabled && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                        Desabilite o Stop Gain fixo para usar Trailing Stop Gain
                    </p>
                )}
                {tsgEnabled && tpEnabled && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                        💡 TP + TSG ativos: O primeiro a atingir aciona a venda. TP funciona como &quot;lucro máximo garantido&quot;.
                    </p>
                )}
                {tsgEnabled && (
                    <div className="space-y-3">
                        <div>
                            <Label htmlFor="tsgActivationPct">% Inicial de Ativação</Label>
                            <Input
                                id="tsgActivationPct"
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={tsgActivationPct}
                                onChange={(e) => setTsgActivationPct(e.target.value)}
                                placeholder="Ex: 2.0"
                            />
                            {tsgActivationError && <p className="text-sm text-destructive mt-1">{tsgActivationError}</p>}
                            {!tsgActivationError && tsgActivationPct && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Ativa o rastreamento quando atingir este lucro
                                </p>
                            )}
                        </div>
                        
                        <div>
                            <Label htmlFor="tsgDropPct">% de Queda do Pico para Vender</Label>
                            <Input
                                id="tsgDropPct"
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={tsgDropPct}
                                onChange={(e) => setTsgDropPct(e.target.value)}
                                placeholder="Ex: 0.5 ou 1.0"
                            />
                            {tsgDropError && <p className="text-sm text-destructive mt-1">{tsgDropError}</p>}
                            {!tsgDropError && tsgDropPct && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Vende se cair esta % a partir do pico máximo atingido
                                </p>
                            )}
                        </div>
                        
                        {tsgActivationPct && tsgDropPct && !tsgActivationError && !tsgDropError && (
                            <div className="bg-muted p-3 rounded border">
                                <p className="text-xs font-medium mb-1">Exemplo de funcionamento:</p>
                                <ul className="text-xs space-y-1 text-muted-foreground">
                                    <li>• Ativa em {tsgActivationPct}% de lucro</li>
                                    <li>• Se atingir {(parseFloat(tsgActivationPct) + 5).toFixed(1)}%, vende se cair para {(parseFloat(tsgActivationPct) + 5 - parseFloat(tsgDropPct)).toFixed(1)}%</li>
                                    <li>• Se atingir 20%, vende se cair para {(20 - parseFloat(tsgDropPct)).toFixed(1)}%</li>
                                    <li>• Sem limite máximo de lucro rastreado</li>
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {tsgSgConflict && (
                <p className="text-sm text-destructive mt-2">{tsgSgConflict}</p>
            )}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending || !!sgError || !!sgDropError || !!tsgSgConflict || !!tsgActivationError || !!tsgDropError}>
                    {updateMutation.isPending ? 'Atualizando...' : 'Atualizar'}
                </Button>
            </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

