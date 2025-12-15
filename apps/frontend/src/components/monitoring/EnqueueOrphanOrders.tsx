'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { PlayCircle, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function EnqueueOrphanOrders() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<{
    ordersFound: number
    orders: Array<{
      id: number
      symbol: string
      side: string
      orderType: string
      tradeMode: string
      limitPrice: number
      accountId: number
      accountLabel: string
      createdAt: string
    }>
  } | null>(null)
  const [enqueueResult, setEnqueueResult] = useState<{
    total: number
    enqueued: number
    alreadyEnqueued: number
    errors: number
    errorDetails: Array<{ orderId: number; error: string }>
  } | null>(null)

  const dryRunMutation = useMutation({
    mutationFn: () => adminService.enqueuePendingLimitOrders({ dryRun: true, limit: 1000 }),
    onSuccess: (data) => {
      if (data.ordersFound !== undefined && data.orders) {
        setDryRunResult({
          ordersFound: data.ordersFound,
          orders: data.orders,
        })
        
        if (data.ordersFound === 0) {
          toast.success('✅ Nenhuma ordem órfã encontrada!')
        } else {
          setShowConfirm(true)
        }
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao verificar ordens órfãs')
    },
  })

  const enqueueMutation = useMutation({
    mutationFn: () => adminService.enqueuePendingLimitOrders({ dryRun: false, limit: 1000 }),
    onSuccess: (data) => {
      setEnqueueResult({
        total: data.total || 0,
        enqueued: data.enqueued || 0,
        alreadyEnqueued: data.alreadyEnqueued || 0,
        errors: data.errors || 0,
        errorDetails: data.errorDetails || [],
      })
      setShowConfirm(false)
      setDryRunResult(null)

      if (data.enqueued && data.enqueued > 0) {
        toast.success(`✅ ${data.enqueued} ordem(ns) enfileirada(s) com sucesso!`)
      } else if (data.alreadyEnqueued && data.alreadyEnqueued > 0) {
        toast.info(`ℹ️ ${data.alreadyEnqueued} ordem(ns) já estavam enfileiradas`)
      } else {
        toast.warning('⚠️ Nenhuma ordem foi enfileirada')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao enfileirar ordens')
      setShowConfirm(false)
    },
  })

  const handleDryRun = () => {
    setEnqueueResult(null)
    dryRunMutation.mutate()
  }

  const handleConfirmEnqueue = () => {
    enqueueMutation.mutate()
  }

  const handleReset = () => {
    setDryRunResult(null)
    setEnqueueResult(null)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-blue-500" />
                Enfileirar Ordens Órfãs
              </CardTitle>
              <CardDescription className="mt-2">
                Enfileira ordens LIMIT pendentes sem executions (órfãs) para o executor processar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {enqueueResult && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Resultado do Enfileiramento</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Total Encontradas</span>
                  <span className="font-medium">{enqueueResult.total}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Enfileiradas</span>
                  <Badge variant="default" className="w-fit">
                    {enqueueResult.enqueued}
                  </Badge>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Já Enfileiradas</span>
                  <Badge variant="secondary" className="w-fit">
                    {enqueueResult.alreadyEnqueued}
                  </Badge>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Erros</span>
                  <Badge variant={enqueueResult.errors > 0 ? 'destructive' : 'outline'} className="w-fit">
                    {enqueueResult.errors}
                  </Badge>
                </div>
              </div>
              {enqueueResult.errors > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Erros ({enqueueResult.errors}):</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    {enqueueResult.errorDetails?.slice(0, 5).map((error, idx) => (
                      <li key={idx}>
                        Job {error.orderId}: {error.error}
                      </li>
                    ))}
                    {enqueueResult.errorDetails && enqueueResult.errorDetails.length > 5 && (
                      <li className="text-muted-foreground">
                        ... e mais {enqueueResult.errorDetails.length - 5} erro(s)
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleDryRun}
            disabled={dryRunMutation.isPending || enqueueMutation.isPending}
            variant="default"
            className="w-full"
          >
            {dryRunMutation.isPending || enqueueMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {dryRunMutation.isPending ? 'Verificando...' : 'Enfileirando...'}
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Enfileirar Ordens Órfãs
              </>
            )}
          </Button>

          {(dryRunResult || enqueueResult) && (
            <Button
              onClick={handleReset}
              disabled={dryRunMutation.isPending || enqueueMutation.isPending}
              variant="outline"
              className="w-full"
            >
              Limpar Resultado
            </Button>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Busca ordens LIMIT com status PENDING sem executions</p>
            <p>• Enfileira na fila BullMQ apropriada (real ou sim)</p>
            <p>• Executor processará as ordens automaticamente</p>
            <p>• Máximo de 1000 ordens por vez</p>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enfileirar Ordens Órfãs?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {dryRunResult && (
                <>
                  <div>
                    Foram encontradas <strong className="text-foreground">{dryRunResult.ordersFound}</strong> ordem(ns) LIMIT órfã(s) (sem executions).
                  </div>

                  {dryRunResult.ordersFound > 0 && (
                    <div className="rounded-md bg-muted p-3 text-sm space-y-2">
                      <div className="font-medium">Primeiras ordens:</div>
                      <ul className="space-y-1 text-xs">
                        {dryRunResult.orders.slice(0, 5).map((order) => (
                          <li key={order.id} className="font-mono">
                            #{order.id} - {order.symbol} {order.side} @ {order.limitPrice.toFixed(2)} ({order.tradeMode})
                          </li>
                        ))}
                        {dryRunResult.orders.length > 5 && (
                          <li className="text-muted-foreground">
                            ... e mais {dryRunResult.orders.length - 5} ordem(ns)
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="text-sm">
                    Essas ordens serão enfileiradas para o <strong className="text-foreground">executor</strong> processar.
                  </div>

                  <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-sm">
                    <strong className="text-blue-600 dark:text-blue-400">💡 Dica:</strong>
                    <p className="mt-1 text-muted-foreground">
                      Se estas ordens foram criadas por erro, considere usar "Cancelar Ordens Pendentes" ao invés de enfileirá-las.
                    </p>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEnqueue}>
              Confirmar Enfileiramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

