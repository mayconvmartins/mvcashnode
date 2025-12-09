'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, Search, Wrench } from 'lucide-react'
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
  entityType: 'EXECUTION' | 'POSITION'
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

  const auditMutation = useMutation({
    mutationFn: () => adminService.auditAll(),
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
    mutationFn: (corrections: Discrepancy[]) => adminService.auditFix(corrections),
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

    const corrections = Array.from(selectedCorrections).map((index) => {
      const disc = auditResult.discrepancies[index]
      return {
        type: disc.type,
        entityType: disc.entityType,
        entityId: disc.entityId,
        field: disc.field,
        expectedValue: disc.expectedValue,
      }
    })

    fixMutation.mutate(corrections as any)
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      QUANTITY: 'bg-blue-500',
      PRICE: 'bg-purple-500',
      FEE_AMOUNT: 'bg-orange-500',
      FEE_CURRENCY: 'bg-yellow-500',
      POSITION_QTY: 'bg-red-500',
      POSITION_FEES: 'bg-pink-500',
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
        </div>

        {auditResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Posições Verificadas</div>
                <div className="text-2xl font-bold">{auditResult.total_positions_checked}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Execuções Verificadas</div>
                <div className="text-2xl font-bold">{auditResult.total_executions_checked}</div>
              </div>
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
      </CardContent>
    </Card>
  )
}
