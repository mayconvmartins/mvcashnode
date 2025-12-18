'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Save, DollarSign, TrendingUp, TrendingDown, AlertTriangle, Zap, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { adminService } from '@/lib/api/admin.service'
import { toast } from 'sonner'

export default function SubscriberDefaultParametersPage() {
    const queryClient = useQueryClient()
    
    // Estado do formulário
    const [formData, setFormData] = useState({
        min_quote_amount: 20,
        max_quote_amount: null as number | null,
        default_quote_amount: 100,
        allowed_symbols: '' as string,
        default_sl_enabled: false,
        default_sl_pct: null as number | null,
        default_tp_enabled: false,
        default_tp_pct: null as number | null,
        default_sg_enabled: false,
        default_sg_pct: null as number | null,
        default_sg_drop_pct: null as number | null,
        default_tsg_enabled: false,
        default_tsg_activation_pct: null as number | null,
        default_tsg_drop_pct: null as number | null,
        min_profit_pct: null as number | null,
        lock_webhook_on_tsg: true,
    })

    // Buscar dados
    const { data, isLoading } = useQuery({
        queryKey: ['admin', 'subscriber-default-parameters'],
        queryFn: adminService.getSubscriberDefaultParameters,
    })

    // Atualizar formulário quando dados chegarem
    useEffect(() => {
        if (data) {
            setFormData({
                min_quote_amount: data.min_quote_amount ?? 20,
                max_quote_amount: data.max_quote_amount,
                default_quote_amount: data.default_quote_amount ?? 100,
                allowed_symbols: data.allowed_symbols || '',
                default_sl_enabled: data.default_sl_enabled ?? false,
                default_sl_pct: data.default_sl_pct,
                default_tp_enabled: data.default_tp_enabled ?? false,
                default_tp_pct: data.default_tp_pct,
                default_sg_enabled: data.default_sg_enabled ?? false,
                default_sg_pct: data.default_sg_pct,
                default_sg_drop_pct: data.default_sg_drop_pct,
                default_tsg_enabled: data.default_tsg_enabled ?? false,
                default_tsg_activation_pct: data.default_tsg_activation_pct,
                default_tsg_drop_pct: data.default_tsg_drop_pct,
                min_profit_pct: data.min_profit_pct,
                lock_webhook_on_tsg: data.lock_webhook_on_tsg ?? true,
            })
        }
    }, [data])

    // Mutation para salvar
    const updateMutation = useMutation({
        mutationFn: adminService.updateSubscriberDefaultParameters,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'subscriber-default-parameters'] })
            toast.success('Parâmetros padrão atualizados com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar parâmetros')
        },
    })
    
    // Mutation para sincronizar assinantes
    const syncMutation = useMutation({
        mutationFn: adminService.syncSubscribers,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'subscribers'] })
            toast.success(`Sincronização concluída! ${result.synced_webhooks} webhooks e ${result.synced_parameters} parâmetros criados.`)
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao sincronizar assinantes')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        updateMutation.mutate(formData)
    }

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-10 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Settings2 className="h-6 w-6" />
                        Parâmetros Padrão de Assinantes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Configure os valores padrão e limites aplicados a todos os assinantes
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        onClick={() => syncMutation.mutate()} 
                        disabled={syncMutation.isPending}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                        {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Assinantes'}
                    </Button>
                    <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                    </Button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Card: Limites de Valor */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-green-500" />
                                Limites de Valor da Ordem
                            </CardTitle>
                            <CardDescription>
                                Define os valores mínimo, máximo e padrão para ordens de assinantes
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="min_quote_amount">Valor Mínimo (USD)</Label>
                                    <Input
                                        id="min_quote_amount"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={formData.min_quote_amount}
                                        onChange={(e) => setFormData({ ...formData, min_quote_amount: parseFloat(e.target.value) || 20 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="max_quote_amount">Valor Máximo (USD)</Label>
                                    <Input
                                        id="max_quote_amount"
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder="Sem limite"
                                        value={formData.max_quote_amount ?? ''}
                                        onChange={(e) => setFormData({ ...formData, max_quote_amount: e.target.value ? parseFloat(e.target.value) : null })}
                                    />
                                    <p className="text-xs text-muted-foreground">Deixe vazio para sem limite</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="default_quote_amount">Valor Padrão (USD)</Label>
                                <Input
                                    id="default_quote_amount"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={formData.default_quote_amount}
                                    onChange={(e) => setFormData({ ...formData, default_quote_amount: parseFloat(e.target.value) || 100 })}
                                />
                                <p className="text-xs text-muted-foreground">Valor usado quando o assinante não configurar</p>
                            </div>
                            <Separator className="my-4" />
                            <div className="space-y-2">
                                <Label htmlFor="allowed_symbols">Símbolos Permitidos</Label>
                                <Input
                                    id="allowed_symbols"
                                    type="text"
                                    placeholder="BTCUSDT,SOLUSDT,BNBUSDT,ETHUSDT"
                                    value={formData.allowed_symbols}
                                    onChange={(e) => setFormData({ ...formData, allowed_symbols: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Lista de pares de trading permitidos para assinantes (separados por vírgula). 
                                    Deixe vazio para permitir todos os símbolos.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Card: Configurações Gerais */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings2 className="h-5 w-5 text-blue-500" />
                                Configurações Gerais
                            </CardTitle>
                            <CardDescription>
                                Outras configurações aplicadas a todos assinantes
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Bloquear Webhook quando TSG Ativo</Label>
                                    <p className="text-xs text-muted-foreground">Impede vendas por webhook quando TSG está habilitado</p>
                                </div>
                                <Switch
                                    checked={formData.lock_webhook_on_tsg}
                                    onCheckedChange={(checked) => setFormData({ ...formData, lock_webhook_on_tsg: checked })}
                                />
                            </div>
                            <Separator />
                            <div className="space-y-2">
                                <Label htmlFor="min_profit_pct">Lucro Mínimo (%)</Label>
                                <Input
                                    id="min_profit_pct"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="Não definido"
                                    value={formData.min_profit_pct ?? ''}
                                    onChange={(e) => setFormData({ ...formData, min_profit_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                />
                                <p className="text-xs text-muted-foreground">Lucro mínimo antes de permitir venda</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* SL/TP/SG/TSG */}
                <Card>
                    <CardHeader>
                        <CardTitle>Parâmetros de SL/TP/SG/TSG Padrão</CardTitle>
                        <CardDescription>
                            Valores padrão aplicados automaticamente às posições de assinantes
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Stop Loss */}
                            <div className="space-y-4 p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <TrendingDown className="h-4 w-4 text-red-500" />
                                        <Label>Stop Loss (SL)</Label>
                                    </div>
                                    <Switch
                                        checked={formData.default_sl_enabled}
                                        onCheckedChange={(checked) => setFormData({ ...formData, default_sl_enabled: checked })}
                                    />
                                </div>
                                {formData.default_sl_enabled && (
                                    <div className="space-y-2">
                                        <Label htmlFor="default_sl_pct">Porcentagem (%)</Label>
                                        <Input
                                            id="default_sl_pct"
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            value={formData.default_sl_pct ?? ''}
                                            onChange={(e) => setFormData({ ...formData, default_sl_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Take Profit */}
                            <div className="space-y-4 p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-green-500" />
                                        <Label>Take Profit (TP)</Label>
                                    </div>
                                    <Switch
                                        checked={formData.default_tp_enabled}
                                        onCheckedChange={(checked) => setFormData({ ...formData, default_tp_enabled: checked })}
                                    />
                                </div>
                                {formData.default_tp_enabled && (
                                    <div className="space-y-2">
                                        <Label htmlFor="default_tp_pct">Porcentagem (%)</Label>
                                        <Input
                                            id="default_tp_pct"
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            value={formData.default_tp_pct ?? ''}
                                            onChange={(e) => setFormData({ ...formData, default_tp_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Stop Gain */}
                            <div className="space-y-4 p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                        <Label>Stop Gain (SG)</Label>
                                    </div>
                                    <Switch
                                        checked={formData.default_sg_enabled}
                                        onCheckedChange={(checked) => setFormData({ ...formData, default_sg_enabled: checked })}
                                    />
                                </div>
                                {formData.default_sg_enabled && (
                                    <div className="space-y-2">
                                        <div>
                                            <Label htmlFor="default_sg_pct">Ativação (%)</Label>
                                            <Input
                                                id="default_sg_pct"
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                value={formData.default_sg_pct ?? ''}
                                                onChange={(e) => setFormData({ ...formData, default_sg_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="default_sg_drop_pct">Queda (%)</Label>
                                            <Input
                                                id="default_sg_drop_pct"
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                value={formData.default_sg_drop_pct ?? ''}
                                                onChange={(e) => setFormData({ ...formData, default_sg_drop_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Trailing Stop Gain */}
                            <div className="space-y-4 p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-purple-500" />
                                        <Label>Trailing SG (TSG)</Label>
                                    </div>
                                    <Switch
                                        checked={formData.default_tsg_enabled}
                                        onCheckedChange={(checked) => {
                                            setFormData({ 
                                                ...formData, 
                                                default_tsg_enabled: checked,
                                                // TSG + TP podem coexistir, apenas SG é desativado
                                                default_sg_enabled: checked ? false : formData.default_sg_enabled,
                                                default_sg_pct: checked ? null : formData.default_sg_pct,
                                                default_sg_drop_pct: checked ? null : formData.default_sg_drop_pct,
                                            })
                                        }}
                                    />
                                </div>
                                {formData.default_tsg_enabled && formData.default_tp_enabled && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400">
                                        💡 TP + TSG ativos: O primeiro a atingir aciona a venda. TP funciona como &quot;lucro máximo garantido&quot;.
                                    </p>
                                )}
                                {formData.default_tsg_enabled && (
                                    <div className="space-y-2">
                                        <div>
                                            <Label htmlFor="default_tsg_activation_pct">Ativação (%)</Label>
                                            <Input
                                                id="default_tsg_activation_pct"
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                value={formData.default_tsg_activation_pct ?? ''}
                                                onChange={(e) => setFormData({ ...formData, default_tsg_activation_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="default_tsg_drop_pct">Queda (%)</Label>
                                            <Input
                                                id="default_tsg_drop_pct"
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                value={formData.default_tsg_drop_pct ?? ''}
                                                onChange={(e) => setFormData({ ...formData, default_tsg_drop_pct: e.target.value ? parseFloat(e.target.value) : null })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Botão Salvar */}
                <div className="flex justify-end">
                    <Button type="submit" disabled={updateMutation.isPending} size="lg">
                        <Save className="h-4 w-4 mr-2" />
                        {updateMutation.isPending ? 'Salvando...' : 'Salvar Todas as Alterações'}
                    </Button>
                </div>
            </form>
        </div>
    )
}

