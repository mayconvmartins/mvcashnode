'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Loader2, Package, ArrowRightLeft, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { SymbolDisplay } from '@/components/shared/SymbolDisplay'
import { Position, ResidueTransferJob } from '@/lib/types'

export default function ResiduePositionsPage() {
    const { tradeMode } = useTradeMode()
    const [activeTab, setActiveTab] = useState<'positions' | 'transfers'>('positions')

    // Query para posições de resíduo
    const { data: residueData, isLoading: isLoadingPositions } = useQuery({
        queryKey: ['residue-positions', tradeMode],
        queryFn: async () => {
            const response = await api.get('/positions/residue', {
                params: { trade_mode: tradeMode }
            })
            return response.data
        }
    })

    // Query para transferências de resíduo
    const { data: transfersData, isLoading: isLoadingTransfers } = useQuery({
        queryKey: ['residue-transfers', tradeMode],
        queryFn: async () => {
            const response = await api.get('/positions/residue/transfers', {
                params: { trade_mode: tradeMode, limit: 100 }
            })
            return response.data
        }
    })

    const positionColumns: Column<Position & { estimated_value_usd?: number; residue_moves_count?: number }>[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (pos) => (
                <div className="flex items-center gap-2">
                    <SymbolDisplay symbol={pos.symbol} exchange={pos.exchange_account_id as any} showExchange={false} />
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50 text-xs">
                        Consolidado
                    </Badge>
                </div>
            )
        },
        {
            key: 'exchange_account',
            label: 'Conta',
            render: (pos) => {
                const account = (pos as any).exchange_account
                return account ? (
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">{account.label}</span>
                        <span className="text-xs text-muted-foreground">{account.exchange}</span>
                    </div>
                ) : '-'
            }
        },
        {
            key: 'qty_remaining',
            label: 'Quantidade',
            render: (pos) => <span className="font-mono">{Number(pos.qty_remaining || 0).toFixed(8)}</span>
        },
        {
            key: 'price_open',
            label: 'Preço Médio',
            render: (pos) => <span className="font-mono">{formatCurrency(Number(pos.price_open || 0))}</span>
        },
        {
            key: 'estimated_value_usd',
            label: 'Valor Estimado',
            render: (pos) => (
                <span className="font-mono text-muted-foreground">
                    {formatCurrency(pos.estimated_value_usd || 0)}
                </span>
            )
        },
        {
            key: 'residue_moves_count',
            label: 'Transferências',
            render: (pos) => (
                <Badge variant="outline">{pos.residue_moves_count || 0}</Badge>
            )
        },
        {
            key: 'status',
            label: 'Status',
            render: (pos) => (
                <Badge variant={pos.status === 'OPEN' ? 'default' : 'secondary'}>
                    {pos.status}
                </Badge>
            )
        },
        {
            key: 'created_at',
            label: 'Criado em',
            render: (pos) => <span className="text-sm text-muted-foreground">{formatDateTime(pos.created_at)}</span>
        }
    ]

    const transferColumns: Column<ResidueTransferJob>[] = [
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (t) => <SymbolDisplay symbol={t.symbol} showExchange={false} />
        },
        {
            key: 'source_position',
            label: 'Origem',
            render: (t) => (
                <div className="flex flex-col">
                    <span className="font-mono text-sm">#{t.source_position_id}</span>
                    {t.source_position?.exchange_account && (
                        <span className="text-xs text-muted-foreground">{t.source_position.exchange_account.label}</span>
                    )}
                </div>
            )
        },
        {
            key: 'target_position',
            label: 'Destino',
            render: (t) => (
                t.target_position_id ? (
                    <span className="font-mono text-sm">#{t.target_position_id}</span>
                ) : '-'
            )
        },
        {
            key: 'qty_transferred',
            label: 'Quantidade',
            render: (t) => <span className="font-mono">{Number(t.qty_transferred || 0).toFixed(8)}</span>
        },
        {
            key: 'status',
            label: 'Status',
            render: (t) => {
                const statusConfig = {
                    PENDING: { icon: Clock, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/50' },
                    COMPLETED: { icon: CheckCircle, color: 'bg-green-500/10 text-green-600 border-green-500/50' },
                    FAILED: { icon: AlertCircle, color: 'bg-red-500/10 text-red-600 border-red-500/50' }
                }
                const config = statusConfig[t.status] || statusConfig.PENDING
                const Icon = config.icon
                return (
                    <Badge variant="outline" className={config.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {t.status}
                    </Badge>
                )
            }
        },
        {
            key: 'created_at',
            label: 'Data',
            render: (t) => <span className="text-sm text-muted-foreground">{formatDateTime(t.created_at)}</span>
        }
    ]

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Posições de Resíduo</h1>
                    <p className="text-muted-foreground">
                        Gerencie posições consolidadas de resíduos (quantidades menores que $1 USD)
                    </p>
                </div>
                <Badge variant="outline" className="text-lg px-4 py-2">
                    {tradeMode}
                </Badge>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Posições de Resíduo</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {residueData?.summary?.total_positions || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            posições consolidadas
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Valor Total Estimado</CardTitle>
                        <span className="text-muted-foreground">$</span>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(residueData?.summary?.total_estimated_value_usd || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            em resíduos acumulados
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Transferências</CardTitle>
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {transfersData?.pagination?.total || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            transferências registradas
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList>
                    <TabsTrigger value="positions" className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Posições Consolidadas
                    </TabsTrigger>
                    <TabsTrigger value="transfers" className="flex items-center gap-2">
                        <ArrowRightLeft className="h-4 w-4" />
                        Histórico de Transferências
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="positions" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Posições de Resíduo Consolidadas</CardTitle>
                            <CardDescription>
                                Resíduos pequenos (menores que $1 USD) são automaticamente movidos para estas posições consolidadas
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingPositions ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : residueData?.data?.length > 0 ? (
                                <DataTable
                                    data={residueData.data}
                                    columns={positionColumns}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-semibold">Nenhuma posição de resíduo</h3>
                                    <p className="text-muted-foreground">
                                        Posições de resíduo são criadas automaticamente quando uma venda deixa um saldo muito pequeno
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="transfers" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Histórico de Transferências</CardTitle>
                            <CardDescription>
                                Registro de todas as transferências de resíduo entre posições
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoadingTransfers ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : transfersData?.data?.length > 0 ? (
                                <DataTable
                                    data={transfersData.data}
                                    columns={transferColumns}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <ArrowRightLeft className="h-12 w-12 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-semibold">Nenhuma transferência registrada</h3>
                                    <p className="text-muted-foreground">
                                        Transferências são criadas automaticamente quando resíduos são movidos para posições consolidadas
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

