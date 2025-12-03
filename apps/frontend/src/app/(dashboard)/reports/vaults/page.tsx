'use client'

import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useTradeMode } from '@/lib/hooks/useTradeMode'

export default function VaultsReportPage() {
    const { tradeMode } = useTradeMode()
    
    const { data: vaults, isLoading } = useQuery({
        queryKey: ['reports', 'vaults', tradeMode],
        queryFn: () => reportsService.getVaultsSummary({ trade_mode: tradeMode }),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Relatório de Vaults</h1>
                <p className="text-muted-foreground">
                    Consolidação de saldos e performance
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Vaults</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{vaults?.length || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Assets</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {vaults?.reduce((acc, vault) => acc + Object.keys(vault.assets || {}).length, 0) || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Volume Total</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(
                                vaults?.reduce((acc, vault) => {
                                    const vaultTotal = Object.values(vault.assets || {}).reduce(
                                        (sum: number, asset: any) => sum + (asset.volume || 0),
                                        0
                                    )
                                    return acc + vaultTotal
                                }, 0) || 0
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>


            {/* Vaults List */}
            {vaults && vaults.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhamento por Vault</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {vaults.map((vault) => {
                                const totalVolume = Object.values(vault.assets || {}).reduce(
                                    (sum: number, asset: any) => sum + (asset.volume || 0),
                                    0
                                )
                                return (
                                    <div
                                        key={vault.vault_id}
                                        className="p-4 border rounded-lg space-y-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-medium text-lg">{vault.vault_name}</h4>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold">{formatCurrency(totalVolume)}</div>
                                            </div>
                                        </div>
                                        {vault.assets && Object.keys(vault.assets).length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-sm font-medium text-muted-foreground">Assets:</p>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                    {Object.values(vault.assets).map((asset: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                                                            <span className="text-sm font-mono">{asset.asset}</span>
                                                            <span className="text-sm font-medium">{formatCurrency(asset.volume)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

