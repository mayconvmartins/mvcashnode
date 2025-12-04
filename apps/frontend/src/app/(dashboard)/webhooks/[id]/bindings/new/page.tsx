'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { accountsService } from '@/lib/api/accounts.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CreateBindingDto } from '@/lib/types'
import { useAuth } from '@/lib/hooks/useAuth'
import { adminService } from '@/lib/api/admin.service'

export default function NewBindingPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const webhookId = parseInt(params.id as string)
    const { user } = useAuth()
    
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue?.toLowerCase?.() === 'admin'
    })

    const [formData, setFormData] = useState<CreateBindingDto>({
        exchangeAccountId: 0,
        isActive: true,
        weight: 1.0,
    })

    // Buscar dados do webhook
    const { data: webhook, isLoading: isLoadingWebhook } = useQuery({
        queryKey: ['webhook', webhookId],
        queryFn: () => webhooksService.getSource(webhookId),
        enabled: !isNaN(webhookId),
    })

    // Buscar bindings existentes para filtrar contas já vinculadas
    const { data: existingBindings } = useQuery({
        queryKey: ['webhook-bindings', webhookId],
        queryFn: () => webhooksService.listBindings(webhookId),
        enabled: !isNaN(webhookId),
    })

    // Buscar todas as contas
    const { data: accounts, isLoading: isLoadingAccounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })
    
    // Se webhook é compartilhado E usuário é admin E é dono: buscar todas as contas de todos os usuários
    const canBindOtherAccounts = webhook?.is_shared && isAdmin && webhook?.is_owner !== false
    
    const { data: allUsersAccounts } = useQuery({
        queryKey: ['admin', 'all-accounts'],
        queryFn: async () => {
            // Buscar todos os usuários e suas contas
            const users = await adminService.listUsers({ limit: 1000 })
            const allAccounts: any[] = []
            
            for (const userItem of users) {
                try {
                    const userAccounts = await accountsService.list()
                    // Adicionar user_id às contas para identificação
                    const accountsWithUserId = userAccounts.map((acc: any) => ({
                        ...acc,
                        user_id: userItem.id,
                        user_email: userItem.email,
                    }))
                    allAccounts.push(...accountsWithUserId)
                } catch (error) {
                    console.error(`Erro ao buscar contas do usuário ${userItem.id}:`, error)
                }
            }
            
            return allAccounts
        },
        enabled: canBindOtherAccounts && !!webhook,
    })

    // Usar todas as contas se webhook compartilhado, senão apenas contas próprias
    const accountsToUse = canBindOtherAccounts && allUsersAccounts ? allUsersAccounts : accounts
    
    // Filtrar contas já vinculadas e que correspondem ao trade_mode do webhook
    const availableAccounts = accountsToUse?.filter((account) => {
        // Verificar se a conta já está vinculada
        const isAlreadyBound = existingBindings?.some(
            (binding) => binding.exchange_account_id === account.id
        )

        // Verificar se o trade_mode corresponde
        const accountTradeMode = account.is_simulation ? 'SIMULATION' : 'REAL'
        const matchesTradeMode = !webhook || webhook.trade_mode === accountTradeMode

        return !isAlreadyBound && matchesTradeMode && account.is_active
    })

    // Mutation para criar o binding
    const createMutation = useMutation({
        mutationFn: (data: CreateBindingDto) =>
            webhooksService.createBinding(webhookId, data),
        onSuccess: () => {
            toast.success('Binding criado com sucesso!')
            queryClient.invalidateQueries({ queryKey: ['webhook-bindings', webhookId] })
            queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
            router.push(`/webhooks/${webhookId}`)
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Erro ao criar binding')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.exchangeAccountId || formData.exchangeAccountId === 0) {
            toast.error('Selecione uma conta')
            return
        }

        if (formData.weight !== undefined && formData.weight < 0) {
            toast.error('O peso deve ser maior ou igual a zero')
            return
        }

        createMutation.mutate(formData)
    }

    if (isLoadingWebhook) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!webhook) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-2">Webhook não encontrado</h2>
                <Button onClick={() => router.push('/webhooks')} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para Webhooks
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/webhooks/${webhookId}`)}
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold">Novo Binding</h1>
                    <p className="text-muted-foreground">
                        Vincule uma conta de exchange ao webhook "{webhook.label}"
                    </p>
                </div>
            </div>

            {/* Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Informações do Binding</CardTitle>
                    <CardDescription>
                        Selecione uma conta de exchange para receber os sinais deste webhook
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Seleção de Conta */}
                        <div className="space-y-2">
                            <Label htmlFor="account">Conta de Exchange *</Label>
                            {isLoadingAccounts ? (
                                <Skeleton className="h-10 w-full" />
                            ) : (
                                <Select
                                    value={formData.exchangeAccountId?.toString() || ''}
                                    onValueChange={(value) =>
                                        setFormData({
                                            ...formData,
                                            exchangeAccountId: parseInt(value),
                                        })
                                    }
                                    required
                                >
                                    <SelectTrigger id="account">
                                        <SelectValue placeholder="Selecione uma conta" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableAccounts && availableAccounts.length > 0 ? (
                                            availableAccounts.map((account) => (
                                                <SelectItem
                                                    key={account.id}
                                                    value={account.id.toString()}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            {account.label}
                                                            {account.user_email && (
                                                                <span className="text-xs text-muted-foreground ml-2">
                                                                    ({account.user_email})
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {account.exchange} •{' '}
                                                            {account.is_simulation
                                                                ? 'Simulação'
                                                                : 'Real'}
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="none" disabled>
                                                Nenhuma conta disponível
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-sm text-muted-foreground">
                                {canBindOtherAccounts
                                    ? `Contas de todos os usuários com o mesmo modo de trade (${webhook.trade_mode}) e que ainda não estão vinculadas serão exibidas`
                                    : `Apenas suas contas com o mesmo modo de trade (${webhook.trade_mode}) e que ainda não estão vinculadas serão exibidas`}
                            </p>
                        </div>

                        {/* Peso */}
                        <div className="space-y-2">
                            <Label htmlFor="weight">Peso</Label>
                            <Input
                                id="weight"
                                type="number"
                                step="0.1"
                                min="0"
                                value={formData.weight || ''}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        weight: e.target.value
                                            ? parseFloat(e.target.value)
                                            : undefined,
                                    })
                                }
                                placeholder="1.0"
                            />
                            <p className="text-sm text-muted-foreground">
                                Peso relativo para distribuição de sinais entre múltiplas contas.
                                Padrão: 1.0
                            </p>
                        </div>

                        {/* Status Ativo */}
                        <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="isActive">Status</Label>
                                <p className="text-sm text-muted-foreground">
                                    Ativar ou desativar este binding
                                </p>
                            </div>
                            <Switch
                                id="isActive"
                                checked={formData.isActive ?? true}
                                onCheckedChange={(checked) =>
                                    setFormData({ ...formData, isActive: checked })
                                }
                            />
                        </div>

                        {/* Botões */}
                        <div className="flex gap-2 justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push(`/webhooks/${webhookId}`)}
                                disabled={createMutation.isPending}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    createMutation.isPending ||
                                    !formData.exchangeAccountId ||
                                    formData.exchangeAccountId === 0
                                }
                            >
                                {createMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Criando...
                                    </>
                                ) : (
                                    'Criar Binding'
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

