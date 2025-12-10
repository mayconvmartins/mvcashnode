'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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

export function OrphanedExecutions() {
    const [orphaned, setOrphaned] = useState<OrphanedExecution[]>([])
    const [selected, setSelected] = useState<number[]>([])
    const [loading, setLoading] = useState(false)

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
            const result = await adminService.fixOrphanedExecutions(selected)
            
            if (result.failed > 0) {
                toast.warning(`Correção concluída: ${result.fixed} corrigidas, ${result.failed} falhadas`)
            } else {
                toast.success(`${result.fixed} execution(s) corrigida(s) com sucesso`)
            }
            
            setSelected([])
            await detectOrphaned() // Recarregar
        } catch (error: any) {
            toast.error(`Erro ao corrigir executions: ${error.response?.data?.message || error.message}`)
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
    )
}

