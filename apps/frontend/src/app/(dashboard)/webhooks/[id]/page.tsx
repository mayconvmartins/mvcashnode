'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { webhooksService } from '@/lib/api/webhooks.service'
import { accountsService } from '@/lib/api/accounts.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { 
    ArrowLeft, 
    Copy, 
    Trash2, 
    Activity, 
    Link as LinkIcon,
    CheckCircle,
    XCircle,
    Clock,
    Edit,
    Plus,
    Settings,
    Users,
    List
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'
import { useState } from 'react'

export default function WebhookDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const webhookId = parseInt(params.id as string)

    const { data: webhook, isLoading } = useQuery({
        queryKey: ['webhook', webhookId],
        queryFn: () => webhooksService.getSource(webhookId),
        enabled: !isNaN(webhookId),
    })

    const { data: bindings } = useQuery({
        queryKey: ['webhook-bindings', webhookId],
        queryFn: () => webhooksService.listBindings(webhookId),
        enabled: !isNaN(webhookId),
    })

    const { data: events } = useQuery({
        queryKey: ['webhook-events', webhookId],
        queryFn: () => webhooksService.listEvents({ webhookSourceId: webhookId }),
        enabled: !isNaN(webhookId),
    })

    const { data: accounts } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })

    const deleteMutation = useMutation({
        mutationFn: () => webhooksService.deleteSource(webhookId),
        onSuccess: () => {
            toast.success('Webhook excluído com sucesso!')
            router.push('/webhooks')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao excluir webhook')
        },
    })

    const toggleActiveMutation = useMutation({
        mutationFn: (isActive: boolean) =>
            webhooksService.updateSource(webhookId, { isActive }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
            queryClient.invalidateQueries({ queryKey: ['webhooks'] })
            toast.success('Status atualizado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar status')
        },
    })

    const deleteBindingMutation = useMutation({
        mutationFn: (bindingId: number) =>
            webhooksService.deleteBinding(webhookId, bindingId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhook-bindings', webhookId] })
            queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
            toast.success('Vínculo removido com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao remover vínculo')
        },
    })

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success('Copiado para a área de transferência!')
    }

    const bindingsColumns: Column<any>[] = [
        {
            key: 'exchange_account',
            label: 'Conta',
            render: (binding) => (
                <div>
                    <p className="font-medium">
                        {binding.exchange_account?.label || `Conta #${binding.exchange_account?.id}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {binding.exchange_account?.exchange}
                    </p>
                </div>
            ),
        },
        {
            key: 'weight',
            label: 'Peso',
            render: (binding) => <Badge variant="outline">{binding.weight}</Badge>,
        },
        {
            key: 'is_active',
            label: 'Status',
            render: (binding) => (
                <Badge variant={binding.is_active ? 'default' : 'secondary'}>
                    {binding.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (binding) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        if (confirm('Tem certeza que deseja remover este vínculo?')) {
                            deleteBindingMutation.mutate(binding.id)
                        }
                    }}
                    disabled={deleteBindingMutation.isPending}
                >
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            ),
        },
    ]

    const eventsColumns: Column<any>[] = [
        {
            key: 'event_uid',
            label: 'ID',
            render: (event) => (
                <span className="font-mono text-sm">{event.event_uid}</span>
            ),
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (event) => (
                <span className="font-medium">{event.symbol_normalized || event.symbol_raw}</span>
            ),
        },
        {
            key: 'action',
            label: 'Ação',
            render: (event) => (
                <Badge variant="outline">{event.action}</Badge>
            ),
        },
        {
            key: 'status',
            label: 'Status',
            render: (event) => {
                const statusColors: Record<string, any> = {
                    JOB_CREATED: { variant: 'default', label: 'Job Criado' },
                    RECEIVED: { variant: 'secondary', label: 'Recebido' },
                    SKIPPED: { variant: 'outline', label: 'Ignorado' },
                    FAILED: { variant: 'destructive', label: 'Falhou' },
                }
                const config = statusColors[event.status] || { variant: 'secondary', label: event.status }
                return <Badge variant={config.variant}>{config.label}</Badge>
            },
        },
        {
            key: 'created_at',
            label: 'Recebido em',
            render: (event) => (
                <span className="text-sm">{formatDateTime(event.created_at)}</span>
            ),
        },
    ]

    if (isLoading) {
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
                <XCircle className="h-16 w-16 text-muted-foreground mb-4" />
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
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/webhooks')}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{webhook.label}</h1>
                        <p className="text-muted-foreground">Webhook #{webhook.id}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push(`/webhooks/${webhookId}/edit`)}
                    >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            if (confirm('Tem certeza que deseja excluir este webhook?')) {
                                deleteMutation.mutate()
                            }
                        }}
                        disabled={deleteMutation.isPending}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="overview">
                        <Settings className="h-4 w-4 mr-2" />
                        Visão Geral
                    </TabsTrigger>
                    <TabsTrigger value="bindings">
                        <Users className="h-4 w-4 mr-2" />
                        Vínculos ({bindings?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="events">
                        <List className="h-4 w-4 mr-2" />
                        Eventos ({events?.data?.length || 0})
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Informações do Webhook</CardTitle>
                                    <CardDescription>Configurações e URL de acesso</CardDescription>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id="active"
                                            checked={webhook.is_active}
                                            onCheckedChange={(checked) =>
                                                toggleActiveMutation.mutate(checked)
                                            }
                                            disabled={toggleActiveMutation.isPending}
                                        />
                                        <Label htmlFor="active">
                                            {webhook.is_active ? 'Ativo' : 'Inativo'}
                                        </Label>
                                    </div>
                                    <Badge
                                        variant={webhook.trade_mode === 'REAL' ? 'default' : 'secondary'}
                                    >
                                        {webhook.trade_mode}
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Webhook URL */}
                            <div className="space-y-2">
                                <Label>URL do Webhook</Label>
                                <div className="flex gap-2">
                                    <div className="flex-1 p-3 rounded-md bg-muted font-mono text-sm overflow-x-auto">
                                        {webhook.webhook_url}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => copyToClipboard(webhook.webhook_url)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <Separator />

                            {/* Settings */}
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <Label className="text-muted-foreground">Código</Label>
                                    <p className="font-mono text-sm mt-1">{webhook.webhook_code}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Rate Limit</Label>
                                    <p className="text-sm mt-1">{webhook.rate_limit_per_min}/min</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Requer Assinatura</Label>
                                    <p className="text-sm mt-1">
                                        {webhook.require_signature ? 'Sim' : 'Não'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Criado em</Label>
                                    <p className="text-sm mt-1">{formatDateTime(webhook.created_at)}</p>
                                </div>
                            </div>

                            {/* Allowed IPs */}
                            {webhook.allowed_ips && webhook.allowed_ips.length > 0 && (
                                <>
                                    <Separator />
                                    <div>
                                        <Label>IPs Permitidos</Label>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {webhook.allowed_ips.map((ip: string, index: number) => (
                                                <Badge key={index} variant="outline">
                                                    {ip}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Bindings Tab */}
                <TabsContent value="bindings" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Contas Vinculadas</CardTitle>
                                    <CardDescription>
                                        Contas de exchange que receberão os sinais deste webhook
                                    </CardDescription>
                                </div>
                                <Button onClick={() => router.push(`/webhooks/${webhookId}/bindings/new`)}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Adicionar Conta
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {bindings && bindings.length > 0 ? (
                                <DataTable
                                    data={bindings}
                                    columns={bindingsColumns}
                                />
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <LinkIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Nenhuma conta vinculada</p>
                                    <p className="text-sm mt-1">
                                        Vincule contas de exchange para receber os sinais
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Events Tab */}
                <TabsContent value="events" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Eventos Recebidos</CardTitle>
                            <CardDescription>
                                Histórico de eventos enviados para este webhook
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {events?.data && events.data.length > 0 ? (
                                <DataTable
                                    data={events.data}
                                    columns={eventsColumns}
                                />
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Nenhum evento recebido</p>
                                    <p className="text-sm mt-1">
                                        Os eventos aparecerão aqui quando forem enviados para este webhook
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

