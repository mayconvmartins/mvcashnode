'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'

interface AuditResult {
    totalExecutions: number
    checkedExecutions: number
    problemsFound: number
    fixed: number
    errors: string[]
    dryRun: boolean
    duration_ms: number
    details: Array<{
        executionId: number
        executionQty: number
        fillsSum: number
        status: 'OK' | 'MISMATCH' | 'FIFO_ERROR' | 'MISSING_FILLS'
        positionsBefore: Array<{ id: number; qty_remaining: number; status: string; created_at: string }>
        positionsAfter: Array<{ id: number; qty_remaining: number; status: string }>
        correctPositions: Array<{ id: number; qty_remaining: number }>
        fixed: boolean
        error?: string
    }>
}

export function AuditFifoPositions() {
    const [hours, setHours] = useState(24)
    const [dryRun, setDryRun] = useState(true)
    const [auditResult, setAuditResult] = useState<AuditResult | null>(null)

    const auditMutation = useMutation({
        mutationFn: () => adminService.auditFifoPositions(hours, dryRun),
        retry: false,
        onSuccess: (data) => {
            setAuditResult(data)
            if (data.problemsFound > 0) {
                if (data.dryRun) {
                    toast.warning(`Auditoria concluída: ${data.problemsFound} problema(s) encontrado(s) (modo dry-run)`)
                } else {
                    toast.warning(`Auditoria concluída: ${data.problemsFound} problema(s) encontrado(s), ${data.fixed} corrigido(s)`)
                }
            } else {
                toast.success(`Auditoria concluída: Tudo correto! (${data.totalExecutions} execução(ões) verificada(s))`)
            }
            if (data.errors.length > 0) {
                toast.error(`${data.errors.length} erro(s) durante a auditoria`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao executar auditoria FIFO')
        },
    })

    const handleAudit = () => {
        auditMutation.mutate()
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'OK':
                return <Badge variant="default" className="bg-green-500">OK</Badge>
            case 'MISMATCH':
                return <Badge variant="destructive">MISMATCH</Badge>
            case 'FIFO_ERROR':
                return <Badge variant="destructive">FIFO_ERROR</Badge>
            case 'MISSING_FILLS':
                return <Badge variant="destructive">MISSING_FILLS</Badge>
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Auditoria FIFO de Posições
                </CardTitle>
                <CardDescription className="text-xs">
                    Audita vendas das últimas X horas e corrige posições que não fecharam corretamente por FIFO
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <Label htmlFor="hours" className="text-xs">Horas para buscar</Label>
                        <Input
                            id="hours"
                            type="number"
                            value={hours}
                            onChange={(e) => setHours(parseInt(e.target.value) || 24)}
                            min={1}
                            max={168}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="dryRun"
                            checked={dryRun}
                            onCheckedChange={(checked) => setDryRun(checked === true)}
                        />
                        <Label htmlFor="dryRun" className="text-xs cursor-pointer">
                            Dry-run (apenas auditoria)
                        </Label>
                    </div>
                    <Button
                        onClick={handleAudit}
                        disabled={auditMutation.isPending}
                        size="sm"
                        className="h-8"
                    >
                        {auditMutation.isPending ? (
                            <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Auditar...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Executar Auditoria
                            </>
                        )}
                    </Button>
                </div>

                {auditResult && (
                    <div className="space-y-3 mt-4">
                        <div className="grid grid-cols-4 gap-2 text-sm">
                            <div className="p-2 bg-muted rounded">
                                <div className="text-xs text-muted-foreground">Total</div>
                                <div className="font-semibold">{auditResult.totalExecutions}</div>
                            </div>
                            <div className="p-2 bg-muted rounded">
                                <div className="text-xs text-muted-foreground">Problemas</div>
                                <div className="font-semibold text-orange-600">{auditResult.problemsFound}</div>
                            </div>
                            <div className="p-2 bg-muted rounded">
                                <div className="text-xs text-muted-foreground">Corrigidos</div>
                                <div className="font-semibold text-green-600">{auditResult.fixed}</div>
                            </div>
                            <div className="p-2 bg-muted rounded">
                                <div className="text-xs text-muted-foreground">Tempo</div>
                                <div className="font-semibold">{(auditResult.duration_ms / 1000).toFixed(2)}s</div>
                            </div>
                        </div>

                        {auditResult.errors.length > 0 && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-sm">
                                <div className="font-semibold text-destructive mb-2 flex items-center gap-2">
                                    <XCircle className="h-4 w-4" />
                                    Erros ({auditResult.errors.length})
                                </div>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    {auditResult.errors.map((error, idx) => (
                                        <li key={idx}>{error}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {auditResult.details.length > 0 && (
                            <div className="border rounded">
                                <div className="p-2 bg-muted border-b text-sm font-semibold">
                                    Detalhes das Execuções
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="h-8 text-xs">Exec ID</TableHead>
                                                <TableHead className="h-8 text-xs">Status</TableHead>
                                                <TableHead className="h-8 text-xs">Qty Exec</TableHead>
                                                <TableHead className="h-8 text-xs">Qty Fills</TableHead>
                                                <TableHead className="h-8 text-xs">Posições</TableHead>
                                                <TableHead className="h-8 text-xs">Corrigido</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {auditResult.details.map((detail) => (
                                                <TableRow key={detail.executionId}>
                                                    <TableCell className="text-xs font-mono">
                                                        {detail.executionId}
                                                    </TableCell>
                                                    <TableCell>
                                                        {getStatusBadge(detail.status)}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {detail.executionQty.toFixed(8)}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {detail.fillsSum.toFixed(8)}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <div className="space-y-1">
                                                            <div>
                                                                Antes: {detail.positionsBefore.length} ({detail.positionsBefore.map(p => p.id).join(', ')})
                                                            </div>
                                                            {detail.correctPositions.length > 0 && (
                                                                <div className="text-green-600">
                                                                    Correto: {detail.correctPositions.map(p => p.id).join(', ')}
                                                                </div>
                                                            )}
                                                            {detail.positionsAfter.length > 0 && (
                                                                <div className="text-blue-600">
                                                                    Depois: {detail.positionsAfter.length} ({detail.positionsAfter.map(p => p.id).join(', ')})
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {detail.fixed ? (
                                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                        ) : detail.status !== 'OK' ? (
                                                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                                                        ) : (
                                                            <CheckCircle2 className="h-4 w-4 text-gray-400" />
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

