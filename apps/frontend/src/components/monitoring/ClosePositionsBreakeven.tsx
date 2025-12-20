'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { formatCurrency } from '@/lib/utils/format'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { X, Loader2, AlertTriangle, DollarSign } from 'lucide-react'

export function ClosePositionsBreakeven() {
    const [positionId, setPositionId] = useState<string>('')
    const [result, setResult] = useState<{
        position_id: number
        position_closed: boolean
        job_created: number | null
        execution_created: number | null
        error?: string
        position_info?: {
            symbol: string
            qty_remaining: number
            price_open: number
            exchange_account: string
        }
    } | null>(null)

    const closeMutation = useMutation({
        mutationFn: () => {
            const id = parseInt(positionId.trim())
            if (isNaN(id) || id <= 0) {
                throw new Error('ID da posição inválido')
            }
            return adminService.closePositionsBreakeven({ position_id: id })
        },
        onSuccess: (data) => {
            setResult(data)
            if (data.position_closed) {
                toast.success(`Posição #${data.position_id} fechada sem lucro/perda`)
            } else {
                toast.error(data.error || 'Erro ao fechar posição')
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || error.message || 'Erro ao fechar posição')
        },
    })

    const canExecute = positionId.trim() !== '' && !isNaN(parseInt(positionId.trim()))

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Fechar Posições sem Lucro/Perda
                </CardTitle>
                <CardDescription className="text-xs">
                    Cria job de venda fictício no preço de entrada para fechar uma posição específica sem lucro ou perda
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Input de ID da Posição */}
                <div className="space-y-2">
                    <Label htmlFor="position-id">ID da Posição *</Label>
                    <Input
                        id="position-id"
                        type="number"
                        placeholder="Ex: 409"
                        value={positionId}
                        onChange={(e) => setPositionId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Informe o ID da posição que deseja fechar sem lucro/perda
                    </p>
                </div>

                {/* Resultados */}
                {result && (
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                        {result.error ? (
                            <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <span>{result.error}</span>
                            </div>
                        ) : result.position_closed ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Posição:</span>
                                    <Badge variant="default">#{result.position_id}</Badge>
                                </div>
                                {result.position_info && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Símbolo:</span>
                                            <span className="text-sm font-mono">{result.position_info.symbol}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Quantidade:</span>
                                            <span className="text-sm">{result.position_info.qty_remaining}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Preço de Entrada:</span>
                                            <span className="text-sm">{formatCurrency(result.position_info.price_open)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Conta:</span>
                                            <span className="text-sm">{result.position_info.exchange_account}</span>
                                        </div>
                                    </>
                                )}
                                {result.job_created && (
                                    <div className="flex items-center justify-between mt-2">
                                        <span className="text-sm font-medium">Job criado:</span>
                                        <Badge variant="secondary" className="text-xs">
                                            #{result.job_created}
                                        </Badge>
                                    </div>
                                )}
                                {result.execution_created && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">Execução criada:</span>
                                        <Badge variant="secondary" className="text-xs">
                                            #{result.execution_created}
                                        </Badge>
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>
                )}

                {/* Botões */}
                <div className="flex gap-2">
                    <Button
                        onClick={() => closeMutation.mutate()}
                        disabled={closeMutation.isPending || !canExecute}
                        variant="default"
                        className="flex-1"
                    >
                        {closeMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Fechando posição...
                            </>
                        ) : (
                            <>
                                <DollarSign className="h-4 w-4 mr-2" />
                                Fechar Posição
                            </>
                        )}
                    </Button>
                    {result && (
                        <Button onClick={() => setResult(null)} variant="outline" size="icon">
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

