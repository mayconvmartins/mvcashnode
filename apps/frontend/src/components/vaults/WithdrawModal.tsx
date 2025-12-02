'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { vaultsService } from '@/lib/api/vaults.service'
import { toast } from 'sonner'

const withdrawSchema = z.object({
    asset: z.string().min(1),
    amount: z.number().positive('Quantidade deve ser positiva'),
    description: z.string().optional(),
})

type WithdrawFormData = z.infer<typeof withdrawSchema>

interface WithdrawModalProps {
    vaultId: number
    asset: string
    isOpen: boolean
    onClose: () => void
}

export function WithdrawModal({ vaultId, asset, isOpen, onClose }: WithdrawModalProps) {
    const queryClient = useQueryClient()

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<WithdrawFormData>({
        resolver: zodResolver(withdrawSchema),
        defaultValues: { asset },
    })

    const withdrawMutation = useMutation({
        mutationFn: (data: any) => vaultsService.withdraw(vaultId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vault-balances', vaultId] })
            queryClient.invalidateQueries({ queryKey: ['vault-transactions', vaultId] })
            toast.success('Saque realizado com sucesso!')
            reset()
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao realizar saque')
        },
    })

    const onSubmit = (data: WithdrawFormData) => {
        withdrawMutation.mutate({
            asset: data.asset,
            amount: data.amount,
            description: data.description,
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Sacar do Cofre</DialogTitle>
                    <DialogDescription>Retire saldo do seu cofre virtual</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="asset">Asset</Label>
                        <Input id="asset" value={asset} disabled className="font-mono" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="amount">Quantidade</Label>
                        <Input
                            id="amount"
                            type="number"
                            step="0.00000001"
                            placeholder="0.00000000"
                            {...register('amount', { valueAsNumber: true })}
                            className="font-mono"
                        />
                        {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição (Opcional)</Label>
                        <Input id="description" placeholder="Ex: Saque para trading" {...register('description')} />
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="destructive" disabled={withdrawMutation.isPending}>
                            {withdrawMutation.isPending ? 'Sacando...' : 'Sacar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

