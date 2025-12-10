'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { XCircle, Loader2, AlertTriangle } from 'lucide-react'
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

export function CancelAllPendingOrders() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<{
    ordersFound: number
    orders: Array<{
      id: number
      symbol: string
      side: string
      orderType: string
      status: string
      hasExchangeOrder: boolean
      exchangeOrderId: string | null
      accountId: number
      accountLabel: string
    }>
  } | null>(null)
  const [cancelResult, setCancelResult] = useState<{
    total: number
    canceledInExchange: number
    canceledInDb: number
    errors: number
    errorDetails: Array<{ orderId: number; error: string }>
  } | null>(null)

  const dryRunMutation = useMutation({
    mutationFn: () => adminService.cancelAllPendingOrders({ dryRun: true }),
    onSuccess: (data) => {
      if (data.ordersFound !== undefined && data.orders) {
        setDryRunResult({
          ordersFound: data.ordersFound,
          orders: data.orders,
        })
        setShowConfirm(true)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao verificar ordens pendentes')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => adminService.cancelAllPendingOrders({ dryRun: false }),
    onSuccess: (data) => {
      setCancelResult(data)
      setShowConfirm(false)
      setDryRunResult(null)
      toast.success(
        `Cancelamento concluído: ${data.canceledInDb} ordem(ns) cancelada(s) no banco, ${data.canceledInExchange} na exchange`
      )
      if (data.errors && data.errors > 0) {
        toast.warning(`${data.errors} erro(s) durante o cancelamento`)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao cancelar ordens')
    },
  })

  const handleDryRun = () => {
    dryRunMutation.mutate()
  }

  const handleConfirm = () => {
    cancelMutation.mutate()
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            Cancelar Ordens Pendentes
          </CardTitle>
          <CardDescription className="text-xs">
            Cancela TODAS as ordens com status PENDING ou PENDING_LIMIT em todas as contas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Atenção:</strong> Esta ação cancela TODAS as ordens pendentes de TODAS as contas.
                Use com cuidado!
              </div>
            </div>
          </div>

          {dryRunResult && !showConfirm && (
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ordens encontradas:</span>
                <Badge variant="outline">{dryRunResult.ordersFound}</Badge>
              </div>
            </div>
          )}

          {cancelResult && (
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total:</span>
                <Badge variant="outline">{cancelResult.total}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Canceladas no banco:</span>
                <Badge variant={cancelResult.canceledInDb > 0 ? 'default' : 'secondary'}>
                  {cancelResult.canceledInDb}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Canceladas na exchange:</span>
                <Badge variant={cancelResult.canceledInExchange > 0 ? 'default' : 'secondary'}>
                  {cancelResult.canceledInExchange}
                </Badge>
              </div>
              {cancelResult.errors > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Erros ({cancelResult.errors}):</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    {cancelResult.errorDetails?.slice(0, 5).map((error, idx) => (
                      <li key={idx}>
                        Job {error.orderId}: {error.error}
                      </li>
                    ))}
                    {cancelResult.errorDetails && cancelResult.errorDetails.length > 5 && (
                      <li className="text-muted-foreground">
                        ... e mais {cancelResult.errorDetails.length - 5} erro(s)
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleDryRun}
            disabled={dryRunMutation.isPending || cancelMutation.isPending}
            variant="destructive"
            className="w-full"
          >
            {dryRunMutation.isPending || cancelMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {dryRunMutation.isPending ? 'Verificando...' : 'Cancelando...'}
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Cancelar Todas Ordens Pendentes
              </>
            )}
          </Button>

          {(dryRunResult || cancelResult) && (
            <Button
              onClick={() => {
                setDryRunResult(null)
                setCancelResult(null)
                setShowConfirm(false)
              }}
              variant="outline"
              className="w-full"
            >
              Limpar Resultado
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Cancelamento</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Foram encontradas <strong>{dryRunResult?.ordersFound || 0}</strong> ordens pendentes.
                </p>
                <p className="text-destructive font-semibold">
                  Tem certeza que deseja cancelar TODAS essas ordens?
                </p>
                {dryRunResult && dryRunResult.orders.length > 0 && (
                  <div className="mt-4 max-h-60 overflow-y-auto">
                    <p className="text-sm font-medium mb-2">Ordens a serem canceladas:</p>
                    <ul className="text-xs space-y-1">
                      {dryRunResult.orders.slice(0, 10).map((order) => (
                        <li key={order.id} className="flex items-center justify-between">
                          <span>
                            Job {order.id} - {order.symbol} {order.side} ({order.orderType})
                          </span>
                          {order.hasExchangeOrder && (
                            <Badge variant="outline" className="ml-2">
                              Na Exchange
                            </Badge>
                          )}
                        </li>
                      ))}
                      {dryRunResult.orders.length > 10 && (
                        <li className="text-muted-foreground">
                          ... e mais {dryRunResult.orders.length - 10} ordem(ns)
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sim, cancelar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

