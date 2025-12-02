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

const depositSchema = z.object({
    asset: z.string().min(1),
    amount: z.number().positive('Quantidade deve ser positiva'),
    description: z.string().optional(),
})

type DepositFormData = z.infer<typeof depositSchema>

interface DepositModalProps {
    vaultId: number
    asset: string
    isOpen: boolean
    onClose: () => void
}

export function DepositModal({ vaultId, asset, isOpen, onClose }: DepositModalProps) {
    const queryClient = useQueryClient()

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<DepositFormData>({
        resolver: zodResolver(depositSchema),
        defaultValues: { asset },
    })

    const depositMutation = useMutation({
        mutationFn: (data: any) => vaultsService.deposit(vaultId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vault-balances', vaultId] })
            queryClient.invalidateQueries({ queryKey: ['vault-transactions', vaultId] })
            toast.success('Depósito realizado com sucesso!')
            reset()
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao realizar depósito')
        },
    })

    const onSubmit = (data: DepositFormData) => {
        depositMutation.mutate({
            asset: data.asset,
            amount: data.amount,
            description: data.description,
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Depositar no Cofre</DialogTitle>
                    <DialogDescription>Adicione saldo ao seu cofre virtual</DialogDescription>
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
                        <Input id="description" placeholder="Ex: Depósito inicial" {...register('description')} />
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="gradient" disabled={depositMutation.isPending}>
                            {depositMutation.isPending ? 'Depositando...' : 'Depositar'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

