'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, DollarSign } from 'lucide-react'

export function SyncExecutionFees() {
    const [result, setResult] = useState<{
        total_checked: number
        updated: number
        errors: number
        error_details?: Array<{ executionId: number; error: string }>
        duration_ms?: number
    } | null>(null)

    const syncMutation = useMutation({
        mutationFn: () => adminService.syncExecutionFees(),
        onSuccess: (data) => {
            setResult(data)
            if (data.updated > 0) {
                toast.success(`Sincronização concluída: ${data.updated} execução(ões) atualizada(s) de ${data.total_checked} verificada(s)`)
            } else {
                toast.info(`Nenhuma execução precisa ser atualizada (${data.total_checked} verificada(s))`)
            }
            if (data.errors > 0) {
                toast.warning(`${data.errors} erro(s) durante a sincronização`)
            }
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao sincronizar taxas')
        },
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Sincronização de Taxas
                </CardTitle>
                <CardDescription>
                    Busca taxas de execuções existentes na API da exchange e atualiza os registros
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {result && (
                    <div className="space-y-2 p-4 bg-muted rounded-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Execuções verificadas:</span>
                            <Badge variant="outline">{result.total_checked}</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Execuções atualizadas:</span>
                            <Badge variant={result.updated > 0 ? 'default' : 'secondary'}>
                                {result.updated}
                            </Badge>
                        </div>
                        {result.errors > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-destructive">Erros:</span>
                                <Badge variant="destructive">{result.errors}</Badge>
                            </div>
                        )}
                        {result.duration_ms && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-muted-foreground">Duração:</span>
                                <Badge variant="outline">{(result.duration_ms / 1000).toFixed(2)}s</Badge>
                            </div>
                        )}
                        {result.error_details && result.error_details.length > 0 && (
                            <div className="mt-2">
                                <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="font-medium">Detalhes dos Erros:</span>
                                </div>
                                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                                    {result.error_details.slice(0, 5).map((error, idx) => (
                                        <li key={idx}>
                                            Execução #{error.executionId}: {error.error}
                                        </li>
                                    ))}
                                    {result.error_details.length > 5 && (
                                        <li className="text-muted-foreground">
                                            ... e mais {result.error_details.length - 5} erro(s)
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <Button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    variant="default"
                    className="w-full"
                >
                    {syncMutation.isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sincronizando taxas...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sincronizar Taxas
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
