'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { limitOrdersService } from '@/lib/api/limit-orders.service'
import { Button } from '@/components/ui/button'
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
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface CancelOrderButtonProps {
    orderId: number
    symbol: string
    size?: 'default' | 'sm' | 'lg' | 'icon'
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
    onSuccess?: () => void
}

export function CancelOrderButton({
    orderId,
    symbol,
    size = 'sm',
    variant = 'destructive',
    onSuccess,
}: CancelOrderButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const queryClient = useQueryClient()

    const cancelMutation = useMutation({
        mutationFn: () => limitOrdersService.cancel(orderId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['limit-orders'] })
            queryClient.invalidateQueries({ queryKey: ['limit-order', orderId] })
            toast.success('Ordem cancelada com sucesso!')
            setIsOpen(false)
            onSuccess?.()
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao cancelar ordem')
        },
    })

    return (
        <>
            <Button
                size={size}
                variant={variant}
                onClick={() => setIsOpen(true)}
                disabled={cancelMutation.isPending}
            >
                {cancelMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <>
                        <X className="h-4 w-4 mr-2" />
                        Cancelar
                    </>
                )}
            </Button>

            <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar Ordem Limitada</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja cancelar a ordem limitada para <strong>{symbol}</strong>?
                            <br />
                            <br />
                            Esta ação não pode ser desfeita. A ordem será removida da exchange e não será mais executada.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={cancelMutation.isPending}>
                            Voltar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                cancelMutation.mutate()
                            }}
                            disabled={cancelMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {cancelMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Cancelar Ordem
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
