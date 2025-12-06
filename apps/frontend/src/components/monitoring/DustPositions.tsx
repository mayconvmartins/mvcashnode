'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, Sparkles, X, Layers } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function DustPositions() {
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  // Query para buscar posições resíduo
  const { data: dustData, refetch: refetchDust } = useQuery({
    queryKey: ['dust-positions'],
    queryFn: () => adminService.getDustPositions(),
    enabled: false, // Só busca quando solicitado
  })

  // Mutation para identificar candidatas
  const identifyMutation = useMutation({
    mutationFn: () => adminService.identifyDustPositions(),
    onSuccess: (data) => {
      if (data.total_found > 0) {
        toast.success(`Encontradas ${data.total_found} posição(ões) candidata(s) a resíduo`)
      } else {
        toast.info('Nenhuma posição candidata a resíduo encontrada')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao identificar posições resíduo')
    },
  })

  // Mutation para converter para resíduo
  const convertMutation = useMutation({
    mutationFn: (positionIds: number[]) => adminService.convertToDust(positionIds),
    onSuccess: (data) => {
      if (data.converted > 0) {
        toast.success(`${data.converted} posição(ões) convertida(s) para resíduo`)
        setSelectedCandidates(new Set())
        refetchDust()
      }
      if (data.errors > 0) {
        toast.warning(`${data.errors} erro(s) ao converter`)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao converter posições')
    },
  })

  // Mutation para fechar resíduos
  const closeMutation = useMutation({
    mutationFn: ({ symbol, exchangeAccountId, positionIds }: { symbol: string; exchangeAccountId: number; positionIds: number[] }) =>
      adminService.closeDustBySymbol(symbol, exchangeAccountId, positionIds),
    onSuccess: (data) => {
      toast.success(`Job de venda criado: ${data.tradeJobId} para fechar resíduos de ${data.symbol}`)
      setSelectedGroups(new Set())
      refetchDust()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao fechar resíduos')
    },
  })

  const [candidates, setCandidates] = useState<Array<{
    positionId: number
    symbol: string
    exchangeAccountId: number
    qtyRemaining: number
    qtyTotal: number
    percentage: number
    currentValueUsd: number
    currentPrice: number
  }>>([])

  const handleIdentify = () => {
    identifyMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCandidates(data.candidates || [])
      },
    })
  }

  const handleSelectAllCandidates = (checked: boolean) => {
    if (checked) {
      setSelectedCandidates(new Set(candidates.map(c => c.positionId)))
    } else {
      setSelectedCandidates(new Set())
    }
  }

  const handleSelectCandidate = (positionId: number, checked: boolean) => {
    const newSelected = new Set(selectedCandidates)
    if (checked) {
      newSelected.add(positionId)
    } else {
      newSelected.delete(positionId)
    }
    setSelectedCandidates(newSelected)
  }

  const handleConvert = () => {
    if (selectedCandidates.size === 0) {
      toast.error('Selecione pelo menos uma posição para converter')
      return
    }
    convertMutation.mutate(Array.from(selectedCandidates))
  }

  const handleSelectGroup = (key: string, checked: boolean) => {
    const newSelected = new Set(selectedGroups)
    if (checked) {
      newSelected.add(key)
    } else {
      newSelected.delete(key)
    }
    setSelectedGroups(newSelected)
  }

  const handleCloseSelected = () => {
    if (selectedGroups.size === 0 || !dustData) {
      toast.error('Selecione pelo menos um grupo para fechar')
      return
    }

    for (const groupKey of selectedGroups) {
      const group = dustData.groups.find(g => `${g.exchangeAccountId}:${g.symbol}` === groupKey)
      if (group && group.canClose) {
        closeMutation.mutate({
          symbol: group.symbol,
          exchangeAccountId: group.exchangeAccountId,
          positionIds: group.positionIds,
        })
      } else {
        toast.warning(`Grupo ${groupKey} não pode ser fechado (valor < US$ 5.00)`)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Gerenciamento de Resíduos
        </CardTitle>
        <CardDescription>
          Identifica e gerencia posições com quantidade restante muito baixa (< 1% E < US$ 5.00)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Seção de Identificação */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Identificar Candidatas a Resíduo</h3>
            <Button
              onClick={handleIdentify}
              disabled={identifyMutation.isPending}
              size="sm"
              variant="outline"
            >
              {identifyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Identificando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Identificar Resíduos
                </>
              )}
            </Button>
          </div>

          {candidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCandidates.size === candidates.length && candidates.length > 0}
                    onCheckedChange={handleSelectAllCandidates}
                  />
                  <span className="text-sm font-medium">
                    Selecionar todas ({candidates.length})
                  </span>
                </div>
                {selectedCandidates.size > 0 && (
                  <Button
                    onClick={handleConvert}
                    disabled={convertMutation.isPending}
                    size="sm"
                    variant="default"
                  >
                    {convertMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Convertendo...
                      </>
                    ) : (
                      <>
                        <Layers className="mr-2 h-4 w-4" />
                        Converter Selecionadas ({selectedCandidates.size})
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
                      <TableHead>ID</TableHead>
                      <TableHead>Símbolo</TableHead>
                      <TableHead>Qty Restante</TableHead>
                      <TableHead>Qty Total</TableHead>
                      <TableHead>Porcentagem</TableHead>
                      <TableHead>Valor Atual (USD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => (
                      <TableRow key={candidate.positionId}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCandidates.has(candidate.positionId)}
                            onCheckedChange={(checked) =>
                              handleSelectCandidate(candidate.positionId, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">#{candidate.positionId}</TableCell>
                        <TableCell>{candidate.symbol}</TableCell>
                        <TableCell className="font-mono text-sm">{candidate.qtyRemaining.toFixed(8)}</TableCell>
                        <TableCell className="font-mono text-sm">{candidate.qtyTotal.toFixed(8)}</TableCell>
                        <TableCell className="font-mono text-sm">{candidate.percentage.toFixed(4)}%</TableCell>
                        <TableCell className="font-mono text-sm text-orange-600">
                          US$ {candidate.currentValueUsd.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Seção de Resíduos Existentes */}
        <div className="space-y-4 pt-6 border-t">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Resíduos Existentes</h3>
            <Button
              onClick={() => refetchDust()}
              disabled={!dustData}
              size="sm"
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>

          {dustData && (
            <div className="space-y-4">
              {dustData.groups.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={
                          dustData.groups.filter(g => g.canClose).length > 0 &&
                          selectedGroups.size === dustData.groups.filter(g => g.canClose).length
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedGroups(new Set(
                              dustData.groups.filter(g => g.canClose).map(g => `${g.exchangeAccountId}:${g.symbol}`)
                            ))
                          } else {
                            setSelectedGroups(new Set())
                          }
                        }}
                      />
                      <span className="text-sm font-medium">
                        Selecionar fecháveis ({dustData.groups.filter(g => g.canClose).length})
                      </span>
                    </div>
                    {selectedGroups.size > 0 && (
                      <Button
                        onClick={handleCloseSelected}
                        disabled={closeMutation.isPending}
                        size="sm"
                        variant="default"
                      >
                        {closeMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Fechando...
                          </>
                        ) : (
                          <>
                            <X className="mr-2 h-4 w-4" />
                            Fechar Selecionados ({selectedGroups.size})
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
                          <TableHead>Símbolo</TableHead>
                          <TableHead>Exchange</TableHead>
                          <TableHead>Qty Total</TableHead>
                          <TableHead>Valor Total (USD)</TableHead>
                          <TableHead>Posições</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dustData.groups.map((group) => {
                          const groupKey = `${group.exchangeAccountId}:${group.symbol}`
                          return (
                            <TableRow key={groupKey}>
                              <TableCell>
                                {group.canClose && (
                                  <Checkbox
                                    checked={selectedGroups.has(groupKey)}
                                    onCheckedChange={(checked) =>
                                      handleSelectGroup(groupKey, checked as boolean)
                                    }
                                  />
                                )}
                              </TableCell>
                              <TableCell className="font-medium">{group.symbol}</TableCell>
                              <TableCell>{group.exchange}</TableCell>
                              <TableCell className="font-mono text-sm">{group.totalQty.toFixed(8)}</TableCell>
                              <TableCell className="font-mono text-sm">
                                US$ {group.totalValueUsd.toFixed(2)}
                              </TableCell>
                              <TableCell>{group.positionCount}</TableCell>
                              <TableCell>
                                {group.canClose ? (
                                  <Badge className="bg-green-500">Pode Fechar</Badge>
                                ) : (
                                  <Badge variant="secondary">Aguardando</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Total: {dustData.total_count} posição(ões) resíduo
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum resíduo encontrado
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
