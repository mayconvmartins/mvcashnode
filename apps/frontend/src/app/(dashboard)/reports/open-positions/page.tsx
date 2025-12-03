'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsService } from '@/lib/api/reports.service'
import { accountsService } from '@/lib/api/accounts.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils/format'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { Filter } from 'lucide-react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function OpenPositionsReportPage() {
    const { tradeMode } = useTradeMode()
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [filtersOpen, setFiltersOpen] = useState(false)

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    const filters: any = {
        trade_mode: tradeMode,
        ...(selectedAccount !== 'all' && { exchange_account_id: parseInt(selectedAccount) }),
    }
    
    const { data: report, isLoading } = useQuery({
        queryKey: ['reports', 'open-positions', filters],
        queryFn: () => reportsService.getOpenPositionsSummary(filters),
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Posições Abertas</h1>
                    <p className="text-muted-foreground">
                        Exposição atual por símbolo
                    </p>
                </div>
            </div>

            {/* Filtros */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <Card>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Filter className="h-5 w-5" />
                                    Filtros
                                </CardTitle>
                            </div>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="account-filter">Conta de Exchange</Label>
                                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                        <SelectTrigger id="account-filter">
                                            <SelectValue placeholder="Todas as contas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas as contas</SelectItem>
                                            {accounts?.filter(acc => {
                                                const accTradeMode = acc.is_simulation ? 'SIMULATION' : 'REAL'
                                                return accTradeMode === tradeMode
                                            }).map(account => (
                                                <SelectItem key={account.id} value={account.id.toString()}>
                                                    {account.label} ({account.exchange})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total de Posições</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.totalPositions || 0}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Investimento Total</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatCurrency(report?.totalInvested || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>PnL Não Realizado</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${(report?.totalUnrealizedPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {formatCurrency(report?.totalUnrealizedPnL || 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Símbolos Únicos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{report?.bySymbol?.length || 0}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Pie Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Investimento por Símbolo</CardTitle>
                    <CardDescription>Distribuição de capital por ativo</CardDescription>
                </CardHeader>
                <CardContent>
                    {report?.bySymbol && report.bySymbol.length > 0 ? (
                        <ResponsiveContainer width="100%" height={400}>
                            <PieChart>
                                <Pie
                                    data={report.bySymbol}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={(entry: any) => `${entry.symbol}: ${((entry.invested / (report.totalInvested || 1)) * 100).toFixed(1)}%`}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    dataKey="invested"
                                >
                                    {report.bySymbol.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => formatCurrency(value)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                            Nenhuma posição aberta
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* By Symbol Table */}
            {report?.bySymbol && report.bySymbol.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Detalhamento por Símbolo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Símbolo</th>
                                        <th className="text-right p-2">Posições</th>
                                        <th className="text-right p-2">Exposição</th>
                                        <th className="text-right p-2">PnL Não Realizado</th>
                                        <th className="text-right p-2">%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.bySymbol.map((item: any, index: number) => (
                                        <tr key={index} className="border-b">
                                            <td className="p-2 font-medium">{item.symbol}</td>
                                            <td className="text-right p-2">{item.count}</td>
                                            <td className="text-right p-2">{formatCurrency(item.invested)}</td>
                                            <td className={`text-right p-2 ${item.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {formatCurrency(item.unrealizedPnL)}
                                            </td>
                                            <td className="text-right p-2">
                                                {((item.invested / (report.totalInvested || 1)) * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

