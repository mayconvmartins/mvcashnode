'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { monitoringService } from '@/lib/api/monitoring.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

export function CleanupOrphanedPositions() {
    const [result, setResult] = useState<{
        checked: number
        deleted: number
        errors: string[]
    } | null>(null)

    const cleanupMutation = useMutation({
        mutationFn: () => monitoringService.cleanupOrphanedPositions(),
        onSuccess: (data) => {
            setResult(data)
            if (data.deleted > 0) {
                toast.success(`Limpeza concluída: ${data.deleted} posição(ões) órfã(s) deletada(s)`)
            } else {
                toast.info('Nenhuma posição órfã encontrada')
            }
            if (data.errors && data.errors.length > 0) {
                toast.warning(`${data.errors.length} erro(s) durante a limpeza`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao executar limpeza')
        },
    })

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Limpeza de Posições Órfãs
                </CardTitle>
                <CardDescription className="text-xs">
                    Remove posições que foram agrupadas mas não foram deletadas corretamente
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {result && (
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Posições verificadas:</span>
                            <Badge variant="outline">{result.checked}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Posições deletadas:</span>
                            <Badge variant={result.deleted > 0 ? 'default' : 'secondary'}>
                                {result.deleted}
                            </Badge>
                        </div>
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

                <Button
                    onClick={() => cleanupMutation.mutate()}
                    disabled={cleanupMutation.isPending}
                    variant="default"
                    className="w-full"
                >
                    {cleanupMutation.isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Executando limpeza...
                        </>
                    ) : (
                        <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Executar Limpeza
                        </>
                    )}
                </Button>

                {result && (
                    <Button
                        onClick={() => setResult(null)}
                        variant="outline"
                        className="w-full"
                    >
                        Limpar Resultado
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
