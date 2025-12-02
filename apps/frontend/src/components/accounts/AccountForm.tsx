'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { accountsService } from '@/lib/api/accounts.service'
import type { ExchangeAccount } from '@/lib/types'
import { Exchange, TradeMode } from '@/lib/types'
import { toast } from 'sonner'

const accountSchema = z.object({
    label: z.string().min(1, 'Nome é obrigatório'),
    exchange: z.nativeEnum(Exchange),
    trade_mode: z.nativeEnum(TradeMode),
    api_key: z.string().min(1, 'API Key é obrigatória'),
    api_secret: z.string().min(1, 'API Secret é obrigatória'),
    is_testnet: z.boolean(),
    is_active: z.boolean(),
})

type AccountFormData = z.infer<typeof accountSchema>

interface AccountFormProps {
    account?: ExchangeAccount | null
    onSuccess: () => void
}

export function AccountForm({ account, onSuccess }: AccountFormProps) {
    const queryClient = useQueryClient()
    const isEditing = !!account

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<AccountFormData>({
        resolver: zodResolver(accountSchema),
        defaultValues: account
            ? {
                  label: account.label,
                  exchange: account.exchange,
                  trade_mode: account.trade_mode,
                  api_key: account.api_key_encrypted ? '••••••••' : '',
                  api_secret: '••••••••',
                  is_testnet: account.is_testnet,
                  is_active: account.is_active,
              }
            : {
                  exchange: Exchange.BINANCE_SPOT,
                  trade_mode: TradeMode.SIMULATION,
                  is_testnet: false,
                  is_active: true,
              },
    })

    const createMutation = useMutation({
        mutationFn: accountsService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Conta criada com sucesso!')
            onSuccess()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao criar conta')
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) => accountsService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Conta atualizada com sucesso!')
            onSuccess()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao atualizar conta')
        },
    })

    const onSubmit = (data: AccountFormData) => {
        const payload = {
            label: data.label,
            exchange: data.exchange,
            tradeMode: data.trade_mode,
            apiKey: data.api_key === '••••••••' ? undefined : data.api_key,
            apiSecret: data.api_secret === '••••••••' ? undefined : data.api_secret,
            isTestnet: data.is_testnet,
            isActive: data.is_active,
        }

        if (isEditing && account) {
            updateMutation.mutate({ id: account.id, data: payload })
        } else {
            createMutation.mutate(payload)
        }
    }

    const exchange = watch('exchange')
    const trade_mode = watch('trade_mode')
    const is_testnet = watch('is_testnet')
    const is_active = watch('is_active')

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="label">Nome da Conta</Label>
                    <Input
                        id="label"
                        placeholder="Ex: Binance Principal"
                        {...register('label')}
                        disabled={createMutation.isPending || updateMutation.isPending}
                    />
                    {errors.label && <p className="text-sm text-destructive">{errors.label.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="exchange">Exchange</Label>
                        <Select
                            value={exchange}
                            onValueChange={(value) => setValue('exchange', value as Exchange)}
                            disabled={isEditing || createMutation.isPending || updateMutation.isPending}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={Exchange.BINANCE_SPOT}>Binance Spot</SelectItem>
                                <SelectItem value={Exchange.BINANCE_FUTURES}>Binance Futures</SelectItem>
                                <SelectItem value={Exchange.BYBIT_SPOT}>Bybit Spot</SelectItem>
                                <SelectItem value={Exchange.BYBIT_FUTURES}>Bybit Futures</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.exchange && <p className="text-sm text-destructive">{errors.exchange.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="trade_mode">Modo de Trading</Label>
                        <Select
                            value={trade_mode}
                            onValueChange={(value) => setValue('trade_mode', value as TradeMode)}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TradeMode.REAL}>REAL</SelectItem>
                                <SelectItem value={TradeMode.SIMULATION}>SIMULATION</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.trade_mode && <p className="text-sm text-destructive">{errors.trade_mode.message}</p>}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="api_key">API Key</Label>
                    <Input
                        id="api_key"
                        type="text"
                        placeholder={isEditing ? '••••••••' : 'Sua API Key'}
                        {...register('api_key')}
                        disabled={createMutation.isPending || updateMutation.isPending}
                    />
                    {errors.api_key && <p className="text-sm text-destructive">{errors.api_key.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="api_secret">API Secret</Label>
                    <Input
                        id="api_secret"
                        type="password"
                        placeholder={isEditing ? '••••••••' : 'Seu API Secret'}
                        {...register('api_secret')}
                        disabled={createMutation.isPending || updateMutation.isPending}
                    />
                    {errors.api_secret && <p className="text-sm text-destructive">{errors.api_secret.message}</p>}
                    {isEditing && (
                        <p className="text-xs text-muted-foreground">
                            Deixe em branco para manter as credenciais atuais
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="is_testnet">Testnet</Label>
                        <p className="text-sm text-muted-foreground">Usar rede de testes da exchange</p>
                    </div>
                    <Switch
                        id="is_testnet"
                        checked={is_testnet}
                        onCheckedChange={(checked) => setValue('is_testnet', checked)}
                        disabled={isEditing || createMutation.isPending || updateMutation.isPending}
                    />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label htmlFor="is_active">Ativa</Label>
                        <p className="text-sm text-muted-foreground">Conta pode ser usada para trading</p>
                    </div>
                    <Switch
                        id="is_active"
                        checked={is_active}
                        onCheckedChange={(checked) => setValue('is_active', checked)}
                        disabled={createMutation.isPending || updateMutation.isPending}
                    />
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
                        : 'Criar Conta'}
                </Button>
            </div>
        </form>
    )
}

