'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { positionsService } from '@/lib/api/positions.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { AlertTriangle, RefreshCw, Loader2, RotateCcw, Search } from 'lucide-react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

export function SuspiciousSellExecutions() {
    const [days, setDays] = useState(7)
    const [selectedExecutions, setSelectedExecutions] = useState<Set<number>>(new Set())
    const [revertDialogOpen, setRevertDialogOpen] = useState(false)
    const [executionToRevert, setExecutionToRevert] = useState<number | null>(null)
    const [shouldReprocess, setShouldReprocess] = useState(false)

    const { data: suspiciousData, refetch: refetchSuspicious } = useQuery({
        queryKey: ['suspicious-sells', days],
        queryFn: () => positionsService.findSuspiciousSells(days),
        enabled: false, // Só busca quando solicitado
    })

    const identifyMutation = useMutation({
        mutationFn: () => positionsService.findSuspiciousSells(days),
        onSuccess: (data) => {
            if (data.count > 0) {
                toast.warning(`Encontradas ${data.count} execução(ões) suspeita(s)`)
            } else {
                toast.info('Nenhuma execução suspeita encontrada')
            }
            refetchSuspicious()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao identificar execuções suspeitas')
        },
    })

    const revertMutation = useMutation({
        mutationFn: ({ executionId, reprocess }: { executionId: number; reprocess: boolean }) =>
            positionsService.revertSellExecution(executionId, reprocess),
        onSuccess: (data) => {
            if (data.success) {
                toast.success(data.message)
                if (data.reprocessed) {
                    toast.info('Execução reprocessada com lógica corrigida')
                }
                setRevertDialogOpen(false)
                setExecutionToRevert(null)
                refetchSuspicious()
            } else {
                toast.error(data.message)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao reverter execução')
        },
    })

    const handleIdentify = () => {
        identifyMutation.mutate()
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked && suspiciousData) {
            setSelectedExecutions(new Set(suspiciousData.executions.map(e => e.executionId)))
        } else {
            setSelectedExecutions(new Set())
        }
    }

    const handleSelectExecution = (executionId: number, checked: boolean) => {
        const newSelected = new Set(selectedExecutions)
        if (checked) {
            newSelected.add(executionId)
        } else {
            newSelected.delete(executionId)
        }
        setSelectedExecutions(newSelected)
    }

    const handleRevert = (executionId: number) => {
        if (typeof executionId === 'number' && !isNaN(executionId) && executionId > 0) {
            setExecutionToRevert(executionId)
            setRevertDialogOpen(true)
        } else {
            toast.error('ID de execução inválido')
        }
    }

    const confirmRevert = () => {
        if (executionToRevert !== null && typeof executionToRevert === 'number' && !isNaN(executionToRevert)) {
            revertMutation.mutate({
                executionId: executionToRevert,
                reprocess: shouldReprocess,
            })
        } else {
            toast.error('ID de execução inválido')
        }
    }

    return (
        <>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Execuções Suspeitas
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Identifica e corrige execuções que fecharam múltiplas posições incorretamente
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <Label htmlFor="days" className="text-xs">Dias para buscar</Label>
                            <Input
                                id="days"
                                type="number"
                                value={days}
                                onChange={(e) => setDays(parseInt(e.target.value) || 7)}
                                min={1}
                                max={30}
                                className="h-8 text-sm"
                            />
                        </div>
                        <Button
                            onClick={handleIdentify}
                            disabled={identifyMutation.isPending}
                            size="sm"
                            className="h-8"
                        >
                            {identifyMutation.isPending ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Buscando...
                                </>
                            ) : (
                                <>
                                    <Search className="h-3 w-3 mr-1" />
                                    Identificar
                                </>
                            )}
                        </Button>
                    </div>

                    {suspiciousData && suspiciousData.count > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                    {suspiciousData.count} execução(ões) encontrada(s)
                                </span>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={selectedExecutions.size === suspiciousData.executions.length && suspiciousData.executions.length > 0}
                                        onCheckedChange={handleSelectAll}
                                    />
                                    <span className="text-xs">Selecionar todas</span>
                                </div>
                            </div>

                            <div className="border rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="h-8">
                                            <TableHead className="w-10"></TableHead>
                                            <TableHead className="text-xs">Execução</TableHead>
                                            <TableHead className="text-xs">Símbolo</TableHead>
                                            <TableHead className="text-xs">Qty</TableHead>
                                            <TableHead className="text-xs">Posições</TableHead>
                                            <TableHead className="text-xs">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suspiciousData.executions.map((execution) => (
                                            <TableRow key={execution.executionId} className="h-8">
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedExecutions.has(execution.executionId)}
                                                        onCheckedChange={(checked) =>
                                                            handleSelectExecution(execution.executionId, checked as boolean)
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    #{execution.executionId}
                                                </TableCell>
                                                <TableCell className="text-xs">{execution.symbol}</TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {execution.executedQty.toFixed(8)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="destructive" className="text-xs">
                                                        {execution.positionsAffected}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        onClick={() => handleRevert(execution.executionId)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-xs px-2"
                                                    >
                                                        <RotateCcw className="h-3 w-3 mr-1" />
                                                        Reverter
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {suspiciousData && suspiciousData.count === 0 && (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                            Nenhuma execução suspeita encontrada
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reverter Execução</DialogTitle>
                        <DialogDescription>
                            Esta ação irá reverter a execução #{executionToRevert} e corrigir as posições fechadas incorretamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="reprocess"
                                checked={shouldReprocess}
                                onCheckedChange={(checked) => setShouldReprocess(checked as boolean)}
                            />
                            <Label htmlFor="reprocess" className="text-sm cursor-pointer">
                                Reprocessar automaticamente com lógica corrigida
                            </Label>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                            <p>• Remove os fills de SELL da execução</p>
                            <p>• Adiciona de volta a quantidade vendida ao qty_remaining</p>
                            <p>• Remove o PnL realizado desta venda</p>
                            <p>• Remove as taxas pagas nesta venda</p>
                            <p>• Reabre posições que foram fechadas incorretamente</p>
                            {shouldReprocess && (
                                <p className="text-primary">• Reprocessa usando a nova lógica (busca quantidade exata primeiro)</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRevertDialogOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={confirmRevert}
                            disabled={revertMutation.isPending}
                        >
                            {revertMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Revertendo...
                                </>
                            ) : (
                                <>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Reverter
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

