'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { webhookMonitorService, type WebhookMonitorConfig } from '@/lib/api/webhook-monitor.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

export function WebhookMonitorConfigForm() {
    const queryClient = useQueryClient()
    const { data: config, isLoading } = useQuery({
        queryKey: ['webhook-monitor-config'],
        queryFn: webhookMonitorService.getConfig,
    })

    const [formData, setFormData] = useState<Partial<WebhookMonitorConfig>>({
        monitor_enabled: true,
        check_interval_sec: 30,
        // BUY
        lateral_tolerance_pct: 0.3,
        lateral_cycles_min: 4,
        lateral_cycles_enabled: true,
        rise_trigger_pct: 0.75,
        rise_cycles_min: 2,
        rise_cycles_enabled: true,
        max_fall_pct: 6.0,
        max_fall_enabled: false,
        max_monitoring_time_min: 60,
        max_monitoring_time_enabled: false,
        cooldown_after_execution_min: 30,
        // SELL
        sell_lateral_tolerance_pct: 0.3,
        sell_lateral_cycles_min: 4,
        sell_lateral_cycles_enabled: true,
        sell_fall_trigger_pct: 0.5,
        sell_fall_cycles_min: 2,
        sell_fall_cycles_enabled: true,
        sell_max_monitoring_time_min: 60,
        sell_max_monitoring_time_enabled: false,
        sell_cooldown_after_execution_min: 30,
    })

    // Atualizar formData quando config for carregado
    useEffect(() => {
        if (config) {
            setFormData(config)
        }
    }, [config])

    const updateMutation = useMutation({
        mutationFn: webhookMonitorService.updateConfig,
        onSuccess: async (data) => {
            // Atualizar formData com a resposta do servidor para garantir sincronização
            setFormData(data)
            // Invalidar e refetch para garantir que os dados estão atualizados
            await queryClient.invalidateQueries({ queryKey: ['webhook-monitor-config'] })
            await queryClient.refetchQueries({ queryKey: ['webhook-monitor-config'] })
            toast.success('Configurações globais atualizadas com sucesso!')
        },
        onError: (error: any) => {
            console.error('Erro ao atualizar configurações:', error)
            toast.error(error.response?.data?.message || 'Falha ao atualizar configurações')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        // Garantir que todos os campos estão presentes e são válidos
        const dataToSend: Partial<WebhookMonitorConfig> = {}
        
        // Apenas incluir campos que têm valores válidos (não undefined, não null, não NaN)
        if (formData.monitor_enabled !== undefined && formData.monitor_enabled !== null) {
            dataToSend.monitor_enabled = formData.monitor_enabled
        }
        if (formData.check_interval_sec !== undefined && formData.check_interval_sec !== null && !isNaN(formData.check_interval_sec)) {
            dataToSend.check_interval_sec = formData.check_interval_sec
        }
        // BUY
        if (formData.lateral_tolerance_pct !== undefined && formData.lateral_tolerance_pct !== null && !isNaN(formData.lateral_tolerance_pct)) {
            dataToSend.lateral_tolerance_pct = formData.lateral_tolerance_pct
        }
        if (formData.lateral_cycles_min !== undefined && formData.lateral_cycles_min !== null && !isNaN(formData.lateral_cycles_min)) {
            dataToSend.lateral_cycles_min = formData.lateral_cycles_min
        }
        if (formData.lateral_cycles_enabled !== undefined) {
            dataToSend.lateral_cycles_enabled = formData.lateral_cycles_enabled
        }
        if (formData.rise_trigger_pct !== undefined && formData.rise_trigger_pct !== null && !isNaN(formData.rise_trigger_pct)) {
            dataToSend.rise_trigger_pct = formData.rise_trigger_pct
        }
        if (formData.rise_cycles_min !== undefined && formData.rise_cycles_min !== null && !isNaN(formData.rise_cycles_min)) {
            dataToSend.rise_cycles_min = formData.rise_cycles_min
        }
        if (formData.rise_cycles_enabled !== undefined) {
            dataToSend.rise_cycles_enabled = formData.rise_cycles_enabled
        }
        if (formData.max_fall_pct !== undefined && formData.max_fall_pct !== null && !isNaN(formData.max_fall_pct)) {
            dataToSend.max_fall_pct = formData.max_fall_pct
        }
        if (formData.max_fall_enabled !== undefined) {
            dataToSend.max_fall_enabled = formData.max_fall_enabled
        }
        if (formData.max_monitoring_time_min !== undefined && formData.max_monitoring_time_min !== null && !isNaN(formData.max_monitoring_time_min)) {
            dataToSend.max_monitoring_time_min = formData.max_monitoring_time_min
        }
        if (formData.max_monitoring_time_enabled !== undefined) {
            dataToSend.max_monitoring_time_enabled = formData.max_monitoring_time_enabled
        }
        if (formData.cooldown_after_execution_min !== undefined && formData.cooldown_after_execution_min !== null && !isNaN(formData.cooldown_after_execution_min)) {
            dataToSend.cooldown_after_execution_min = formData.cooldown_after_execution_min
        }
        // SELL
        if (formData.sell_lateral_tolerance_pct !== undefined && formData.sell_lateral_tolerance_pct !== null && !isNaN(formData.sell_lateral_tolerance_pct)) {
            dataToSend.sell_lateral_tolerance_pct = formData.sell_lateral_tolerance_pct
        }
        if (formData.sell_lateral_cycles_min !== undefined && formData.sell_lateral_cycles_min !== null && !isNaN(formData.sell_lateral_cycles_min)) {
            dataToSend.sell_lateral_cycles_min = formData.sell_lateral_cycles_min
        }
        if (formData.sell_lateral_cycles_enabled !== undefined) {
            dataToSend.sell_lateral_cycles_enabled = formData.sell_lateral_cycles_enabled
        }
        if (formData.sell_fall_trigger_pct !== undefined && formData.sell_fall_trigger_pct !== null && !isNaN(formData.sell_fall_trigger_pct)) {
            dataToSend.sell_fall_trigger_pct = formData.sell_fall_trigger_pct
        }
        if (formData.sell_fall_cycles_min !== undefined && formData.sell_fall_cycles_min !== null && !isNaN(formData.sell_fall_cycles_min)) {
            dataToSend.sell_fall_cycles_min = formData.sell_fall_cycles_min
        }
        if (formData.sell_fall_cycles_enabled !== undefined) {
            dataToSend.sell_fall_cycles_enabled = formData.sell_fall_cycles_enabled
        }
        if (formData.sell_max_monitoring_time_min !== undefined && formData.sell_max_monitoring_time_min !== null && !isNaN(formData.sell_max_monitoring_time_min)) {
            dataToSend.sell_max_monitoring_time_min = formData.sell_max_monitoring_time_min
        }
        if (formData.sell_max_monitoring_time_enabled !== undefined) {
            dataToSend.sell_max_monitoring_time_enabled = formData.sell_max_monitoring_time_enabled
        }
        if (formData.sell_cooldown_after_execution_min !== undefined && formData.sell_cooldown_after_execution_min !== null && !isNaN(formData.sell_cooldown_after_execution_min)) {
            dataToSend.sell_cooldown_after_execution_min = formData.sell_cooldown_after_execution_min
        }
        
        console.log('FormData atual:', formData)
        console.log('Dados que serão enviados:', dataToSend)
        console.log('Config atual:', config)
        
        if (Object.keys(dataToSend).length === 0) {
            toast.error('Nenhum campo válido para atualizar')
            return
        }
        
        updateMutation.mutate(dataToSend)
    }

    const handleChange = (key: keyof WebhookMonitorConfig, value: any) => {
        // Garantir que NaN não seja salvo
        const cleanValue = (typeof value === 'number' && isNaN(value)) ? undefined : value
        setFormData((prev) => ({ ...prev, [key]: cleanValue }))
    }

    if (isLoading) {
        return <div className="text-center py-8">Carregando configurações...</div>
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Configuração Global:</strong> As alterações aqui serão aplicadas a todos os alertas de monitoramento do sistema.
                </p>
            </div>

            {/* Configurações Gerais */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Configurações Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <Label htmlFor="check_interval_sec">Intervalo de Verificação (segundos)</Label>
                        <Input
                            id="check_interval_sec"
                            type="number"
                            min="10"
                            value={formData.check_interval_sec || 30}
                            onChange={(e) => handleChange('check_interval_sec', parseInt(e.target.value) || 30)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Intervalo entre verificações de preço (padrão: 30s)
                        </p>
                    </div>
                </div>
            </div>

            {/* Parâmetros para BUY */}
            <div className="space-y-4 mt-8 pt-8 border-t">
                <h3 className="text-lg font-semibold">Parâmetros para Compra (BUY)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <Label htmlFor="lateral_tolerance_pct">Tolerância Lateral (%)</Label>
                    <Input
                        id="lateral_tolerance_pct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formData.lateral_tolerance_pct || 0.3}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseFloat(e.target.value)
                            handleChange('lateral_tolerance_pct', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Margem para considerar preço lateral (padrão: 0.3%)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="lateral_cycles_min">Ciclos Mínimos Lateral</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="lateral_cycles_enabled"
                                checked={formData.lateral_cycles_enabled ?? true}
                                onCheckedChange={(checked) => handleChange('lateral_cycles_enabled', checked)}
                            />
                            <Label htmlFor="lateral_cycles_enabled" className="text-xs text-muted-foreground">
                                {formData.lateral_cycles_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="lateral_cycles_min"
                        type="number"
                        min="1"
                        value={formData.lateral_cycles_min || 4}
                        disabled={!formData.lateral_cycles_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('lateral_cycles_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Ciclos sem novo fundo para executar em lateral (padrão: 4)
                    </p>
                </div>

                <div>
                    <Label htmlFor="rise_trigger_pct">Gatilho de Alta (%)</Label>
                    <Input
                        id="rise_trigger_pct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formData.rise_trigger_pct || 0.75}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseFloat(e.target.value)
                            handleChange('rise_trigger_pct', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Percentual de alta a partir do mínimo para executar (padrão: 0.75%)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="rise_cycles_min">Ciclos Mínimos Alta</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="rise_cycles_enabled"
                                checked={formData.rise_cycles_enabled ?? true}
                                onCheckedChange={(checked) => handleChange('rise_cycles_enabled', checked)}
                            />
                            <Label htmlFor="rise_cycles_enabled" className="text-xs text-muted-foreground">
                                {formData.rise_cycles_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="rise_cycles_min"
                        type="number"
                        min="1"
                        value={formData.rise_cycles_min || 2}
                        disabled={!formData.rise_cycles_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('rise_cycles_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Ciclos mínimos após alta para executar (padrão: 2)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="max_fall_pct">Queda Máxima (%)</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="max_fall_enabled"
                                checked={formData.max_fall_enabled ?? false}
                                onCheckedChange={(checked) => handleChange('max_fall_enabled', checked)}
                            />
                            <Label htmlFor="max_fall_enabled" className="text-xs text-muted-foreground">
                                {formData.max_fall_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="max_fall_pct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formData.max_fall_pct || 6.0}
                        disabled={!formData.max_fall_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseFloat(e.target.value)
                            handleChange('max_fall_pct', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Queda máxima desde o alerta para cancelar (sem limite máximo)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="max_monitoring_time_min">Tempo Máximo (minutos)</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="max_monitoring_time_enabled"
                                checked={formData.max_monitoring_time_enabled ?? false}
                                onCheckedChange={(checked) => handleChange('max_monitoring_time_enabled', checked)}
                            />
                            <Label htmlFor="max_monitoring_time_enabled" className="text-xs text-muted-foreground">
                                {formData.max_monitoring_time_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="max_monitoring_time_min"
                        type="number"
                        min="1"
                        value={formData.max_monitoring_time_min || 60}
                        disabled={!formData.max_monitoring_time_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('max_monitoring_time_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Tempo máximo de monitoramento antes de cancelar (sem limite máximo)
                    </p>
                </div>

                <div>
                    <Label htmlFor="cooldown_after_execution_min">Cooldown Após Execução (minutos)</Label>
                    <Input
                        id="cooldown_after_execution_min"
                        type="number"
                        min="0"
                        value={formData.cooldown_after_execution_min || 30}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('cooldown_after_execution_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Tempo de cooldown antes de aceitar novo alerta no mesmo par (padrão: 30min)
                    </p>
                </div>
            </div>

            {/* Parâmetros para SELL */}
            <div className="space-y-4 mt-8 pt-8 border-t">
                <h3 className="text-lg font-semibold">Parâmetros para Venda (SELL)</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <Label htmlFor="sell_lateral_tolerance_pct">Tolerância Lateral SELL (%)</Label>
                    <Input
                        id="sell_lateral_tolerance_pct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formData.sell_lateral_tolerance_pct || 0.3}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseFloat(e.target.value)
                            handleChange('sell_lateral_tolerance_pct', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Margem para considerar preço lateral em vendas (padrão: 0.3%)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="sell_lateral_cycles_min">Ciclos Mínimos Lateral SELL</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="sell_lateral_cycles_enabled"
                                checked={formData.sell_lateral_cycles_enabled ?? true}
                                onCheckedChange={(checked) => handleChange('sell_lateral_cycles_enabled', checked)}
                            />
                            <Label htmlFor="sell_lateral_cycles_enabled" className="text-xs text-muted-foreground">
                                {formData.sell_lateral_cycles_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="sell_lateral_cycles_min"
                        type="number"
                        min="1"
                        value={formData.sell_lateral_cycles_min || 4}
                        disabled={!formData.sell_lateral_cycles_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('sell_lateral_cycles_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Ciclos sem novo topo para executar venda em lateral (padrão: 4)
                    </p>
                </div>

                <div>
                    <Label htmlFor="sell_fall_trigger_pct">Gatilho de Queda SELL (%)</Label>
                    <Input
                        id="sell_fall_trigger_pct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={formData.sell_fall_trigger_pct || 0.5}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseFloat(e.target.value)
                            handleChange('sell_fall_trigger_pct', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Percentual de queda a partir do máximo para executar venda (padrão: 0.5%)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="sell_fall_cycles_min">Ciclos Mínimos Queda SELL</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="sell_fall_cycles_enabled"
                                checked={formData.sell_fall_cycles_enabled ?? true}
                                onCheckedChange={(checked) => handleChange('sell_fall_cycles_enabled', checked)}
                            />
                            <Label htmlFor="sell_fall_cycles_enabled" className="text-xs text-muted-foreground">
                                {formData.sell_fall_cycles_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="sell_fall_cycles_min"
                        type="number"
                        min="1"
                        value={formData.sell_fall_cycles_min || 2}
                        disabled={!formData.sell_fall_cycles_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('sell_fall_cycles_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Ciclos mínimos após queda para executar venda (padrão: 2)
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="sell_max_monitoring_time_min">Tempo Máximo SELL (minutos)</Label>
                        <div className="flex items-center gap-2">
                            <Switch
                                id="sell_max_monitoring_time_enabled"
                                checked={formData.sell_max_monitoring_time_enabled ?? false}
                                onCheckedChange={(checked) => handleChange('sell_max_monitoring_time_enabled', checked)}
                            />
                            <Label htmlFor="sell_max_monitoring_time_enabled" className="text-xs text-muted-foreground">
                                {formData.sell_max_monitoring_time_enabled ? 'Habilitado' : 'Desabilitado'}
                            </Label>
                        </div>
                    </div>
                    <Input
                        id="sell_max_monitoring_time_min"
                        type="number"
                        min="1"
                        value={formData.sell_max_monitoring_time_min || 60}
                        disabled={!formData.sell_max_monitoring_time_enabled}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('sell_max_monitoring_time_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Tempo máximo de monitoramento para venda (sem limite máximo)
                    </p>
                </div>

                <div>
                    <Label htmlFor="sell_cooldown_after_execution_min">Cooldown Após Execução SELL (minutos)</Label>
                    <Input
                        id="sell_cooldown_after_execution_min"
                        type="number"
                        min="0"
                        value={formData.sell_cooldown_after_execution_min || 30}
                        onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value)
                            handleChange('sell_cooldown_after_execution_min', value !== undefined && !isNaN(value) ? value : undefined)
                        }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Cooldown após execução de venda (padrão: 30min)
                    </p>
                </div>
            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
            </div>
        </form>
    )
}
