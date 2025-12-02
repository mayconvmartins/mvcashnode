'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { vaultsService } from '@/lib/api/vaults.service'
import { accountsService } from '@/lib/api/accounts.service'
import type { Vault } from '@/lib/types'
import { TradeMode } from '@/lib/types'
import { toast } from 'sonner'

const vaultSchema = z.object({
    label: z.string().min(1, 'Nome é obrigatório'),
    description: z.string().optional(),
    exchange_account_id: z.number().min(1, 'Conta é obrigatória'),
    trade_mode: z.nativeEnum(TradeMode),
})

type VaultFormData = z.infer<typeof vaultSchema>

interface VaultFormProps {
    vault?: Vault | null
    onSuccess: () => void
}

export function VaultForm({ vault, onSuccess }: VaultFormProps) {
    const queryClient = useQueryClient()
    const isEditing = !!vault

    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: async () => {
            const response = await accountsService.list()
            return response.data
        },
    })

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<VaultFormData>({
        resolver: zodResolver(vaultSchema),
        defaultValues: vault || {
            trade_mode: TradeMode.SIMULATION,
        },
    })

    const createMutation = useMutation({
        mutationFn: vaultsService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vaults'] })
            toast.success('Cofre criado com sucesso!')
            onSuccess()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao criar cofre')
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) => vaultsService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vaults'] })
            toast.success('Cofre atualizado com sucesso!')
            onSuccess()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao atualizar cofre')
        },
    })

    const onSubmit = (data: VaultFormData) => {
        const payload = {
            label: data.label,
            description: data.description,
            exchangeAccountId: data.exchange_account_id,
            tradeMode: data.trade_mode,
        }

        if (isEditing && vault) {
            updateMutation.mutate({ id: vault.id, data: payload })
        } else {
            createMutation.mutate(payload)
        }
    }

    const trade_mode = watch('trade_mode')
    const exchange_account_id = watch('exchange_account_id')

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="label">Nome do Cofre</Label>
                    <Input id="label" placeholder="Ex: Cofre Principal" {...register('label')} />
                    {errors.label && <p className="text-sm text-destructive">{errors.label.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Descrição (Opcional)</Label>
                    <Input id="description" placeholder="Descrição do cofre" {...register('description')} />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="exchange_account_id">Conta de Exchange</Label>
                    <Select
                        value={exchange_account_id?.toString()}
                        onValueChange={(value) => setValue('exchange_account_id', parseInt(value))}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione uma conta" />
                        </SelectTrigger>
                        <SelectContent>
                            {accounts?.map((account) => (
                                <SelectItem key={account.id} value={account.id.toString()}>
                                    {account.label} - {account.exchange}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.exchange_account_id && (
                        <p className="text-sm text-destructive">{errors.exchange_account_id.message}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="trade_mode">Modo de Trading</Label>
                    <Select value={trade_mode} onValueChange={(value) => setValue('trade_mode', value as TradeMode)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={TradeMode.REAL}>REAL</SelectItem>
                            <SelectItem value={TradeMode.SIMULATION}>SIMULATION</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onSuccess}>
                    Cancelar
                </Button>
                <Button type="submit" variant="gradient" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending
                        ? 'Salvando...'
                        : isEditing
                        ? 'Atualizar'
                        : 'Criar Cofre'}
                </Button>
            </div>
        </form>
    )
}

