'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { accountsService } from '@/lib/api/accounts.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { toast } from 'sonner'
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, Search, Wrench, Filter, ChevronDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Discrepancy {
  type: string
  entityType: 'EXECUTION' | 'POSITION' | 'JOB'
  entityId: number
  field: string
  currentValue: number | string
  expectedValue: number | string
  canAutoFix: boolean
  fixDescription: string
}

export function AuditPositions() {
  console.log('[AuditPositions] Component rendered')
  
  const [auditResult, setAuditResult] = useState<{
    total_positions_checked: number
    total_executions_checked: number
    total_jobs_checked?: number
    discrepancies_found: number
    discrepancies: Discrepancy[]
    errors: number
    error_details?: Array<{ positionId?: number; executionId?: number; error: string }>
    duration_ms?: number
  } | null>(null)

  const [selectedCorrections, setSelectedCorrections] = useState<Set<number>>(new Set())
  const [fixResult, setFixResult] = useState<{
    total_corrections: number
    fixed: number
    errors: number
    error_details?: Array<{ correction: any; error: string }>
    duration_ms?: number
  } | null>(null)

  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const [checkJobsOnly, setCheckJobsOnly] = useState(false)

  // Buscar contas
  const { data: accounts } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: accountsService.listAll,
  })

  const auditMutation = useMutation({
    mutationFn: () => {
      const params: any = {}
      if (dateFrom) params.from = dateFrom
      if (dateTo) params.to = dateTo
      if (selectedAccountId !== 'all') params.accountId = parseInt(selectedAccountId)
      if (checkJobsOnly) params.checkJobsOnly = true
      return adminService.auditAll(params)
    },
    retry: false, // Não tentar novamente automaticamente (pode demorar muito)
    onSuccess: (data) => {
      setAuditResult(data)
      setSelectedCorrections(new Set())
      if (data.discrepancies_found > 0) {
        toast.warning(`Auditoria concluída: ${data.discrepancies_found} discrepância(s) encontrada(s)`)
      } else {
        toast.success(`Auditoria concluída: Tudo correto! (${data.total_positions_checked} posições, ${data.total_executions_checked} execuções)`)
      }
      if (data.errors > 0) {
        toast.error(`${data.errors} erro(s) durante a auditoria`)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao executar auditoria')
    },
  })

  const fixMutation = useMutation({
    mutationFn: (corrections: Array<{
      type: string
      entityType: 'EXECUTION' | 'POSITION'
      entityId: number
      field: string
      expectedValue: number | string
    }>) => adminService.auditFix(corrections),
    onSuccess: (data) => {
      setFixResult(data)
      if (data.fixed > 0) {
        toast.success(`Correções aplicadas: ${data.fixed} de ${data.total_corrections} correção(ões)`)
      }
      if (data.errors > 0) {
        toast.warning(`${data.errors} erro(s) ao aplicar correções`)
      }
      // Recarregar auditoria após correção
      setTimeout(() => {
        auditMutation.mutate()
      }, 1000)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao aplicar correções')
    },
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked && auditResult) {
      const allIndices = auditResult.discrepancies
        .map((_, index) => index)
        .filter((index) => auditResult.discrepancies[index].canAutoFix)
      setSelectedCorrections(new Set(allIndices))
    } else {
      setSelectedCorrections(new Set())
    }
  }

  const handleSelectCorrection = (index: number, checked: boolean) => {
    const newSelected = new Set(selectedCorrections)
    if (checked) {
      newSelected.add(index)
    } else {
      newSelected.delete(index)
    }
    setSelectedCorrections(newSelected)
  }

  const handleFixSelected = () => {
    if (!auditResult || selectedCorrections.size === 0) {
      return
    }

    const corrections = Array.from(selectedCorrections)
      .map((index) => auditResult.discrepancies[index])
      .filter((disc) => disc.entityType !== 'JOB') // Filtrar JOB pois não são corrigíveis automaticamente
      .map((disc) => ({
        type: disc.type,
        entityType: disc.entityType as 'EXECUTION' | 'POSITION',
        entityId: disc.entityId,
        field: disc.field,
        expectedValue: disc.expectedValue,
      }))

    if (corrections.length === 0) {
      toast.error('Nenhuma correção aplicável selecionada. Discrepâncias do tipo JOB não podem ser corrigidas automaticamente.')
      return
    }

    fixMutation.mutate(corrections)
  }

  // Estado para auditoria de trades da exchange
  const [exchangeTradesResult, setExchangeTradesResult] = useState<{
    account_id: number
    period: { from: string; to: string }
    exchange_trades: { buy_count: number; sell_count: number; total_count: number }
    system_executions: { buy_count: number; sell_count: number; total_count: number }
    missing_in_system: Array<any>
    extra_in_system: Array<any>
    duplicates: Array<any>
    jobs_without_order_id: Array<any>
    errors?: Array<{ symbol?: string; error: string }>
    duration_ms?: number
  } | null>(null)

  const exchangeTradesMutation = useMutation({
    mutationFn: (params: { from: string; to: string; accountId: number }) => 
      adminService.auditExchangeTrades(params),
    retry: false,
    onSuccess: (data) => {
      setExchangeTradesResult(data)
      if (data.missing_in_system.length > 0 || data.extra_in_system.length > 0 || data.duplicates.length > 0) {
        toast.warning(`Auditoria de trades: ${data.missing_in_system.length} faltando, ${data.extra_in_system.length} a mais, ${data.duplicates.length} duplicados`)
      } else {
        toast.success(`Auditoria de trades concluída: Tudo sincronizado!`)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao executar auditoria de trades')
    },
  })

  const handleAuditExchangeTrades = () => {
    if (!dateFrom || !dateTo || selectedAccountId === 'all') {
      toast.error('Selecione data inicial, data final e uma conta específica para auditar trades da exchange')
      return
    }

    // Converter datetime-local para ISO string
    const fromDate = new Date(dateFrom).toISOString()
    const toDate = new Date(dateTo).toISOString()

    exchangeTradesMutation.mutate({
      from: fromDate,
      to: toDate,
      accountId: parseInt(selectedAccountId),
    })
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      QUANTITY: 'bg-blue-500',
      PRICE: 'bg-purple-500',
      FEE_AMOUNT: 'bg-orange-500',
      FEE_CURRENCY: 'bg-yellow-500',
      POSITION_QTY: 'bg-red-500',
      POSITION_FEES: 'bg-pink-500',
      MISSING_ORDER_ID: 'bg-red-600',
      DUPLICATE_ORDER_ID: 'bg-orange-600',
      MISSING_EXECUTION: 'bg-yellow-600',
    }
    return colors[type] || 'bg-gray-500'
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Auditoria Completa de Posições
        </CardTitle>
        <CardDescription className="text-xs">
          Verifica todas as posições abertas, execuções e taxas na exchange via API e compara com dados do banco
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date-from">Data Inicial</Label>
                <Input
                  id="date-from"
                  type="datetime-local"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">Data Final</Label>
                <Input
                  id="date-to"
                  type="datetime-local"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-filter">Conta de Exchange</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger id="account-filter">
                  <SelectValue placeholder="Todas as contas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas</SelectItem>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.label} ({account.exchange}) - {account.is_simulation ? 'SIMULATION' : 'REAL'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="check-jobs-only"
                checked={checkJobsOnly}
                onCheckedChange={(checked) => setCheckJobsOnly(checked as boolean)}
              />
              <Label htmlFor="check-jobs-only" className="cursor-pointer">
                Verificar apenas Trade Jobs (não apenas posições abertas)
              </Label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-2">
          <Button
            onClick={() => auditMutation.mutate()}
            disabled={auditMutation.isPending}
            className="flex-1"
          >
            {auditMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Auditing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Executar Auditoria
              </>
            )}
          </Button>
          <Button
            onClick={handleAuditExchangeTrades}
            disabled={exchangeTradesMutation.isPending || !dateFrom || !dateTo || selectedAccountId === 'all'}
            variant="outline"
            className="flex-1"
          >
            {exchangeTradesMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Auditing Trades...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Auditar Trades Exchange
              </>
            )}
          </Button>
        </div>

        {auditResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Posições Verificadas</div>
                <div className="text-2xl font-bold">{auditResult.total_positions_checked}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Execuções Verificadas</div>
                <div className="text-2xl font-bold">{auditResult.total_executions_checked}</div>
              </div>
              {auditResult.total_jobs_checked !== undefined && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground">Jobs Verificados</div>
                  <div className="text-2xl font-bold">{auditResult.total_jobs_checked}</div>
                </div>
              )}
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Discrepâncias</div>
                <div className="text-2xl font-bold text-orange-500">{auditResult.discrepancies_found}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Erros</div>
                <div className="text-2xl font-bold text-red-500">{auditResult.errors}</div>
              </div>
            </div>

            {auditResult.discrepancies_found > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={
                        auditResult.discrepancies.filter((d) => d.canAutoFix).length > 0 &&
                        Array.from(selectedCorrections).length ===
                          auditResult.discrepancies.filter((d) => d.canAutoFix).length
                      }
                      onCheckedChange={handleSelectAll}
                    />
                    <span className="text-sm font-medium">
                      Selecionar todas as correções automáticas (
                      {auditResult.discrepancies.filter((d) => d.canAutoFix).length})
                    </span>
                  </div>
                  {selectedCorrections.size > 0 && (
                    <Button
                      onClick={handleFixSelected}
                      disabled={fixMutation.isPending}
                      size="sm"
                      variant="default"
                    >
                      {fixMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Corrigindo...
                        </>
                      ) : (
                        <>
                          <Wrench className="mr-2 h-4 w-4" />
                          Corrigir Selecionadas ({selectedCorrections.size})
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Entidade</TableHead>
                        <TableHead>Campo</TableHead>
                        <TableHead>Valor Atual</TableHead>
                        <TableHead>Valor Esperado</TableHead>
                        <TableHead>Descrição</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditResult.discrepancies.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Nenhuma discrepância encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditResult.discrepancies.map((disc, index) => (
                          <TableRow key={`${disc.entityType}-${disc.entityId}-${disc.field}-${index}`}>
                            <TableCell>
                              {disc.canAutoFix && (
                                <Checkbox
                                  checked={selectedCorrections.has(index)}
                                  onCheckedChange={(checked) =>
                                    handleSelectCorrection(index, checked as boolean)
                                  }
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={getTypeBadge(disc.type)}>{disc.type}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium">{disc.entityType}</div>
                                <div className="text-muted-foreground">ID: {disc.entityId}</div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm whitespace-nowrap">{disc.field}</TableCell>
                            <TableCell className="font-mono text-sm whitespace-nowrap">{String(disc.currentValue)}</TableCell>
                            <TableCell className="font-mono text-sm text-green-600 dark:text-green-400 whitespace-nowrap">
                              {String(disc.expectedValue)}
                            </TableCell>
                            <TableCell className="text-sm">{disc.fixDescription}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {auditResult.errors > 0 && auditResult.error_details && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Erros ({auditResult.errors})</span>
                </div>
                <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20 max-h-60 overflow-y-auto">
                  <div className="space-y-1 text-sm">
                    {auditResult.error_details.map((error, index) => (
                      <div key={index} className="text-red-700 dark:text-red-400">
                        {error.positionId && `Posição ${error.positionId}: `}
                        {error.executionId && `Execução ${error.executionId}: `}
                        {error.error}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {auditResult.duration_ms && (
              <div className="text-sm text-muted-foreground">
                Tempo de execução: {(auditResult.duration_ms / 1000).toFixed(2)}s
              </div>
            )}
          </div>
        )}

        {fixResult && (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Correções Aplicadas</span>
            </div>
            <div className="text-sm space-y-1">
              <div>
                {fixResult.fixed} de {fixResult.total_corrections} correção(ões) aplicada(s)
              </div>
              {fixResult.errors > 0 && (
                <div className="text-red-600 dark:text-red-400">
                  {fixResult.errors} erro(s) ao aplicar correções
                </div>
              )}
              {fixResult.duration_ms && (
                <div className="text-muted-foreground">
                  Tempo: {(fixResult.duration_ms / 1000).toFixed(2)}s
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resultados da Auditoria de Trades da Exchange */}
        {exchangeTradesResult && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Auditoria de Trades da Exchange</h3>
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Trades Exchange</div>
                <div className="text-2xl font-bold">{exchangeTradesResult.exchange_trades.total_count}</div>
                <div className="text-xs text-muted-foreground">
                  {exchangeTradesResult.exchange_trades.buy_count} BUY, {exchangeTradesResult.exchange_trades.sell_count} SELL
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Executions Sistema</div>
                <div className="text-2xl font-bold">{exchangeTradesResult.system_executions.total_count}</div>
                <div className="text-xs text-muted-foreground">
                  {exchangeTradesResult.system_executions.buy_count} BUY, {exchangeTradesResult.system_executions.sell_count} SELL
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Faltando no Sistema</div>
                <div className="text-2xl font-bold text-orange-500">{exchangeTradesResult.missing_in_system.length}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">A Mais no Sistema</div>
                <div className="text-2xl font-bold text-red-500">{exchangeTradesResult.extra_in_system.length}</div>
              </div>
            </div>

            {/* Trades Faltando no Sistema */}
            {exchangeTradesResult.missing_in_system.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-orange-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Trades na Exchange que não estão no Sistema ({exchangeTradesResult.missing_in_system.length})</span>
                </div>
                <div className="border rounded-lg overflow-x-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeTradesResult.missing_in_system.map((trade, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-xs">{trade.order_id}</TableCell>
                          <TableCell>
                            <Badge variant={trade.side === 'BUY' ? 'default' : 'destructive'}>
                              {trade.side}
                            </Badge>
                          </TableCell>
                          <TableCell>{trade.symbol}</TableCell>
                          <TableCell>{trade.qty.toFixed(8)}</TableCell>
                          <TableCell>{trade.price.toFixed(8)}</TableCell>
                          <TableCell className="text-xs">{new Date(trade.timestamp).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Executions a Mais no Sistema */}
            {exchangeTradesResult.extra_in_system.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Executions no Sistema que não estão na Exchange ({exchangeTradesResult.extra_in_system.length})</span>
                </div>
                <div className="border rounded-lg overflow-x-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Execution ID</TableHead>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Symbol</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeTradesResult.extra_in_system.map((exec, index) => (
                        <TableRow key={index}>
                          <TableCell>{exec.execution_id}</TableCell>
                          <TableCell>{exec.job_id}</TableCell>
                          <TableCell className="font-mono text-xs">{exec.exchange_order_id}</TableCell>
                          <TableCell>
                            <Badge variant={exec.side === 'BUY' ? 'default' : 'destructive'}>
                              {exec.side}
                            </Badge>
                          </TableCell>
                          <TableCell>{exec.symbol}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Duplicados */}
            {exchangeTradesResult.duplicates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-orange-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Executions Duplicados ({exchangeTradesResult.duplicates.length})</span>
                </div>
                <div className="border rounded-lg overflow-x-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Count</TableHead>
                        <TableHead>Execution IDs</TableHead>
                        <TableHead>Job IDs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeTradesResult.duplicates.map((dup, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-xs">{dup.exchange_order_id}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">{dup.count}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{dup.execution_ids.join(', ')}</TableCell>
                          <TableCell className="text-xs">{dup.job_ids.join(', ')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Jobs sem Order ID */}
            {exchangeTradesResult.jobs_without_order_id.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-yellow-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Jobs sem Exchange Order ID ({exchangeTradesResult.jobs_without_order_id.length})</span>
                </div>
                <div className="border rounded-lg overflow-x-auto max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Execution ID</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeTradesResult.jobs_without_order_id.map((job, index) => (
                        <TableRow key={index}>
                          <TableCell>{job.job_id}</TableCell>
                          <TableCell>{job.execution_id || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant={job.side === 'BUY' ? 'default' : 'destructive'}>
                              {job.side}
                            </Badge>
                          </TableCell>
                          <TableCell>{job.symbol}</TableCell>
                          <TableCell>{job.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {exchangeTradesResult.duration_ms && (
              <div className="text-sm text-muted-foreground">
                Tempo de execução: {(exchangeTradesResult.duration_ms / 1000).toFixed(2)}s
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
