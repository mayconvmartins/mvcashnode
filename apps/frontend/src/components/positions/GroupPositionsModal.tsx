'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'
import type { GroupPreview } from '@/lib/types'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GroupPositionsModalProps {
    open: boolean
    preview: GroupPreview | null
    onClose: () => void
    onConfirm: () => Promise<void>
}

export function GroupPositionsModal({ open, preview, onClose, onConfirm }: GroupPositionsModalProps) {
    const queryClient = useQueryClient()
    const [isConfirming, setIsConfirming] = useState(false)

    const handleConfirm = async () => {
        if (!preview) return
        
        setIsConfirming(true)
        try {
            await onConfirm()
        } catch (error) {
            // Erro já tratado no handler da página
        } finally {
            setIsConfirming(false)
        }
    }

    if (!preview) {
        return null
    }

    const hasGroupedPositions = preview.positions.some(p => p.is_grouped)
    const basePosition = preview.positions.find(p => p.id === preview.base_position_id)

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Confirmar Agrupamento de Posições</DialogTitle>
                    <DialogDescription>
                        Revise os detalhes do agrupamento antes de confirmar. {preview.positions.length} posição(ões) serão agrupadas.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Aviso se houver posições já agrupadas */}
                    {hasGroupedPositions && (
                        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                    Posição(ões) já agrupada(s) detectada(s)
                                </p>
                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                    As posições já agrupadas serão usadas como base. As outras posições serão incorporadas a elas.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Lista de posições */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Posições a Agrupar</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {preview.positions.map((position) => (
                                    <div
                                        key={position.id}
                                        className={`p-3 rounded-lg border ${
                                            position.id === preview.base_position_id
                                                ? 'bg-primary/5 border-primary dark:bg-primary/10'
                                                : 'bg-muted/50 border-border'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium">ID: {position.id}</span>
                                                    {position.id === preview.base_position_id && (
                                                        <Badge variant="default" className="text-xs">
                                                            Posição Base
                                                        </Badge>
                                                    )}
                                                    {position.is_grouped && (
                                                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                                            Já Agrupada
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                                                    <div>
                                                        <span className="font-medium">Símbolo:</span> {position.symbol}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Qtd. Total:</span>{' '}
                                                        <span className="font-mono">{position.qty_total.toFixed(4)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Qtd. Restante:</span>{' '}
                                                        <span className="font-mono">{position.qty_remaining.toFixed(4)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Preço Entrada:</span>{' '}
                                                        <span className="font-mono">{formatCurrency(position.price_open)}</span>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <span className="font-medium">Criada em:</span>{' '}
                                                        {formatDateTime(position.created_at)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Resumo do agrupamento */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Resumo do Agrupamento</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Quantidade Total</p>
                                    <p className="text-lg font-semibold font-mono">
                                        {preview.total_qty.toFixed(4)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Quantidade Restante</p>
                                    <p className="text-lg font-semibold font-mono">
                                        {preview.total_qty_remaining.toFixed(4)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Custo Médio Ponderado</p>
                                    <p className="text-lg font-semibold font-mono">
                                        {formatCurrency(preview.weighted_avg_price)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Valor Investido Total</p>
                                    <p className="text-lg font-semibold font-mono">
                                        {formatCurrency(preview.total_invested)}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-sm text-muted-foreground">Data de Início do Agrupamento</p>
                                    <p className="text-base font-medium">
                                        {formatDateTime(preview.group_started_at)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Informações adicionais */}
                    {basePosition && (
                        <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
                            <p className="font-medium mb-1">Posição Base Selecionada:</p>
                            <p>
                                A posição #{basePosition.id} será mantida e todas as outras serão incorporadas a ela.
                                {basePosition.is_grouped && ' Esta posição já é um agrupamento e continuará sendo expandida.'}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isConfirming}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isConfirming}
                        className="bg-primary hover:bg-primary/90"
                    >
                        {isConfirming ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Agrupando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Confirmar Agrupamento
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
