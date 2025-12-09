'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { webhookMonitorService, type WebhookMonitorConfig } from '@/lib/api/webhook-monitor.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
        lateral_tolerance_pct: 0.3,
        lateral_cycles_min: 4,
        rise_trigger_pct: 0.75,
        rise_cycles_min: 2,
        max_fall_pct: 6.0,
        max_monitoring_time_min: 60,
        cooldown_after_execution_min: 30,
    })

    // Atualizar formData quando config for carregado
    useEffect(() => {
        if (config) {
            setFormData(config)
        }
    }, [config])

    const updateMutation = useMutation({
        mutationFn: webhookMonitorService.updateConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook-monitor-config'] })
            toast.success('Configurações atualizadas com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao atualizar configurações')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        updateMutation.mutate(formData)
    }

    const handleChange = (key: keyof WebhookMonitorConfig, value: any) => {
        setFormData((prev) => ({ ...prev, [key]: value }))
    }

    if (isLoading) {
        return <div className="text-center py-8">Carregando configurações...</div>
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <Label htmlFor="check_interval_sec">Intervalo de Verificação (segundos)</Label>
                    <Input
                        id="check_interval_sec"
                        type="number"
                        min="10"
                        max="300"
                        value={formData.check_interval_sec || 30}
                        onChange={(e) => handleChange('check_interval_sec', parseInt(e.target.value) || 30)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Intervalo entre verificações de preço (padrão: 30s)
                    </p>
                </div>

                <div>
                    <Label htmlFor="lateral_tolerance_pct">Tolerância Lateral (%)</Label>
                    <Input
                        id="lateral_tolerance_pct"
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="5"
                        value={formData.lateral_tolerance_pct || 0.3}
                        onChange={(e) => handleChange('lateral_tolerance_pct', parseFloat(e.target.value) || 0.3)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Margem para considerar preço lateral (padrão: 0.3%)
                    </p>
                </div>

                <div>
                    <Label htmlFor="lateral_cycles_min">Ciclos Mínimos Lateral</Label>
                    <Input
                        id="lateral_cycles_min"
                        type="number"
                        min="1"
                        max="20"
                        value={formData.lateral_cycles_min || 4}
                        onChange={(e) => handleChange('lateral_cycles_min', parseInt(e.target.value) || 4)}
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
                        max="10"
                        value={formData.rise_trigger_pct || 0.75}
                        onChange={(e) => handleChange('rise_trigger_pct', parseFloat(e.target.value) || 0.75)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Percentual de alta a partir do mínimo para executar (padrão: 0.75%)
                    </p>
                </div>

                <div>
                    <Label htmlFor="rise_cycles_min">Ciclos Mínimos Alta</Label>
                    <Input
                        id="rise_cycles_min"
                        type="number"
                        min="1"
                        max="10"
                        value={formData.rise_cycles_min || 2}
                        onChange={(e) => handleChange('rise_cycles_min', parseInt(e.target.value) || 2)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Ciclos mínimos após alta para executar (padrão: 2)
                    </p>
                </div>

                <div>
                    <Label htmlFor="max_fall_pct">Queda Máxima (%)</Label>
                    <Input
                        id="max_fall_pct"
                        type="number"
                        step="0.1"
                        min="1"
                        max="20"
                        value={formData.max_fall_pct || 6.0}
                        onChange={(e) => handleChange('max_fall_pct', parseFloat(e.target.value) || 6.0)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Queda máxima desde o alerta para cancelar (padrão: 6%)
                    </p>
                </div>

                <div>
                    <Label htmlFor="max_monitoring_time_min">Tempo Máximo (minutos)</Label>
                    <Input
                        id="max_monitoring_time_min"
                        type="number"
                        min="5"
                        max="300"
                        value={formData.max_monitoring_time_min || 60}
                        onChange={(e) => handleChange('max_monitoring_time_min', parseInt(e.target.value) || 60)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Tempo máximo de monitoramento antes de cancelar (padrão: 60min)
                    </p>
                </div>

                <div>
                    <Label htmlFor="cooldown_after_execution_min">Cooldown Após Execução (minutos)</Label>
                    <Input
                        id="cooldown_after_execution_min"
                        type="number"
                        min="5"
                        max="300"
                        value={formData.cooldown_after_execution_min || 30}
                        onChange={(e) => handleChange('cooldown_after_execution_min', parseInt(e.target.value) || 30)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Tempo de cooldown antes de aceitar novo alerta no mesmo par (padrão: 30min)
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

