'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { accountsService } from '@/lib/api/accounts.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { X, Loader2, AlertTriangle, DollarSign } from 'lucide-react'

export function ClosePositionsBreakeven() {
    const [tradeMode, setTradeMode] = useState<'REAL' | 'SIMULATION'>('REAL')
    const [exchangeAccountId, setExchangeAccountId] = useState<string>('all')
    const [symbol, setSymbol] = useState<string>('')
    const [result, setResult] = useState<{
        total_positions_found: number
        total_positions_closed: number
        jobs_created: number[]
        executions_created: number[]
        errors?: string[]
    } | null>(null)

    // Buscar contas
    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    const closeMutation = useMutation({
        mutationFn: () => {
            const filters: any = {
                trade_mode: tradeMode,
            }
            if (exchangeAccountId !== 'all') {
                filters.exchange_account_id = parseInt(exchangeAccountId)
            }
            if (symbol.trim()) {
                filters.symbol = symbol.trim()
            }
            return adminService.closePositionsBreakeven(filters)
        },
        onSuccess: (data) => {
            setResult(data)
            if (data.total_positions_closed > 0) {
                toast.success(
                    `Fechamento concluído: ${data.total_positions_closed} posição(ões) fechada(s) sem lucro/perda`
                )
            } else {
                toast.info('Nenhuma posição encontrada para fechar')
            }
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} erro(s) durante o fechamento`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao fechar posições')
        },
    })

    const canExecute = tradeMode && (exchangeAccountId === 'all' || exchangeAccountId !== '')

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Fechar Posições sem Lucro/Perda
                </CardTitle>
                <CardDescription className="text-xs">
                    Cria jobs de venda fictícios no preço de entrada para fechar posições sem lucro ou perda
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Filtros */}
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label htmlFor="trade-mode">Trade Mode *</Label>
                        <Select value={tradeMode} onValueChange={(v) => setTradeMode(v as 'REAL' | 'SIMULATION')}>
                            <SelectTrigger id="trade-mode">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="REAL">REAL</SelectItem>
                                <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="exchange-account">Conta de Exchange (opcional)</Label>
                        <Select value={exchangeAccountId} onValueChange={setExchangeAccountId}>
                            <SelectTrigger id="exchange-account">
                                <SelectValue placeholder="Todas as contas" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas as contas</SelectItem>
                                {accounts
                                    ?.filter((acc) => {
                                        const accTradeMode = acc.is_simulation ? 'SIMULATION' : 'REAL'
                                        return accTradeMode === tradeMode
                                    })
                                    .map((account) => (
                                        <SelectItem key={account.id} value={account.id.toString()}>
                                            {account.label} ({account.exchange})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="symbol">Símbolo (opcional)</Label>
                        <Input
                            id="symbol"
                            placeholder="Ex: BTCUSDT"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                        />
                    </div>
                </div>

                {/* Resultados */}
                {result && (
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Posições encontradas:</span>
                            <Badge variant="outline">{result.total_positions_found}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Posições fechadas:</span>
                            <Badge variant={result.total_positions_closed > 0 ? 'default' : 'secondary'}>
                                {result.total_positions_closed}
                            </Badge>
                        </div>
                        {result.jobs_created.length > 0 && (
                            <div className="mt-2">
                                <span className="text-sm font-medium">Jobs criados:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {result.jobs_created.slice(0, 10).map((jobId) => (
                                        <Badge key={jobId} variant="secondary" className="text-xs">
                                            #{jobId}
                                        </Badge>
                                    ))}
                                    {result.jobs_created.length > 10 && (
                                        <Badge variant="secondary" className="text-xs">
                                            +{result.jobs_created.length - 10} mais
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}
                        {result.executions_created.length > 0 && (
                            <div className="mt-2">
                                <span className="text-sm font-medium">Execuções criadas:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {result.executions_created.slice(0, 10).map((execId) => (
                                        <Badge key={execId} variant="secondary" className="text-xs">
                                            #{execId}
                                        </Badge>
                                    ))}
                                    {result.executions_created.length > 10 && (
                                        <Badge variant="secondary" className="text-xs">
                                            +{result.executions_created.length - 10} mais
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}
                        {result.errors && result.errors.length > 0 && (
                            <div className="mt-2">
                                <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="font-medium">Erros ({result.errors.length}):</span>
                                </div>
                                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                                    {result.errors.slice(0, 5).map((error, idx) => (
                                        <li key={idx}>{error}</li>
                                    ))}
                                    {result.errors.length > 5 && (
                                        <li className="text-muted-foreground">
                                            ... e mais {result.errors.length - 5} erro(s)
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
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
                                Fechando posições...
                            </>
                        ) : (
                            <>
                                <DollarSign className="h-4 w-4 mr-2" />
                                Fechar Posições
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

