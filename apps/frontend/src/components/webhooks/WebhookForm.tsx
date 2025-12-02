'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { WebhookSource, TradeMode } from '@/lib/types'

interface WebhookFormProps {
    webhook?: WebhookSource
    onSuccess: (webhook: any) => void
    onCancel: () => void
}

export function WebhookForm({ webhook, onSuccess, onCancel }: WebhookFormProps) {
    const queryClient = useQueryClient()
    const [formData, setFormData] = useState({
        label: webhook?.label || '',
        webhookCode: webhook?.webhook_code || '',
        tradeMode: (webhook?.trade_mode || 'REAL') as TradeMode,
        allowedIPs: webhook?.allowed_ips_json?.join('\n') || '',
        requireSignature: webhook?.require_signature || false,
        rateLimitPerMin: webhook?.rate_limit_per_min || 60,
        alertGroupEnabled: webhook?.alert_group_enabled || false,
        alertGroupId: webhook?.alert_group_id || '',
    })

    // Atualizar formData quando webhook mudar
    useEffect(() => {
        if (webhook) {
            setFormData({
                label: webhook.label || '',
                webhookCode: webhook.webhook_code || '',
                tradeMode: (webhook.trade_mode || 'REAL') as TradeMode,
                allowedIPs: webhook.allowed_ips_json?.join('\n') || '',
                requireSignature: webhook.require_signature || false,
                rateLimitPerMin: webhook.rate_limit_per_min || 60,
                alertGroupEnabled: webhook.alert_group_enabled || false,
                alertGroupId: webhook.alert_group_id || '',
            })
        }
    }, [webhook])

    const mutation = useMutation({
        mutationFn: () => {
            // Preparar dados para o backend
            const payload: any = {
                label: formData.label,
                tradeMode: formData.tradeMode,
                requireSignature: formData.requireSignature,
                rateLimitPerMin: formData.rateLimitPerMin,
                alertGroupEnabled: formData.alertGroupEnabled,
            }
            
            // Sempre enviar alertGroupId: se enabled é true, enviar o ID; se false, enviar null para limpar
            payload.alertGroupId = formData.alertGroupEnabled ? (formData.alertGroupId || null) : null
            
            console.log('[WEBHOOK-FORM] Payload sendo enviado:', payload)

            // Apenas incluir webhookCode na criação
            if (!webhook && formData.webhookCode) {
                payload.webhookCode = formData.webhookCode
            }

            // Processar allowedIPs (separar por linha e filtrar vazios)
            if (formData.allowedIPs.trim()) {
                payload.allowedIPs = formData.allowedIPs
                    .split('\n')
                    .map(ip => ip.trim())
                    .filter(ip => ip.length > 0)
            } else {
                payload.allowedIPs = []
            }

            if (webhook) {
                return webhooksService.updateSource(webhook.id, payload)
            }
            return webhooksService.createSource(payload)
        },
        onSuccess: (data) => {
            console.log('[WEBHOOK-FORM] Resposta recebida:', data)
            console.log('[WEBHOOK-FORM] alert_group_enabled:', data?.alert_group_enabled)
            console.log('[WEBHOOK-FORM] alert_group_id:', data?.alert_group_id)
            toast.success(webhook ? 'Webhook atualizado!' : 'Webhook criado!')
            // Invalidar cache para forçar atualização
            if (webhook) {
                queryClient.invalidateQueries({ queryKey: ['webhook', webhook.id] })
                queryClient.invalidateQueries({ queryKey: ['webhooks'] })
                // Atualizar cache diretamente com os dados retornados
                queryClient.setQueryData(['webhook', webhook.id], data)
                console.log('[WEBHOOK-FORM] Cache atualizado com:', data)
            } else {
                queryClient.invalidateQueries({ queryKey: ['webhooks'] })
            }
            // Aguardar um pouco para garantir que o cache foi atualizado
            setTimeout(() => {
                onSuccess(data)
            }, 200)
        },
        onError: (error: any) => {
            const errorMessage = error?.response?.data?.message || error?.message || 'Falha ao salvar webhook'
            toast.error(errorMessage)
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!formData.label.trim()) {
            toast.error('Nome é obrigatório')
            return
        }

        if (!webhook && !formData.webhookCode.trim()) {
            toast.error('Código do webhook é obrigatório')
            return
        }
        
        mutation.mutate()
    }

    const handleChange = (key: string, value: any) => {
        setFormData((prev) => ({ ...prev, [key]: value }))
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                <div>
                    <Label htmlFor="label">Nome *</Label>
                    <Input
                        id="label"
                        value={formData.label}
                        onChange={(e) => handleChange('label', e.target.value)}
                        placeholder="Ex: TradingView Principal"
                        required
                    />
                </div>

                {!webhook && (
                    <div>
                        <Label htmlFor="webhookCode">Código do Webhook *</Label>
                        <Input
                            id="webhookCode"
                            value={formData.webhookCode}
                            onChange={(e) => handleChange('webhookCode', e.target.value)}
                            placeholder="Ex: tradingview-alerts"
                            required
                            pattern="[a-z0-9-]+"
                            title="Apenas letras minúsculas, números e hífens"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Usado na URL do webhook. Apenas letras minúsculas, números e hífens.
                        </p>
                    </div>
                )}

                {webhook && (
                    <div>
                        <Label>Código do Webhook</Label>
                        <Input
                            value={webhook.webhook_code}
                            disabled
                            className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            O código não pode ser alterado após a criação
                        </p>
                    </div>
                )}

                <div>
                    <Label htmlFor="tradeMode">Modo de Trading *</Label>
                    <Select 
                        value={formData.tradeMode} 
                        onValueChange={(value) => handleChange('tradeMode', value)}
                    >
                        <SelectTrigger id="tradeMode">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="REAL">REAL</SelectItem>
                            <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="allowedIPs">IPs Permitidos (um por linha)</Label>
                    <Textarea
                        id="allowedIPs"
                        value={formData.allowedIPs}
                        onChange={(e) => handleChange('allowedIPs', e.target.value)}
                        placeholder="192.168.1.1&#10;203.0.113.0/24"
                        rows={4}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Deixe vazio para permitir qualquer IP. Use CIDR para ranges (ex: 192.168.1.0/24)
                    </p>
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="requireSignature">Requer Assinatura HMAC</Label>
                        <p className="text-sm text-muted-foreground">
                            Valida assinatura HMAC-SHA256 nas requisições
                        </p>
                    </div>
                    <Switch
                        id="requireSignature"
                        checked={formData.requireSignature}
                        onCheckedChange={(checked) => handleChange('requireSignature', checked)}
                    />
                </div>

                <div>
                    <Label htmlFor="rateLimitPerMin">Rate Limit (por minuto) *</Label>
                    <Input
                        id="rateLimitPerMin"
                        type="number"
                        min="1"
                        value={formData.rateLimitPerMin}
                        onChange={(e) => handleChange('rateLimitPerMin', parseInt(e.target.value) || 60)}
                        required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Número máximo de requisições permitidas por minuto
                    </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="alertGroupEnabled">Alertas para Grupo WhatsApp</Label>
                            <p className="text-sm text-muted-foreground">
                                Enviar notificações de webhook recebido para um grupo WhatsApp
                            </p>
                        </div>
                        <Switch
                            id="alertGroupEnabled"
                            checked={formData.alertGroupEnabled}
                            onCheckedChange={(checked) => handleChange('alertGroupEnabled', checked)}
                        />
                    </div>

                    {formData.alertGroupEnabled && (
                        <div>
                            <Label htmlFor="alertGroupId">ID do Grupo WhatsApp *</Label>
                            <Input
                                id="alertGroupId"
                                value={formData.alertGroupId}
                                onChange={(e) => handleChange('alertGroupId', e.target.value)}
                                placeholder="120363123456789012@g.us"
                                required={formData.alertGroupEnabled}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                ID do grupo no formato: 120363123456789012@g.us
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Salvando...' : webhook ? 'Atualizar' : 'Criar'}
                </Button>
            </div>
        </form>
    )
}

