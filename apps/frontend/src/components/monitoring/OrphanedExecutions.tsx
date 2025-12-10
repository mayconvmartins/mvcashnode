'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RefreshCw, CheckCircle2, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { adminService } from '@/lib/api/admin.service'

interface OrphanedExecution {
    jobId: number
    executionId: number
    symbol: string
    qty: number
    price: number
    value: number
    positionId: number | null
    positionStatus: string
    positionQtyRemaining: number
    reason: string
    createdAt: string
}

interface AlternativePosition {
    id: number
    symbol: string
    qty_remaining: number
    qty_total: number
    price_open: number
    created_at: string
}

interface JobNeedingAlternative {
    jobId: number
    symbol: string
    executedQty: number
    originalPosition: {
        id: number
        symbol: string
        status: string
        qty_remaining: number
    } | null
    alternatives: AlternativePosition[]
}

export function OrphanedExecutions() {
    const [orphaned, setOrphaned] = useState<OrphanedExecution[]>([])
    const [selected, setSelected] = useState<number[]>([])
    const [loading, setLoading] = useState(false)
    const [showAlternativesModal, setShowAlternativesModal] = useState(false)
    const [jobsNeedingAlternatives, setJobsNeedingAlternatives] = useState<JobNeedingAlternative[]>([])
    const [selectedAlternatives, setSelectedAlternatives] = useState<Record<number, number>>({})

    const detectOrphaned = async () => {
        try {
            setLoading(true)
            const data = await adminService.detectOrphanedExecutions()
            setOrphaned(data)
            if (data.length > 0) {
                toast.warning(`${data.length} execution(s) órfã(s) encontrada(s)`)
            } else {
                toast.success('Nenhuma execution órfã encontrada')
            }
        } catch (error: any) {
            toast.error(`Erro ao buscar executions órfãs: ${error.response?.data?.message || error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const fixSelected = async () => {
        if (selected.length === 0) return

        const confirmed = confirm(
            `Corrigir ${selected.length} execution(s) órfã(s)?\n\n` +
            'Isso irá vincular as executions às posições, fechando-as retroativamente e recalculando os lucros.'
        )
        
        if (!confirmed) return

        try {
            setLoading(true)
            // 1ª tentativa: correção automática (sem alternativas)
            const result = await adminService.fixOrphanedExecutions(selected)
            
            // Se alguns precisam de alternativa
            if (result.needsAlternative && result.needsAlternative.length > 0) {
                toast.info(`${result.fixed} corrigidas, ${result.needsAlternative.length} precisam de posições alternativas`)
                
                // Buscar alternativas para cada job
                const jobsWithAlternatives: JobNeedingAlternative[] = []
                for (const need of result.needsAlternative) {
                    try {
                        const alternatives = await adminService.getAlternativePositions(need.jobId)
                        if (alternatives.needsAlternative && alternatives.alternatives.length > 0) {
                            jobsWithAlternatives.push(alternatives)
                        }
                    } catch (error) {
                        console.error(`Erro ao buscar alternativas para job ${need.jobId}:`, error)
                    }
                }
                
                if (jobsWithAlternatives.length > 0) {
                    setJobsNeedingAlternatives(jobsWithAlternatives)
                    setShowAlternativesModal(true)
                } else {
                    toast.warning('Não há posições alternativas disponíveis para os jobs que falharam')
                }
            } else if (result.failed > 0) {
                toast.warning(`Correção concluída: ${result.fixed} corrigidas, ${result.failed} falhadas`)
            } else {
                toast.success(`${result.fixed} execution(s) corrigida(s) com sucesso`)
            }
            
            if (result.fixed > 0) {
                setSelected([])
                await detectOrphaned() // Recarregar
            }
        } catch (error: any) {
            toast.error(`Erro ao corrigir executions: ${error.response?.data?.message || error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const fixWithAlternatives = async () => {
        if (Object.keys(selectedAlternatives).length === 0) {
            toast.error('Selecione posições alternativas para todos os jobs')
            return
        }

        const alternativePositions = Object.entries(selectedAlternatives).map(([jobId, positionId]) => ({
            jobId: parseInt(jobId),
            positionId: positionId,
        }))

        try {
            setLoading(true)
            const result = await adminService.fixOrphanedExecutions(
                jobsNeedingAlternatives.map(j => j.jobId),
                alternativePositions
            )
            
            if (result.failed > 0) {
                toast.warning(`${result.fixed} corrigidas com alternativas, ${result.failed} falhadas`)
            } else {
                toast.success(`${result.fixed} execution(s) corrigida(s) com posições alternativas`)
            }
            
            setShowAlternativesModal(false)
            setJobsNeedingAlternatives([])
            setSelectedAlternatives({})
            setSelected([])
            await detectOrphaned() // Recarregar
        } catch (error: any) {
            toast.error(`Erro ao corrigir com alternativas: ${error.response?.data?.message || error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const toggleAll = () => {
        if (selected.length === orphaned.length) {
            setSelected([])
        } else {
            setSelected(orphaned.map(item => item.jobId))
        }
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        Executions Órfãs
                    </CardTitle>
                    <CardDescription>
                        Vendas executadas na exchange mas não vinculadas às posições
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button onClick={detectOrphaned} disabled={loading} className="w-full">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Detectando...' : 'Detectar Inconsistências'}
                    </Button>

                    {orphaned.length > 0 && (
                        <>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    {orphaned.length} execution(s) órfã(s) encontrada(s)
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleAll}
                                >
                                    {selected.length === orphaned.length ? 'Desmarcar' : 'Marcar'} Todos
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {orphaned.map((item) => (
                                    <div key={item.jobId} className="flex items-start gap-3 p-3 border rounded hover:bg-accent/50">
                                        <Checkbox
                                            checked={selected.includes(item.jobId)}
                                            onCheckedChange={(checked) => {
                                                setSelected(prev =>
                                                    checked
                                                        ? [...prev, item.jobId]
                                                        : prev.filter(id => id !== item.jobId)
                                                )
                                            }}
                                        />
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium">
                                                    Job #{item.jobId} - {item.symbol}
                                                </div>
                                                <Badge variant="destructive" className="ml-2">
                                                    Órfã
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Execution #{item.executionId} | Qty: {item.qty.toFixed(4)} | Preço: ${item.price.toFixed(2)} | Total: ${item.value.toFixed(2)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Posição: #{item.positionId || 'N/A'} ({item.positionStatus}) | Qty Restante: {item.positionQtyRemaining.toFixed(4)}
                                            </div>
                                            <div className="text-xs text-orange-600 mt-1">
                                                {item.reason}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(item.createdAt).toLocaleString('pt-BR')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {selected.length > 0 && (
                                <Button 
                                    onClick={fixSelected} 
                                    disabled={loading} 
                                    className="w-full"
                                    variant="default"
                                >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Corrigir {selected.length} Selecionada(s)
                                </Button>
                            )}
                        </>
                    )}

                    {orphaned.length === 0 && !loading && (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            Nenhuma execution órfã encontrada. Clique em "Detectar Inconsistências" para verificar.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modal de Seleção de Posições Alternativas */}
            <Dialog open={showAlternativesModal} onOpenChange={setShowAlternativesModal}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Selecionar Posições Alternativas</DialogTitle>
                        <DialogDescription>
                            As posições originais já foram fechadas. Selecione posições alternativas do mesmo símbolo para vincular as executions.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        {jobsNeedingAlternatives.map((job) => (
                            <div key={job.jobId} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="font-semibold">
                                            Job #{job.jobId} - {job.symbol}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Quantidade executada: {job.executedQty.toFixed(4)}
                                        </div>
                                        {job.originalPosition && (
                                            <div className="text-sm text-red-600">
                                                Posição original #{job.originalPosition.id}: {job.originalPosition.status} ❌
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {job.alternatives.length > 0 ? (
                                    <div className="space-y-2">
                                        <Label>Selecione posição alternativa:</Label>
                                        <RadioGroup
                                            value={selectedAlternatives[job.jobId]?.toString() || ''}
                                            onValueChange={(value) => {
                                                setSelectedAlternatives(prev => ({
                                                    ...prev,
                                                    [job.jobId]: parseInt(value),
                                                }))
                                            }}
                                        >
                                            {job.alternatives.map((alt) => (
                                                <div key={alt.id} className="flex items-center space-x-2 border rounded p-3 hover:bg-accent/50">
                                                    <RadioGroupItem value={alt.id.toString()} id={`alt-${job.jobId}-${alt.id}`} />
                                                    <Label 
                                                        htmlFor={`alt-${job.jobId}-${alt.id}`}
                                                        className="flex-1 cursor-pointer"
                                                    >
                                                        <div className="font-medium">
                                                            Posição #{alt.id} - {alt.symbol}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            Restante: {alt.qty_remaining.toFixed(4)} | Total: {alt.qty_total.toFixed(4)} | Preço abertura: ${alt.price_open.toFixed(2)}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {new Date(alt.created_at).toLocaleString('pt-BR')}
                                                        </div>
                                                    </Label>
                                                </div>
                                            ))}
                                        </RadioGroup>
                                    </div>
                                ) : (
                                    <div className="text-sm text-destructive">
                                        Nenhuma posição alternativa disponível para este símbolo
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowAlternativesModal(false)
                                setSelectedAlternatives({})
                            }}
                        >
                            <X className="h-4 w-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button 
                            onClick={fixWithAlternatives}
                            disabled={loading || Object.keys(selectedAlternatives).length !== jobsNeedingAlternatives.length}
                        >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Confirmar Correção
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
