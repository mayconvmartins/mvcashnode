'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatsCard } from '@/components/shared/StatsCard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { reportsService } from '@/lib/api/reports.service'
import { accountsService } from '@/lib/api/accounts.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import { DateRangeFilter, type DatePreset } from '@/components/positions/DateRangeFilter'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Download, Filter, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { DataTable, type Column } from '@/components/shared/DataTable'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

export default function SymbolCorrelationReportPage() {
    const { tradeMode } = useTradeMode()
    const [dateFrom, setDateFrom] = useState<string | undefined>()
    const [dateTo, setDateTo] = useState<string | undefined>()
    const [datePreset, setDatePreset] = useState<DatePreset>('last30days')
    const [selectedAccount, setSelectedAccount] = useState<string>('all')
    const [filtersOpen, setFiltersOpen] = useState(false)

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    // Construir filtros
    const filters = useMemo(() => {
        const f: any = { trade_mode: tradeMode }
        if (dateFrom) f.from = dateFrom
        if (dateTo) f.to = dateTo
        if (selectedAccount !== 'all') f.exchange_account_id = parseInt(selectedAccount)
        return f
    }, [tradeMode, dateFrom, dateTo, selectedAccount])

    const handleDateChange = (from: string | undefined, to: string | undefined, preset: DatePreset) => {
        setDateFrom(from)
        setDateTo(to)
        setDatePreset(preset)
    }

    const { data: correlations, isLoading } = useQuery({
        queryKey: ['reports', 'symbol-correlation', filters],
        queryFn: () => reportsService.getSymbolCorrelation(filters),
    })

    // Inicializar datas
    useEffect(() => {
        if (datePreset === 'last30days' && !dateFrom && !dateTo) {
            const today = new Date()
            const last30Days = new Date(today)
            last30Days.setDate(last30Days.getDate() - 30)
            setDateFrom(last30Days.toISOString())
            setDateTo(today.toISOString())
        }
    }, [])

    // Exportar para CSV
    const handleExportCSV = () => {
        if (!correlations || correlations.length === 0) return
        
        const headers = ['Símbolo 1', 'Símbolo 2', 'Correlação']
        const rows = correlations.map(item => [
            item.symbol1,
            item.symbol2,
            item.correlation.toFixed(4)
        ])
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `symbol-correlation-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const getCorrelationColor = (correlation: number): string => {
        if (correlation >= 0.7) return 'text-red-500'
        if (correlation >= 0.3) return 'text-orange-500'
        if (correlation >= -0.3) return 'text-yellow-500'
        if (correlation >= -0.7) return 'text-blue-500'
        return 'text-green-500'
    }

    const getCorrelationLabel = (correlation: number): string => {
        if (correlation >= 0.7) return 'Alta Correlação Positiva'
        if (correlation >= 0.3) return 'Correlação Positiva Moderada'
        if (correlation >= -0.3) return 'Baixa Correlação'
        if (correlation >= -0.7) return 'Correlação Negativa Moderada'
        return 'Alta Correlação Negativa'
    }

    const columns: Column<any>[] = [
        { key: 'symbol1', label: 'Símbolo 1', render: (row) => <span className="font-mono">{row.symbol1}</span> },
        { key: 'symbol2', label: 'Símbolo 2', render: (row) => <span className="font-mono">{row.symbol2}</span> },
        { 
            key: 'correlation', 
            label: 'Correlação', 
            render: (row) => (
                <div>
                    <span className={`font-bold ${getCorrelationColor(row.correlation)}`}>
                        {row.correlation.toFixed(4)}
                    </span>
                    <p className="text-xs text-muted-foreground">{getCorrelationLabel(row.correlation)}</p>
                </div>
            )
        },
    ]

    const strongCorrelations = useMemo(() => {
        if (!correlations) return []
        return correlations.filter(c => Math.abs(c.correlation) >= 0.7)
    }, [correlations])

    const totalPairs = correlations?.length || 0

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Correlação entre Símbolos</h1>
                    <p className="text-muted-foreground mt-1">Análise de correlação de retornos entre pares de símbolos</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleExportCSV} disabled={!correlations || correlations.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Exportar CSV
                    </Button>
                    <ModeToggle />
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

                            <DateRangeFilter
                                from={dateFrom}
                                to={dateTo}
                                preset={datePreset}
                                onDateChange={handleDateChange}
                            />
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <div className="grid gap-4 md:grid-cols-3">
                <StatsCard title="Total de Pares" value={totalPairs.toString()} icon={TrendingUp} loading={isLoading} />
                <StatsCard title="Correlações Fortes" value={strongCorrelations.length.toString()} icon={TrendingUp} loading={isLoading} />
                <StatsCard 
                    title="Correlação Média" 
                    value={correlations && correlations.length > 0 
                        ? (correlations.reduce((sum, c) => sum + Math.abs(c.correlation), 0) / correlations.length).toFixed(4)
                        : 'N/A'
                    } 
                    icon={TrendingUp} 
                    loading={isLoading} 
                />
            </div>

            {!isLoading && (!correlations || correlations.length === 0) && (
                <Card className="border-yellow-500 bg-yellow-500/10">
                    <CardHeader>
                        <CardTitle>Informação</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Para calcular correlações, é necessário ter pelo menos <strong>2 símbolos diferentes</strong> com posições fechadas no período selecionado.
                            Tente aumentar o período ou verifique se há trades fechados para múltiplos símbolos.
                        </p>
                    </CardContent>
                </Card>
            )}

            {strongCorrelations.length > 0 && (
                <Card className="border-orange-500">
                    <CardHeader>
                        <CardTitle>Correlações Fortes (≥ 0.7)</CardTitle>
                        <CardDescription>Pares com alta correlação - considere diversificação</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {strongCorrelations.slice(0, 10).map((corr, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 border rounded">
                                    <span className="font-mono">{corr.symbol1} ↔ {corr.symbol2}</span>
                                    <span className={`font-bold ${getCorrelationColor(corr.correlation)}`}>
                                        {corr.correlation.toFixed(4)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todas as Correlações</CardTitle>
                    <CardDescription>Lista completa de correlações entre pares de símbolos</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-[200px]">
                            <div className="text-muted-foreground">Carregando dados...</div>
                        </div>
                    ) : !correlations || correlations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] space-y-2">
                            <div className="text-muted-foreground">Nenhum dado disponível</div>
                            <div className="text-xs text-muted-foreground text-center max-w-md">
                                É necessário ter pelo menos 2 símbolos diferentes com posições fechadas no período selecionado para calcular correlações.
                            </div>
                        </div>
                    ) : (
                        <DataTable data={correlations} columns={columns} loading={false} />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Interpretação da Correlação</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 text-sm">
                        <p><strong>Correlação ≥ 0.7:</strong> Alta correlação positiva - símbolos tendem a se mover juntos</p>
                        <p><strong>Correlação 0.3 a 0.7:</strong> Correlação positiva moderada</p>
                        <p><strong>Correlação -0.3 a 0.3:</strong> Baixa correlação - movimentos independentes</p>
                        <p><strong>Correlação -0.7 a -0.3:</strong> Correlação negativa moderada - tendem a se mover em direções opostas</p>
                        <p><strong>Correlação ≤ -0.7:</strong> Alta correlação negativa - forte movimento inverso</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

