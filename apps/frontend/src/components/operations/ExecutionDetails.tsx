'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDateTime, formatCurrency } from '@/lib/utils/format'
import { TrendingUp, TrendingDown, DollarSign, Hash, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ExecutionDetailsData {
    id: number
    jobId: number
    accountId: number
    symbol: string
    side: 'BUY' | 'SELL'
    executedQty: number
    executedPrice: number
    commission: number
    commissionAsset: string
    executionTime: string
    orderId?: string
    status: string
    account?: {
        label: string
        exchange: string
    }
}

interface ExecutionDetailsProps {
    execution: ExecutionDetailsData
}

export function ExecutionDetails({ execution }: ExecutionDetailsProps) {
    const totalValue = execution.executedQty * execution.executedPrice

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <span className="font-mono">{execution.symbol}</span>
                                {execution.side === 'BUY' ? (
                                    <TrendingUp className="h-5 w-5 text-green-500" />
                                ) : (
                                    <TrendingDown className="h-5 w-5 text-destructive" />
                                )}
                            </CardTitle>
                            <CardDescription>Execução #{execution.id}</CardDescription>
                        </div>
                        <Badge
                            variant={execution.side === 'BUY' ? 'default' : 'destructive'}
                            className={cn(
                                execution.side === 'BUY' && 'bg-green-500 hover:bg-green-600'
                            )}
                        >
                            {execution.side === 'BUY' ? 'Compra' : 'Venda'}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Account Info */}
                    {execution.account && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                            <div>
                                <p className="text-sm font-medium">{execution.account.label}</p>
                                <p className="text-xs text-muted-foreground">{execution.account.exchange}</p>
                            </div>
                            <Badge variant="outline">Conta #{execution.accountId}</Badge>
                        </div>
                    )}

                    <Separator />

                    {/* Execution Details */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Hash className="h-4 w-4" />
                                <span>Quantidade Executada</span>
                            </div>
                            <p className="text-lg font-semibold">{execution.executedQty}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <DollarSign className="h-4 w-4" />
                                <span>Preço de Execução</span>
                            </div>
                            <p className="text-lg font-semibold">
                                {formatCurrency(execution.executedPrice)}
                            </p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <DollarSign className="h-4 w-4" />
                                <span>Valor Total</span>
                            </div>
                            <p className="text-lg font-semibold">{formatCurrency(totalValue)}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                <span>Data de Execução</span>
                            </div>
                            <p className="text-sm font-medium">
                                {formatDateTime(execution.executionTime)}
                            </p>
                        </div>
                    </div>

                    <Separator />

                    {/* Commission */}
                    <div className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Comissão</span>
                            <Badge variant="secondary" className="text-xs">
                                {execution.commissionAsset}
                            </Badge>
                        </div>
                        <p className="text-lg font-semibold">
                            {execution.commission} {execution.commissionAsset}
                        </p>
                    </div>

                    {/* Order ID */}
                    {execution.orderId && (
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Order ID (Exchange)</p>
                            <p className="text-sm font-mono bg-muted px-3 py-2 rounded">
                                {execution.orderId}
                            </p>
                        </div>
                    )}

                    {/* Job Reference */}
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">Job Relacionado</p>
                        <Badge variant="outline">Job #{execution.jobId}</Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Status Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Status da Execução</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                        <div>
                            <p className="text-sm font-medium">Executado com Sucesso</p>
                            <p className="text-xs text-muted-foreground">
                                A ordem foi preenchida na exchange
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
