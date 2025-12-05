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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
    List,
    Info,
    RefreshCw,
    Radio,
    Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'
import { useState } from 'react'

export default function WebhookDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const webhookId = parseInt(params.id as string)

    const { data: webhook, isLoading, refetch } = useQuery({
        queryKey: ['webhook', webhookId],
        queryFn: async () => {
            const result = await webhooksService.getSource(webhookId)
            console.log('[WEBHOOK-DETAILS] Dados recebidos do serviço:', result)
            console.log('[WEBHOOK-DETAILS] alert_group_enabled:', result?.alert_group_enabled)
            console.log('[WEBHOOK-DETAILS] alert_group_id:', result?.alert_group_id)
            return result
        },
        enabled: !isNaN(webhookId),
        refetchOnMount: true, // Sempre refetch quando a página é montada
        refetchOnWindowFocus: false,
    })

    const { data: bindings } = useQuery({
        queryKey: ['webhook-bindings', webhookId],
        queryFn: () => webhooksService.listBindings(webhookId),
        enabled: !isNaN(webhookId),
    })

    const [eventsPage, setEventsPage] = useState(1)
    const [isRealtime, setIsRealtime] = useState(false)
    const eventsLimit = 20

    const { data: events, refetch: refetchEvents, isRefetching: isRefetchingEvents, isLoading: isLoadingEvents } = useQuery({
        queryKey: ['webhook-events', webhookId, eventsPage],
        queryFn: () => webhooksService.listEvents({ 
            webhookSourceId: webhookId,
            page: eventsPage,
            limit: eventsLimit,
        }),
        enabled: !isNaN(webhookId),
        refetchInterval: isRealtime ? 5000 : false, // Atualiza a cada 5 segundos quando realtime está ativo
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

    // Note: is_active não pode ser atualizado via API (apenas admin pode alterar)
    // const toggleActiveMutation = useMutation({
    //     mutationFn: (isActive: boolean) =>
    //         webhooksService.updateSource(webhookId, { isActive }),
    //     onSuccess: () => {
    //         queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
    //         queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    //         toast.success('Status atualizado com sucesso!')
    //     },
    //     onError: (error: any) => {
    //         toast.error(error.message || 'Erro ao atualizar status')
    //     },
    // })

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
            key: 'id',
            label: 'ID',
            render: (event) => (
                <span className="font-mono text-sm">#{event.id}</span>
            ),
        },
        {
            key: 'symbol',
            label: 'Símbolo',
            render: (event) => (
                <div>
                    <div className="font-medium">{event.symbol_normalized || event.symbol_raw || 'N/A'}</div>
                    {event.symbol_raw && event.symbol_raw !== event.symbol_normalized && (
                        <div className="text-xs text-muted-foreground font-mono">{event.symbol_raw}</div>
                    )}
                </div>
            ),
        },
        {
            key: 'action',
            label: 'Ação',
            render: (event) => {
                if (event.action === 'BUY_SIGNAL') {
                    return <Badge variant="success" className="bg-green-500">COMPRA</Badge>
                } else if (event.action === 'SELL_SIGNAL') {
                    return <Badge variant="destructive">VENDA</Badge>
                }
                return <Badge variant="secondary">{event.action}</Badge>
            },
        },
        {
            key: 'status',
            label: 'Status',
            render: (event: any) => {
                const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'; label: string; icon: any }> = {
                    JOB_CREATED: { variant: 'success', label: 'Job Criado', icon: CheckCircle },
                    RECEIVED: { variant: 'secondary', label: 'Recebido', icon: Clock },
                    SKIPPED: { variant: 'outline', label: 'Ignorado', icon: XCircle },
                    FAILED: { variant: 'destructive', label: 'Falhou', icon: XCircle },
                }
                const config = statusConfig[event.status] || { variant: 'secondary' as const, label: event.status, icon: Clock }
                const Icon = config.icon
                const badge = (
                    <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
                        <Icon className="h-3 w-3" />
                        {config.label}
                    </Badge>
                )

                // Se for SKIPPED e tiver motivo, adicionar tooltip
                if (event.status === 'SKIPPED' && event.validation_error) {
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 cursor-help">
                                        {badge}
                                        <Info className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md">
                                    <div className="space-y-1">
                                        <p className="font-semibold">Motivo do SKIP:</p>
                                        <p className="text-sm whitespace-pre-wrap">{event.validation_error}</p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )
                }

                return badge
            },
        },
        {
            key: 'trade_mode',
            label: 'Modo',
            render: (event) => (
                <Badge variant={event.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                    {event.trade_mode}
                </Badge>
            ),
        },
        {
            key: 'timeframe',
            label: 'Timeframe',
            render: (event) => (
                <span className="text-sm">{event.timeframe || '-'}</span>
            ),
        },
        {
            key: 'price_reference',
            label: 'Preço',
            render: (event) => (
                <span className="text-sm font-medium">
                    {event.price_reference ? `$${event.price_reference}` : '-'}
                </span>
            ),
        },
        {
            key: 'created_at',
            label: 'Recebido em',
            render: (event) => (
                <div className="text-sm">
                    <div>{formatDateTime(event.created_at).split(' ')[0]}</div>
                    <div className="text-muted-foreground">{formatDateTime(event.created_at).split(' ')[1]}</div>
                </div>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (event) => (
                <Link href={`/webhooks/events/${event.id}`}>
                    <Button variant="ghost" size="sm">
                        <Activity className="h-4 w-4" />
                    </Button>
                </Link>
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

    // Verificar se usuário é dono
    const isOwner = webhook.is_owner !== false // Default true se não especificado
    
    // Se não for dono, mostrar apenas informações básicas
    if (!isOwner) {
        return (
            <div className="space-y-6">
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
                        <p className="text-muted-foreground">Webhook Compartilhado</p>
                    </div>
                </div>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Webhook Compartilhado</CardTitle>
                        <CardDescription>
                            Este webhook foi compartilhado com você. Você tem contas vinculadas a este webhook, mas não tem acesso aos detalhes completos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <Label className="text-sm font-medium">Nome</Label>
                                <p className="text-sm text-muted-foreground">{webhook.label}</p>
                            </div>
                            <div>
                                <Label className="text-sm font-medium">Status</Label>
                                <p className="text-sm text-muted-foreground">
                                    Você pode ver este webhook na listagem, mas não tem permissão para ver detalhes, eventos ou bindings.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
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
                        onClick={() => {
                            // Invalidar cache antes de ir para edição
                            queryClient.invalidateQueries({ queryKey: ['webhook', webhookId] })
                            router.push(`/webhooks/${webhookId}/edit`)
                        }}
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
                        Eventos ({events?.pagination?.total_items || events?.data?.length || 0})
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
                                            disabled={true}
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
                                        {typeof window !== 'undefined' 
                                            ? `${process.env.NEXT_PUBLIC_WEBHOOK_URL || window.location.origin}/webhooks/${webhook.webhook_code}`
                                            : ''}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                            const url = typeof window !== 'undefined' 
                                                ? `${process.env.NEXT_PUBLIC_WEBHOOK_URL || window.location.origin}/webhooks/${webhook.webhook_code}`
                                                : ''
                                            copyToClipboard(url)
                                        }}
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
                            {webhook.allowed_ips_json && webhook.allowed_ips_json.length > 0 && (
                                <>
                                    <Separator />
                                    <div>
                                        <Label>IPs Permitidos</Label>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {webhook.allowed_ips_json.map((ip: string, index: number) => (
                                                <Badge key={index} variant="outline">
                                                    {ip}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* WhatsApp Group Alerts */}
                            <Separator />
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>Alertas para Grupo WhatsApp</Label>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Enviar notificações de webhook recebido para um grupo WhatsApp
                                        </p>
                                    </div>
                                    <Badge variant={webhook.alert_group_enabled ? 'default' : 'secondary'}>
                                        {webhook.alert_group_enabled ? 'Ativo' : 'Inativo'}
                                    </Badge>
                                </div>
                                {webhook.alert_group_enabled && webhook.alert_group_id && (
                                    <div>
                                        <Label className="text-muted-foreground">ID do Grupo</Label>
                                        <div className="mt-1 flex items-center gap-2">
                                            <code className="text-sm bg-muted px-2 py-1 rounded flex-1 font-mono">
                                                {webhook.alert_group_id}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => copyToClipboard(webhook.alert_group_id!)}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
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
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Eventos Recebidos</CardTitle>
                                    <CardDescription>
                                        Histórico de eventos enviados para este webhook
                                        {events?.pagination?.total_items !== undefined && (
                                            <span className="ml-2">
                                                ({events.pagination.total_items} total)
                                            </span>
                                        )}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Botão Atualizar */}
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => refetchEvents()}
                                        disabled={isRefetchingEvents}
                                    >
                                        {isRefetchingEvents ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-4 w-4 mr-2" />
                                        )}
                                        Atualizar
                                    </Button>
                                    
                                    {/* Botão Realtime */}
                                    <Button 
                                        variant={isRealtime ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setIsRealtime(!isRealtime)}
                                        className={isRealtime ? "bg-green-600 hover:bg-green-700" : ""}
                                    >
                                        <Radio className={`h-4 w-4 mr-2 ${isRealtime ? 'animate-pulse' : ''}`} />
                                        {isRealtime ? 'Realtime ON' : 'Realtime OFF'}
                                    </Button>
                                    
                                    <Link href="/webhooks/events">
                                        <Button variant="outline" size="sm">
                                            Ver Todos os Eventos
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingEvents ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : events?.data && events.data.length > 0 ? (
                                <>
                                    <DataTable
                                        data={events.data}
                                        columns={eventsColumns}
                                        loading={isLoadingEvents}
                                    />
                                    {events.pagination && events.pagination.total_pages > 1 && (
                                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                            <div className="text-sm text-muted-foreground">
                                                Página {eventsPage} de {events.pagination.total_pages}
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={eventsPage <= 1 || isLoadingEvents}
                                                    onClick={() => setEventsPage(prev => Math.max(1, prev - 1))}
                                                >
                                                    Anterior
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={eventsPage >= events.pagination.total_pages || isLoadingEvents}
                                                    onClick={() => setEventsPage(prev => prev + 1)}
                                                >
                                                    Próxima
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Activity className="h-16 w-16 mx-auto mb-4 opacity-30" />
                                    <p className="text-lg font-medium mb-2">Nenhum evento recebido</p>
                                    <p className="text-sm">
                                        Os eventos aparecerão aqui quando forem enviados para este webhook
                                    </p>
                                    {events && events.pagination && events.pagination.total_items === 0 && (
                                        <p className="text-xs mt-2 text-muted-foreground">
                                            Total de eventos: {events.pagination.total_items}
                                        </p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

