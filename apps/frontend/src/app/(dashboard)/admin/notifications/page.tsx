'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsService, type NotificationTemplateType, type WhatsAppNotificationTemplate, type CreateTemplateDto, type UpdateTemplateDto } from '@/lib/api/notifications.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { 
    MessageSquare, 
    Settings, 
    History, 
    BarChart3, 
    Send, 
    CheckCircle, 
    XCircle, 
    Loader2,
    RefreshCw,
    Eye,
    EyeOff,
    Wifi,
    WifiOff,
    FileText,
    Edit,
    Trash2,
    Copy,
    Play,
    Eye as EyeIcon
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'
import { TemplatesTab } from '@/components/admin/TemplatesTab'

export default function NotificationsConfigPage() {
    const queryClient = useQueryClient()
    const [showApiKey, setShowApiKey] = useState(false)
    const [testPhone, setTestPhone] = useState('')
    const [testMessage, setTestMessage] = useState('')

    // Queries
    const { data: globalConfig, isLoading: loadingGlobal } = useQuery({
        queryKey: ['notifications', 'global-config'],
        queryFn: () => notificationsService.getGlobalConfig(),
    })

    const { data: stats, isLoading: loadingStats } = useQuery({
        queryKey: ['notifications', 'stats'],
        queryFn: () => notificationsService.getStats(),
    })

    const { data: history, isLoading: loadingHistory } = useQuery({
        queryKey: ['notifications', 'history'],
        queryFn: () => notificationsService.getAlertHistory({ limit: 20 }),
    })

    // Mutations
    const updateGlobalMutation = useMutation({
        mutationFn: notificationsService.updateGlobalConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            toast.success('Configuração salva com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao salvar configuração')
        },
    })

    const testConnectionMutation = useMutation({
        mutationFn: () => notificationsService.testConnection(),
        onSuccess: (data) => {
            if (data.success) {
                toast.success(data.message)
            } else {
                toast.error(data.message)
            }
        },
        onError: () => {
            toast.error('Erro ao testar conexão')
        },
    })

    const sendTestMutation = useMutation({
        mutationFn: () => notificationsService.sendTestMessage(testPhone, testMessage),
        onSuccess: (data) => {
            if (data.success) {
                toast.success(data.message)
                setTestPhone('')
                setTestMessage('')
            } else {
                toast.error(data.message)
            }
        },
        onError: () => {
            toast.error('Erro ao enviar mensagem')
        },
    })

    // Form state for global config
    const [formData, setFormData] = useState({
        api_url: '',
        api_key: '',
        instance_name: '',
        is_active: false,
    })

    // Update form when data loads
    useState(() => {
        if (globalConfig) {
            setFormData({
                api_url: globalConfig.api_url || '',
                api_key: globalConfig.api_key || '',
                instance_name: globalConfig.instance_name || '',
                is_active: globalConfig.is_active || false,
            })
        }
    })

    const handleSaveGlobal = () => {
        updateGlobalMutation.mutate({
            api_url: formData.api_url,
            api_key: formData.api_key || undefined,
            instance_name: formData.instance_name,
            is_active: formData.is_active,
        })
    }

    if (loadingGlobal || loadingStats) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 md:grid-cols-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold gradient-text">Configuração de Notificações</h1>
                <p className="text-muted-foreground mt-1">
                    Configure alertas via WhatsApp usando Evolution API
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Status</CardDescription>
                        {stats?.globalConfig.isActive ? (
                            <Wifi className="h-4 w-4 text-green-500" />
                        ) : (
                            <WifiOff className="h-4 w-4 text-muted-foreground" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <Badge 
                            variant={stats?.globalConfig.isActive ? 'default' : 'secondary'}
                            className={stats?.globalConfig.isActive ? 'bg-green-500' : ''}
                        >
                            {stats?.globalConfig.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Alertas de Posição</CardDescription>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.alerts.position.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.alerts.position.today || 0} hoje
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Alertas de Cofre</CardDescription>
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.alerts.vault.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.alerts.vault.today || 0} hoje
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Usuários Configurados</CardDescription>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.usersWithConfig || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.usersWithWhatsApp 
                                ? `${stats.usersWithWhatsApp} com WhatsApp configurado`
                                : 'com preferências salvas'
                            }
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="config" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="config" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Configuração Global
                    </TabsTrigger>
                    <TabsTrigger value="templates" className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Templates
                    </TabsTrigger>
                    <TabsTrigger value="test" className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        Testar Envio
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Histórico
                    </TabsTrigger>
                    <TabsTrigger value="email" className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Email
                    </TabsTrigger>
                </TabsList>

                {/* Config Tab */}
                <TabsContent value="config">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Evolution API</CardTitle>
                            <CardDescription>
                                Configure a conexão com sua instância da Evolution API para envio de mensagens WhatsApp
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="api_url">URL da API *</Label>
                                    <Input
                                        id="api_url"
                                        placeholder="https://sua-evolution-api.com"
                                        value={formData.api_url || globalConfig?.api_url || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, api_url: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="instance_name">Nome da Instância *</Label>
                                    <Input
                                        id="instance_name"
                                        placeholder="minha-instancia"
                                        value={formData.instance_name || globalConfig?.instance_name || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, instance_name: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="api_key">API Key (opcional)</Label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            id="api_key"
                                            type={showApiKey ? 'text' : 'password'}
                                            placeholder="Sua chave de API"
                                            value={formData.api_key || globalConfig?.api_key || ''}
                                            onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="absolute right-0 top-0 h-full px-3"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                        >
                                            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                    <Label>Ativar Notificações</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Quando ativo, o sistema enviará alertas via WhatsApp
                                    </p>
                                </div>
                                <Switch
                                    checked={formData.is_active ?? globalConfig?.is_active ?? false}
                                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button 
                                    onClick={handleSaveGlobal}
                                    disabled={updateGlobalMutation.isPending}
                                >
                                    {updateGlobalMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Configuração
                                </Button>
                                <Button 
                                    variant="outline"
                                    onClick={() => testConnectionMutation.mutate()}
                                    disabled={testConnectionMutation.isPending}
                                >
                                    {testConnectionMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                    )}
                                    Testar Conexão
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Templates Tab */}
                <TabsContent value="templates">
                    <TemplatesTab />
                </TabsContent>

                {/* Test Tab */}
                <TabsContent value="test">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Enviar Mensagem de Teste</CardTitle>
                            <CardDescription>
                                Envie uma mensagem de teste para verificar se a configuração está funcionando
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!stats?.globalConfig.isActive && (
                                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                                        ⚠️ As notificações estão desativadas. Ative na aba de configuração para enviar mensagens.
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="test_phone">Número de Telefone *</Label>
                                    <Input
                                        id="test_phone"
                                        placeholder="5511999999999"
                                        value={testPhone}
                                        onChange={(e) => setTestPhone(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Formato: código do país + DDD + número (sem espaços ou caracteres especiais)
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="test_message">Mensagem (opcional)</Label>
                                    <Input
                                        id="test_message"
                                        placeholder="Deixe vazio para mensagem padrão"
                                        value={testMessage}
                                        onChange={(e) => setTestMessage(e.target.value)}
                                    />
                                </div>
                            </div>

                            <Button 
                                onClick={() => sendTestMutation.mutate()}
                                disabled={sendTestMutation.isPending || !testPhone || !stats?.globalConfig.isActive}
                            >
                                {sendTestMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="mr-2 h-4 w-4" />
                                )}
                                Enviar Mensagem de Teste
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history">
                    <Card className="glass">
                        <CardHeader>
                            <CardTitle>Histórico de Alertas</CardTitle>
                            <CardDescription>
                                Últimos alertas enviados pelo sistema
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingHistory ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-12" />
                                    <Skeleton className="h-12" />
                                    <Skeleton className="h-12" />
                                </div>
                            ) : history?.items && history.items.length > 0 ? (
                                <div className="space-y-2">
                                    {history.items.map((alert) => (
                                        <div 
                                            key={`${alert.source}-${alert.id}`}
                                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-full ${
                                                    alert.source === 'position' 
                                                        ? 'bg-blue-500/10 text-blue-500' 
                                                        : alert.source === 'vault'
                                                        ? 'bg-purple-500/10 text-purple-500'
                                                        : alert.source === 'webhook'
                                                        ? 'bg-green-500/10 text-green-500'
                                                        : 'bg-gray-500/10 text-gray-500'
                                                }`}>
                                                    <MessageSquare className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{alert.alert_type}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {alert.source === 'position' 
                                                            ? `Posição #${alert.position_id}` 
                                                            : alert.source === 'vault'
                                                            ? `Cofre #${alert.vault_id}`
                                                            : alert.source === 'webhook'
                                                            ? `Webhook Event #${alert.webhook_event_id}`
                                                            : 'Outro'
                                                        }
                                                        {alert.recipient && (
                                                            <span className="ml-2">
                                                                → {alert.recipient_type === 'group' ? 'Grupo' : alert.recipient}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge 
                                                    variant={alert.status === 'failed' ? 'destructive' : 'outline'} 
                                                    className="text-xs"
                                                >
                                                    {alert.status === 'failed' ? 'Falhou' : alert.source}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDateTime(alert.sent_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>Nenhum alerta enviado ainda</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Email Config Tab */}
                <TabsContent value="email">
                    <EmailConfigTab />
                </TabsContent>
            </Tabs>
        </div>
    )
}

// Componente separado para configurações de email
function EmailConfigTab() {
    const queryClient = useQueryClient()
    const [emailConfig, setEmailConfig] = useState({
        password_reset_enabled: true,
        system_alerts_enabled: true,
        position_opened_enabled: true,
        position_closed_enabled: true,
        operations_enabled: true,
    })

    const { data: config, isLoading } = useQuery({
        queryKey: ['notifications', 'email-config'],
        queryFn: () => notificationsService.getEmailConfig(),
    })

    useEffect(() => {
        if (config) {
            setEmailConfig({
                password_reset_enabled: config.password_reset_enabled ?? true,
                system_alerts_enabled: config.system_alerts_enabled ?? true,
                position_opened_enabled: config.position_opened_enabled ?? true,
                position_closed_enabled: config.position_closed_enabled ?? true,
                operations_enabled: config.operations_enabled ?? true,
            })
        }
    }, [config])

    const updateEmailConfigMutation = useMutation({
        mutationFn: (data: typeof emailConfig) => notificationsService.updateEmailConfig(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'email-config'] })
            toast.success('Configurações de email salvas com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.message || 'Erro ao salvar configurações')
        },
    })

    const handleSave = () => {
        updateEmailConfigMutation.mutate(emailConfig)
    }

    if (isLoading) {
        return (
            <Card className="glass">
                <CardContent className="py-12">
                    <Skeleton className="h-8 w-64 mb-4" />
                    <Skeleton className="h-32" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="glass">
            <CardHeader>
                <CardTitle>Configurações de Notificações por Email</CardTitle>
                <CardDescription>
                    Configure quais tipos de notificações você deseja receber por email
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <Label>Recuperação de Senha</Label>
                            <p className="text-sm text-muted-foreground">
                                Receber emails de recuperação de senha
                            </p>
                        </div>
                        <Switch
                            checked={emailConfig.password_reset_enabled}
                            onCheckedChange={(checked) => 
                                setEmailConfig(prev => ({ ...prev, password_reset_enabled: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <Label>Alertas de Sistema</Label>
                            <p className="text-sm text-muted-foreground">
                                Receber emails sobre alertas críticos do sistema
                            </p>
                        </div>
                        <Switch
                            checked={emailConfig.system_alerts_enabled}
                            onCheckedChange={(checked) => 
                                setEmailConfig(prev => ({ ...prev, system_alerts_enabled: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <Label>Posições Abertas</Label>
                            <p className="text-sm text-muted-foreground">
                                Receber emails quando uma posição for aberta
                            </p>
                        </div>
                        <Switch
                            checked={emailConfig.position_opened_enabled}
                            onCheckedChange={(checked) => 
                                setEmailConfig(prev => ({ ...prev, position_opened_enabled: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <Label>Posições Fechadas</Label>
                            <p className="text-sm text-muted-foreground">
                                Receber emails quando uma posição for fechada
                            </p>
                        </div>
                        <Switch
                            checked={emailConfig.position_closed_enabled}
                            onCheckedChange={(checked) => 
                                setEmailConfig(prev => ({ ...prev, position_closed_enabled: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <Label>Operações (Stop Loss, Take Profit)</Label>
                            <p className="text-sm text-muted-foreground">
                                Receber emails sobre operações de trading (SL, TP parcial)
                            </p>
                        </div>
                        <Switch
                            checked={emailConfig.operations_enabled}
                            onCheckedChange={(checked) => 
                                setEmailConfig(prev => ({ ...prev, operations_enabled: checked }))
                            }
                        />
                    </div>
                </div>

                <Button 
                    onClick={handleSave}
                    disabled={updateEmailConfigMutation.isPending}
                    className="w-full"
                >
                    {updateEmailConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar Configurações
                </Button>
            </CardContent>
        </Card>
    )
}

