'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { accountsService } from '@/lib/api/accounts.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface BindingsManagerProps {
    webhookId: string
    bindings: any[]
}

export function BindingsManager({ webhookId, bindings }: BindingsManagerProps) {
    const queryClient = useQueryClient()
    const [selectedAccount, setSelectedAccount] = useState('')
    const [weight, setWeight] = useState('1')

    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: () => accountsService.getAll(),
    })

    const addBindingMutation = useMutation({
        mutationFn: () => webhooksService.addBinding(webhookId, {
            exchangeAccountId: parseInt(selectedAccount, 10),
            weight: parseFloat(weight),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
            toast.success('Binding adicionado!')
            setSelectedAccount('')
            setWeight('1')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao adicionar binding')
        },
    })

    const removeBindingMutation = useMutation({
        mutationFn: (bindingId: string) => webhooksService.removeBinding(webhookId, bindingId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
            toast.success('Binding removido!')
        },
        onError: () => {
            toast.error('Falha ao remover binding')
        },
    })

    const handleAddBinding = () => {
        if (!selectedAccount) {
            toast.error('Selecione uma conta')
            return
        }

        const weightNum = parseFloat(weight)
        if (isNaN(weightNum) || weightNum <= 0) {
            toast.error('Peso inválido')
            return
        }

        addBindingMutation.mutate()
    }

    const availableAccounts = accounts?.filter(
        (account: any) => !bindings.some((binding) => binding.account?.id === account.id)
    )

    return (
        <div className="space-y-4">
            {/* Current Bindings */}
            <Card>
                <CardHeader>
                    <CardTitle>Contas Vinculadas</CardTitle>
                    <CardDescription>
                        {bindings.length} conta(s) receberão sinais deste webhook
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {bindings.length > 0 ? (
                        <div className="space-y-2">
                            {bindings.map((binding) => (
                                <div
                                    key={binding.id}
                                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className="font-medium">{binding.account?.name || 'Conta'}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {binding.account?.exchange || 'N/A'}
                                            </p>
                                        </div>
                                        <Badge variant="outline">Peso: {binding.weight || 1}</Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeBindingMutation.mutate(binding.id)}
                                        disabled={removeBindingMutation.isPending}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            Nenhuma conta vinculada
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Add New Binding */}
            <Card>
                <CardHeader>
                    <CardTitle>Adicionar Conta</CardTitle>
                    <CardDescription>Vincule uma nova conta a este webhook</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="account">Conta</Label>
                            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                                <SelectTrigger id="account">
                                    <SelectValue placeholder="Selecione uma conta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableAccounts && availableAccounts.length > 0 ? (
                                        availableAccounts.map((account: any) => (
                                            <SelectItem key={account.id} value={account.id}>
                                                {account.name} ({account.exchange})
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <SelectItem value="none" disabled>
                                            Nenhuma conta disponível
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="weight">Peso</Label>
                            <Input
                                id="weight"
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={weight}
                                onChange={(e) => setWeight(e.target.value)}
                                placeholder="1"
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                Peso relativo para distribuição de sinais
                            </p>
                        </div>

                        <Button
                            onClick={handleAddBinding}
                            disabled={!selectedAccount || addBindingMutation.isPending}
                            className="w-full"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {addBindingMutation.isPending ? 'Adicionando...' : 'Adicionar Binding'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

