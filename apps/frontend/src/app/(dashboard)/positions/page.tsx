'use client'

import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PnLBadge } from '@/components/shared/PnLBadge'
import { SymbolDisplay } from '@/components/shared/SymbolDisplay'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { positionsService } from '@/lib/api/positions.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import type { Position } from '@/lib/types'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'

export default function PositionsPage() {
    const { tradeMode } = useTradeMode()

    const { data: openPositions, isLoading: loadingOpen } = useQuery({
        queryKey: ['positions', 'OPEN', tradeMode],
        queryFn: () => positionsService.list({ status: 'OPEN', trade_mode: tradeMode }),
        refetchInterval: 30000, // Refetch a cada 30s
    })

    const { data: closedPositions, isLoading: loadingClosed } = useQuery({
        queryKey: ['positions', 'CLOSED', tradeMode],
        queryFn: () => positionsService.list({ status: 'CLOSED', trade_mode: tradeMode }),
    })

    const columns: Column<Position>[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (position) => (
                <SymbolDisplay
                    exchange={position.exchange_account_id as any}
                    symbol={position.symbol}
                    showExchange={false}
                />
            ),
        },
        {
            key: 'side',
            label: 'Lado',
            render: (position) => (
                <Badge variant={position.side === 'LONG' ? 'success' : 'destructive'}>
                    {position.side}
                </Badge>
            ),
        },
        {
            key: 'qty_remaining',
            label: 'Quantidade',
            render: (position) => <span className="font-mono">{position.qty_remaining.toFixed(4)}</span>,
        },
        {
            key: 'price_open',
            label: 'Preço Entrada',
            render: (position) => <span className="font-mono">{formatCurrency(position.price_open)}</span>,
        },
        {
            key: 'realized_profit_usd',
            label: 'PnL',
            render: (position) => <PnLBadge value={position.realized_profit_usd} />,
        },
        {
            key: 'sl_tp',
            label: 'SL/TP',
            render: (position) => (
                <div className="flex gap-1">
                    {position.sl_enabled && <Badge variant="outline">SL</Badge>}
                    {position.tp_enabled && <Badge variant="outline">TP</Badge>}
                </div>
            ),
        },
        {
            key: 'created_at',
            label: 'Abertura',
            render: (position) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(position.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (position) => (
                <Link href={`/positions/${position.id}`}>
                    <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                    </Button>
                </Link>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Posições</h1>
                    <p className="text-muted-foreground mt-1">Gerencie suas posições de trading</p>
                </div>
                <ModeToggle />
            </div>

            <Tabs defaultValue="open" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="open">Abertas ({openPositions?.length || 0})</TabsTrigger>
                    <TabsTrigger value="closed">Fechadas</TabsTrigger>
                </TabsList>

                <TabsContent value="open">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Posições Abertas - {tradeMode}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={openPositions || []}
                                columns={columns}
                                loading={loadingOpen}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">Nenhuma posição aberta</p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="closed">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Posições Fechadas - {tradeMode}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                data={closedPositions || []}
                                columns={columns}
                                loading={loadingClosed}
                                emptyState={
                                    <div className="text-center py-12">
                                        <p className="text-muted-foreground">Nenhuma posição fechada</p>
                                    </div>
                                }
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

