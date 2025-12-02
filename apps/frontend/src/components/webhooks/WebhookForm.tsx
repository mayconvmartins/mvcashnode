'use client'

import { useState } from 'react'
import { useMutation } from '@tantml:query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

interface WebhookFormProps {
    webhook?: any
    onSuccess: (webhook: any) => void
    onCancel: () => void
}

export function WebhookForm({ webhook, onSuccess, onCancel }: WebhookFormProps) {
    const [formData, setFormData] = useState({
        name: webhook?.name || '',
        source: webhook?.source || 'TRADINGVIEW',
        mode: webhook?.mode || 'REAL',
        description: webhook?.description || '',
        active: webhook?.active ?? true,
    })

    const mutation = useMutation({
        mutationFn: () => {
            if (webhook) {
                return webhooksService.update(webhook.id, formData)
            }
            return webhooksService.create(formData)
        },
        onSuccess: (data) => {
            toast.success(webhook ? 'Webhook atualizado!' : 'Webhook criado!')
            onSuccess(data)
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao salvar webhook')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!formData.name.trim()) {
            toast.error('Nome é obrigatório')
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
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="Ex: TradingView Principal"
                        required
                    />
                </div>

                <div>
                    <Label htmlFor="source">Source *</Label>
                    <Select value={formData.source} onValueChange={(value) => handleChange('source', value)}>
                        <SelectTrigger id="source">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="TRADINGVIEW">TradingView</SelectItem>
                            <SelectItem value="CUSTOM">Custom</SelectItem>
                            <SelectItem value="TELEGRAM">Telegram</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="mode">Modo *</Label>
                    <Select value={formData.mode} onValueChange={(value) => handleChange('mode', value)}>
                        <SelectTrigger id="mode">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="REAL">REAL</SelectItem>
                            <SelectItem value="SIMULATION">SIMULATION</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Input
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleChange('description', e.target.value)}
                        placeholder="Descrição opcional"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="active">Webhook Ativo</Label>
                        <p className="text-sm text-muted-foreground">
                            Webhook receberá e processará eventos
                        </p>
                    </div>
                    <Switch
                        id="active"
                        checked={formData.active}
                        onCheckedChange={(checked) => handleChange('active', checked)}
                    />
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

