'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Lock, Unlock, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { toast } from 'sonner'
import { useState } from 'react'
import { UpdateSLTPModal } from '@/components/positions/UpdateSLTPModal'
import { ClosePositionModal } from '@/components/positions/ClosePositionModal'
import { SellLimitModal } from '@/components/positions/SellLimitModal'
import { PriceChart } from '@/components/positions/PriceChart'

export default function PositionDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const positionId = params.id as string

    const [showUpdateSLTPModal, setShowUpdateSLTPModal] = useState(false)
    const [showCloseModal, setShowCloseModal] = useState(false)
    const [showSellLimitModal, setShowSellLimitModal] = useState(false)

    const { data: position, isLoading } = useQuery({
        queryKey: ['position', positionId],
        queryFn: () => positionsService.getById(positionId),
    })

    const lockMutation = useMutation({
        mutationFn: () => positionsService.lock(positionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['position', positionId] })
            toast.success('Webhook bloqueado com sucesso!')
        },
        onError: () => {
            toast.error('Falha ao bloquear webhook')
        },
    })

    const unlockMutation = useMutation({
        mutationFn: () => positionsService.unlock(positionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['position', positionId] })
            toast.success('Webhook desbloqueado com sucesso!')
        },
        onError: () => {
            toast.error('Falha ao desbloquear webhook')
        },
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
                <Skeleton className="h-[300px]" />
            </div>
        )
    }

    if (!position) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Posição não encontrada</h2>
                <Button onClick={() => router.push('/positions')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Posições
                </Button>
            </div>
        )
    }

    const pnl = position.currentPrice 
        ? (position.currentPrice - position.entryPrice) * position.quantity * (position.side === 'BUY' ? 1 : -1)
        : 0
    const pnlPercent = position.entryPrice 
        ? ((position.currentPrice - position.entryPrice) / position.entryPrice * 100) * (position.side === 'BUY' ? 1 : -1)
        : 0

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/positions')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{position.symbol}</h1>
                        <p className="text-muted-foreground">
                            {position.account?.name || 'Conta'} • {position.mode}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={position.status === 'OPEN' ? 'default' : 'secondary'}>
                        {position.status}
                    </Badge>
                    <Badge variant={position.side === 'BUY' ? 'default' : 'destructive'}>
                        {position.side}
                    </Badge>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>PnL</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            {pnl >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            <span className={`text-2xl font-bold ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatCurrency(pnl)}
                            </span>
                        </div>
                        <p className={`text-sm ${pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Quantidade</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{position.quantity}</div>
                        <p className="text-sm text-muted-foreground">
                            Preço Entrada: {formatCurrency(position.entryPrice)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Stop Loss</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {position.stopLoss ? formatCurrency(position.stopLoss) : 'N/A'}
                        </div>
                        {position.stopLoss && (
                            <p className="text-sm text-muted-foreground">
                                {((position.stopLoss - position.entryPrice) / position.entryPrice * 100).toFixed(2)}%
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Take Profit</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {position.takeProfit ? formatCurrency(position.takeProfit) : 'N/A'}
                        </div>
                        {position.takeProfit && (
                            <p className="text-sm text-muted-foreground">
                                {((position.takeProfit - position.entryPrice) / position.entryPrice * 100).toFixed(2)}%
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Gráfico de Preço</CardTitle>
                </CardHeader>
                <CardContent>
                    <PriceChart 
                        symbol={position.symbol}
                        entryPrice={position.entryPrice}
                        stopLoss={position.stopLoss}
                        takeProfit={position.takeProfit}
                    />
                </CardContent>
            </Card>

            {/* Actions */}
            {position.status === 'OPEN' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Ações</CardTitle>
                        <CardDescription>Gerencie sua posição</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Button onClick={() => setShowUpdateSLTPModal(true)}>
                            Atualizar SL/TP
                        </Button>
                        <Button variant="destructive" onClick={() => setShowCloseModal(true)}>
                            Fechar Posição
                        </Button>
                        <Button variant="outline" onClick={() => setShowSellLimitModal(true)}>
                            Ordem Limite
                        </Button>
                        {position.webhookLocked ? (
                            <Button
                                variant="outline"
                                onClick={() => unlockMutation.mutate()}
                                disabled={unlockMutation.isPending}
                            >
                                <Unlock className="mr-2 h-4 w-4" />
                                Desbloquear Webhook
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => lockMutation.mutate()}
                                disabled={lockMutation.isPending}
                            >
                                <Lock className="mr-2 h-4 w-4" />
                                Bloquear Webhook
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Position Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-mono">{position.id}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Aberta em:</span>
                        <span>{formatDate(position.openedAt)}</span>
                    </div>
                    {position.closedAt && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Fechada em:</span>
                            <span>{formatDate(position.closedAt)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Preço Atual:</span>
                        <span>{position.currentPrice ? formatCurrency(position.currentPrice) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Webhook Bloqueado:</span>
                        <span>{position.webhookLocked ? 'Sim' : 'Não'}</span>
                    </div>
                </CardContent>
            </Card>

            {/* Modals */}
            {showUpdateSLTPModal && (
                <UpdateSLTPModal
                    position={position}
                    open={showUpdateSLTPModal}
                    onClose={() => setShowUpdateSLTPModal(false)}
                />
            )}
            {showCloseModal && (
                <ClosePositionModal
                    position={position}
                    open={showCloseModal}
                    onClose={() => setShowCloseModal(false)}
                />
            )}
            {showSellLimitModal && (
                <SellLimitModal
                    position={position}
                    open={showSellLimitModal}
                    onClose={() => setShowSellLimitModal(false)}
                />
            )}
        </div>
    )
}

