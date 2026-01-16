'use client'

import { useState, useEffect, useMemo } from 'react'
import { sanitizePreviewHtml } from '@/lib/utils/sanitize'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsService, type NotificationTemplateType, type NotificationChannel, type UnifiedTemplate, type UnifiedTemplateListItem } from '@/lib/api/notifications.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { 
    FileText, 
    Edit, 
    RefreshCw,
    Save,
    Eye as EyeIcon,
    Loader2,
    CheckCircle,
    XCircle,
    MessageSquare,
    Mail,
    Bell,
    RotateCcw,
    Code2,
    Sparkles,
    Smartphone,
    Monitor,
    Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Tipos de template disponíveis
const TEMPLATE_TYPES: { value: NotificationTemplateType; label: string; description: string }[] = [
    { value: 'WEBHOOK_RECEIVED', label: 'Webhook Recebido', description: 'Quando um webhook é recebido' },
    { value: 'POSITION_OPENED', label: 'Posição Aberta', description: 'Quando uma posição é aberta' },
    { value: 'POSITION_CLOSED', label: 'Posição Fechada', description: 'Quando uma posição é fechada' },
    { value: 'POSITION_ERROR', label: 'Erro na Posição', description: 'Quando ocorre erro na posição' },
    { value: 'SL_HIT', label: 'Stop Loss Atingido', description: 'Quando o Stop Loss é acionado' },
    { value: 'TP_HIT', label: 'Take Profit Atingido', description: 'Quando o Take Profit é acionado' },
    { value: 'SG_HIT', label: 'Stop Gain Atingido', description: 'Quando o Stop Gain é acionado' },
    { value: 'TSG_HIT', label: 'Trailing Stop Gain', description: 'Quando o Trailing Stop Gain é acionado' },
    { value: 'TRADE_ERROR', label: 'Erro no Trade', description: 'Quando ocorre erro no trade' },
    { value: 'PASSWORD_RESET', label: 'Recuperação de Senha', description: 'Email de recuperação de senha' },
    { value: 'WELCOME', label: 'Boas-vindas', description: 'Email de boas-vindas' },
    { value: 'SUBSCRIPTION_ACTIVATED', label: 'Assinatura Ativada', description: 'Quando a assinatura é ativada' },
    { value: 'SUBSCRIPTION_EXPIRING', label: 'Assinatura Expirando', description: 'Aviso de expiração' },
    { value: 'SUBSCRIPTION_EXPIRED', label: 'Assinatura Expirada', description: 'Quando a assinatura expira' },
    { value: 'TEST_MESSAGE', label: 'Mensagem de Teste', description: 'Template para testes' },
]

// Canais disponíveis
const CHANNELS: { value: NotificationChannel; label: string; icon: any; color: string }[] = [
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-500' },
    { value: 'email', label: 'Email', icon: Mail, color: 'text-blue-500' },
    { value: 'webpush', label: 'Web Push', icon: Bell, color: 'text-purple-500' },
]

export function UnifiedTemplatesTab() {
    const queryClient = useQueryClient()
    const [selectedChannel, setSelectedChannel] = useState<NotificationChannel>('whatsapp')
    const [selectedType, setSelectedType] = useState<NotificationTemplateType | 'ALL'>('ALL')
    const [editingTemplate, setEditingTemplate] = useState<{
        templateType: NotificationTemplateType
        channel: NotificationChannel
    } | null>(null)
    const [resetingTemplate, setResetingTemplate] = useState<{
        templateType: NotificationTemplateType
        channel: NotificationChannel
        name: string
    } | null>(null)

    // Query para listar templates
    const { data: templates, isLoading } = useQuery({
        queryKey: ['unified-templates', selectedChannel],
        queryFn: () => notificationsService.unified.listTemplates(selectedChannel),
    })

    // Filtrar templates por tipo
    const filteredTemplates = useMemo(() => {
        if (!templates) return []
        if (selectedType === 'ALL') return templates
        return templates.filter(t => t.templateType === selectedType)
    }, [templates, selectedType])

    // Mutation para resetar template
    const resetMutation = useMutation({
        mutationFn: ({ templateType, channel }: { templateType: NotificationTemplateType; channel: NotificationChannel }) =>
            notificationsService.unified.resetTemplate(templateType, channel),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['unified-templates'] })
            setResetingTemplate(null)
            toast.success('Template restaurado para o padrão!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao resetar template')
        },
    })

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-48" />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header com canais */}
            <Card className="glass">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                Templates de Notificação Unificados
                            </CardTitle>
                            <CardDescription>
                                Gerencie templates para WhatsApp, Email e Web Push em um só lugar
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Tabs de Canal */}
                    <Tabs value={selectedChannel} onValueChange={(v) => setSelectedChannel(v as NotificationChannel)}>
                        <TabsList className="grid w-full grid-cols-3 mb-6">
                            {CHANNELS.map((channel) => {
                                const Icon = channel.icon
                                return (
                                    <TabsTrigger key={channel.value} value={channel.value} className="flex items-center gap-2">
                                        <Icon className={cn("h-4 w-4", channel.color)} />
                                        {channel.label}
                                    </TabsTrigger>
                                )
                            })}
                        </TabsList>

                        {CHANNELS.map((channel) => (
                            <TabsContent key={channel.value} value={channel.value}>
                                {/* Filtro por tipo */}
                                <div className="flex items-center gap-4 mb-6">
                                    <Label className="text-sm font-medium">Filtrar por tipo:</Label>
                                    <Select 
                                        value={selectedType} 
                                        onValueChange={(v) => setSelectedType(v as NotificationTemplateType | 'ALL')}
                                    >
                                        <SelectTrigger className="w-[250px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">Todos os tipos</SelectItem>
                                            {TEMPLATE_TYPES.map(type => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="text-sm text-muted-foreground">
                                        {filteredTemplates.length} template(s) encontrado(s)
                                    </div>
                                </div>

                                {/* Grid de templates */}
                                {filteredTemplates.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p>Nenhum template encontrado para este canal</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredTemplates.map((template) => (
                                            <TemplateCard
                                                key={`${template.templateType}-${template.channel}`}
                                                template={template}
                                                onEdit={() => setEditingTemplate({
                                                    templateType: template.templateType,
                                                    channel: template.channel,
                                                })}
                                                onReset={template.isCustom ? () => setResetingTemplate({
                                                    templateType: template.templateType,
                                                    channel: template.channel,
                                                    name: template.name,
                                                }) : undefined}
                                            />
                                        ))}
                                    </div>
                                )}
                            </TabsContent>
                        ))}
                    </Tabs>
                </CardContent>
            </Card>

            {/* Dialog de edição */}
            {editingTemplate && (
                <TemplateEditorDialog
                    templateType={editingTemplate.templateType}
                    channel={editingTemplate.channel}
                    onClose={() => setEditingTemplate(null)}
                    onSave={() => {
                        queryClient.invalidateQueries({ queryKey: ['unified-templates'] })
                        setEditingTemplate(null)
                    }}
                />
            )}

            {/* Dialog de confirmação de reset */}
            {resetingTemplate && (
                <AlertDialog open={!!resetingTemplate} onOpenChange={() => setResetingTemplate(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Restaurar template padrão?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja restaurar o template "{resetingTemplate.name}" para o valor padrão?
                                <br /><br />
                                Esta ação irá remover todas as customizações feitas.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => resetMutation.mutate({
                                    templateType: resetingTemplate.templateType,
                                    channel: resetingTemplate.channel,
                                })}
                                disabled={resetMutation.isPending}
                            >
                                {resetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Restaurar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    )
}

// Componente de card de template
function TemplateCard({
    template,
    onEdit,
    onReset,
}: {
    template: UnifiedTemplateListItem
    onEdit: () => void
    onReset?: () => void
}) {
    const typeInfo = TEMPLATE_TYPES.find(t => t.value === template.templateType)

    return (
        <Card className="relative hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{template.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                            {typeInfo?.description || template.templateType}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                        {template.isCustom ? (
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                                <Sparkles className="mr-1 h-3 w-3" />
                                Custom
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="text-xs">
                                Padrão
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onEdit}
                        className="flex-1"
                    >
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                    </Button>
                    {onReset && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onReset}
                            className="text-orange-500 hover:text-orange-600"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

// Dialog de edição de template
function TemplateEditorDialog({
    templateType,
    channel,
    onClose,
    onSave,
}: {
    templateType: NotificationTemplateType
    channel: NotificationChannel
    onClose: () => void
    onSave: () => void
}) {
    const queryClient = useQueryClient()
    const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
    const [formData, setFormData] = useState({
        name: '',
        subject: '',
        body: '',
        bodyHtml: '',
        iconUrl: '',
        actionUrl: '',
        isActive: true,
    })
    const [previewData, setPreviewData] = useState<{
        subject?: string
        body: string
        bodyHtml?: string
        variables: Record<string, any>
    } | null>(null)

    const typeInfo = TEMPLATE_TYPES.find(t => t.value === templateType)
    const channelInfo = CHANNELS.find(c => c.value === channel)

    // Query para carregar o template
    const { data: template, isLoading } = useQuery({
        queryKey: ['unified-template', templateType, channel],
        queryFn: () => notificationsService.unified.getTemplate(templateType, channel),
        enabled: !!templateType && !!channel,
    })

    // Atualizar form quando template carregar
    useEffect(() => {
        if (template) {
            setFormData({
                name: template.name || '',
                subject: template.subject || '',
                body: template.body || '',
                bodyHtml: template.bodyHtml || '',
                iconUrl: template.iconUrl || '',
                actionUrl: template.actionUrl || '',
                isActive: template.isActive ?? true,
            })
        }
    }, [template])

    // Mutation para salvar
    const saveMutation = useMutation({
        mutationFn: () => notificationsService.unified.saveTemplate({
            templateType,
            channel,
            name: formData.name,
            subject: formData.subject || undefined,
            body: formData.body,
            bodyHtml: formData.bodyHtml || undefined,
            iconUrl: formData.iconUrl || undefined,
            actionUrl: formData.actionUrl || undefined,
            isActive: formData.isActive,
        }),
        onSuccess: () => {
            toast.success('Template salvo com sucesso!')
            queryClient.invalidateQueries({ queryKey: ['unified-templates'] })
            onSave()
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao salvar template')
        },
    })

    // Mutation para preview
    const previewMutation = useMutation({
        mutationFn: () => notificationsService.unified.previewTemplate(
            templateType,
            channel,
            formData.body,
            formData.subject
        ),
        onSuccess: (data) => {
            setPreviewData(data)
            setActiveTab('preview')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao gerar preview')
        },
    })

    const ChannelIcon = channelInfo?.icon || Bell

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ChannelIcon className={cn("h-5 w-5", channelInfo?.color)} />
                        Editar Template: {typeInfo?.label || templateType}
                    </DialogTitle>
                    <DialogDescription>
                        Configure o template de {channelInfo?.label}. Use variáveis no formato {'{variável}'}.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </div>
                ) : (
                    <>
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="edit" className="flex items-center gap-2">
                                    <Code2 className="h-4 w-4" />
                                    Editar
                                </TabsTrigger>
                                <TabsTrigger value="preview" className="flex items-center gap-2">
                                    <EyeIcon className="h-4 w-4" />
                                    Preview
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="edit" className="space-y-4 mt-4">
                                {/* Nome */}
                                <div className="space-y-2">
                                    <Label>Nome do Template *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Ex: Posição Aberta - Custom"
                                    />
                                </div>

                                {/* Assunto (para email e webpush) */}
                                {(channel === 'email' || channel === 'webpush') && (
                                    <div className="space-y-2">
                                        <Label>Assunto / Título</Label>
                                        <Input
                                            value={formData.subject}
                                            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                                            placeholder="Ex: MVCash - Posição Aberta: {symbol}"
                                        />
                                    </div>
                                )}

                                {/* Corpo da mensagem */}
                                <div className="space-y-2">
                                    <Label>Corpo da Mensagem *</Label>
                                    <Textarea
                                        value={formData.body}
                                        onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                                        placeholder={channel === 'whatsapp' 
                                            ? "Use *negrito*, _itálico_, ~tachado~, e ```código```"
                                            : "Digite o conteúdo da mensagem..."
                                        }
                                        className="min-h-[200px] font-mono text-sm"
                                    />
                                </div>

                                {/* HTML (apenas para email) */}
                                {channel === 'email' && (
                                    <div className="space-y-2">
                                        <Label>Corpo HTML (opcional)</Label>
                                        <Textarea
                                            value={formData.bodyHtml}
                                            onChange={(e) => setFormData(prev => ({ ...prev, bodyHtml: e.target.value }))}
                                            placeholder="<h2>Título</h2><p>Conteúdo HTML...</p>"
                                            className="min-h-[150px] font-mono text-sm"
                                        />
                                    </div>
                                )}

                                {/* Campos específicos de webpush */}
                                {channel === 'webpush' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>URL do Ícone</Label>
                                            <Input
                                                value={formData.iconUrl}
                                                onChange={(e) => setFormData(prev => ({ ...prev, iconUrl: e.target.value }))}
                                                placeholder="/icons/icon-192x192.png"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>URL de Ação (ao clicar)</Label>
                                            <Input
                                                value={formData.actionUrl}
                                                onChange={(e) => setFormData(prev => ({ ...prev, actionUrl: e.target.value }))}
                                                placeholder="/positions"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Variáveis disponíveis */}
                                {template?.variables && template.variables.length > 0 && (
                                    <div className="p-4 bg-muted/50 rounded-lg border">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Info className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-sm font-medium">Variáveis disponíveis:</Label>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {template.variables.map((variable) => (
                                                <Badge
                                                    key={variable}
                                                    variant="outline"
                                                    className="font-mono text-xs cursor-pointer hover:bg-primary/10"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`{${variable}}`)
                                                        toast.success(`{${variable}} copiado!`)
                                                    }}
                                                >
                                                    {'{' + variable + '}'}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="preview" className="mt-4">
                                {previewData ? (
                                    <div className="space-y-4">
                                        {/* Preview de acordo com o canal */}
                                        {channel === 'whatsapp' && (
                                            <WhatsAppPreview 
                                                body={previewData.body}
                                            />
                                        )}

                                        {channel === 'email' && (
                                            <EmailPreview
                                                subject={previewData.subject}
                                                body={previewData.body}
                                                bodyHtml={previewData.bodyHtml}
                                            />
                                        )}

                                        {channel === 'webpush' && (
                                            <WebPushPreview
                                                title={previewData.subject || 'MVCash'}
                                                body={previewData.body}
                                                iconUrl={formData.iconUrl}
                                            />
                                        )}

                                        {/* Variáveis usadas */}
                                        <div className="p-4 bg-muted/50 rounded-lg border">
                                            <Label className="text-sm font-medium mb-2 block">Variáveis de exemplo:</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(previewData.variables).map(([key, value]) => (
                                                    <div key={key} className="text-xs p-2 bg-background rounded">
                                                        <span className="font-mono text-primary">{'{' + key + '}'}</span>
                                                        <span className="text-muted-foreground ml-2">→ {String(value)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <EyeIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p>Clique em "Gerar Preview" para visualizar o template</p>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>

                        <DialogFooter className="flex-col sm:flex-row gap-2">
                            <Button
                                variant="outline"
                                onClick={() => previewMutation.mutate()}
                                disabled={previewMutation.isPending || !formData.body}
                            >
                                {previewMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <EyeIcon className="mr-2 h-4 w-4" />
                                )}
                                Gerar Preview
                            </Button>
                            <div className="flex gap-2 flex-1 justify-end">
                                <Button variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                                <Button 
                                    onClick={() => saveMutation.mutate()}
                                    disabled={saveMutation.isPending || !formData.name || !formData.body}
                                >
                                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    Salvar
                                </Button>
                            </div>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

// Preview de WhatsApp
function WhatsAppPreview({ body }: { body: string }) {
    // Simular formatação do WhatsApp
    const formattedBody = body
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/~([^~]+)~/g, '<del>$1</del>')
        .replace(/```([^`]+)```/g, '<code class="block bg-black/10 p-2 rounded my-1">$1</code>')
        .replace(/\n/g, '<br/>')

    return (
        <div className="bg-[#e5ddd5] dark:bg-[#0b141a] p-4 rounded-lg">
            <div className="flex justify-end">
                <div className="bg-[#dcf8c6] dark:bg-[#005c4b] text-black dark:text-white p-3 rounded-lg max-w-[80%] shadow-sm">
                    <div 
                        className="text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(formattedBody) }}
                    />
                    <div className="text-[10px] text-black/50 dark:text-white/50 text-right mt-1">
                        {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>
        </div>
    )
}

// Preview de Email
function EmailPreview({ 
    subject, 
    body, 
    bodyHtml 
}: { 
    subject?: string
    body: string
    bodyHtml?: string 
}) {
    return (
        <div className="border rounded-lg overflow-hidden">
            {/* Header do email */}
            <div className="bg-muted p-4 border-b">
                <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Preview do Email</span>
                </div>
                {subject && (
                    <div className="text-sm">
                        <span className="text-muted-foreground">Assunto:</span>{' '}
                        <span className="font-medium">{subject}</span>
                    </div>
                )}
            </div>
            {/* Corpo do email */}
            <div className="p-4 bg-white dark:bg-zinc-900 min-h-[200px]">
                {bodyHtml ? (
                    <div 
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(bodyHtml) }}
                    />
                ) : (
                    <pre className="whitespace-pre-wrap text-sm font-sans">{body}</pre>
                )}
            </div>
        </div>
    )
}

// Preview de Web Push
function WebPushPreview({ 
    title, 
    body, 
    iconUrl 
}: { 
    title: string
    body: string
    iconUrl?: string 
}) {
    return (
        <div className="space-y-4">
            {/* Desktop preview */}
            <div>
                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                    <Monitor className="h-4 w-4" />
                    Desktop
                </div>
                <div className="bg-zinc-800 text-white p-4 rounded-lg shadow-lg max-w-sm">
                    <div className="flex gap-3">
                        <div className="shrink-0">
                            <img 
                                src={iconUrl || '/icons/icon-72x72.png'} 
                                alt="icon" 
                                className="w-12 h-12 rounded"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = '/icons/icon-72x72.png'
                                }}
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="font-semibold text-sm">{title}</div>
                            <div className="text-xs text-zinc-400">app.mvcash.com.br</div>
                            <div className="text-sm mt-1 text-zinc-200 line-clamp-3">{body}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile preview */}
            <div>
                <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                    <Smartphone className="h-4 w-4" />
                    Mobile
                </div>
                <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-xl max-w-xs">
                    <div className="flex items-start gap-3">
                        <img 
                            src={iconUrl || '/icons/icon-72x72.png'} 
                            alt="icon" 
                            className="w-10 h-10 rounded-lg"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = '/icons/icon-72x72.png'
                            }}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm">{title}</span>
                                <span className="text-xs text-muted-foreground">agora</span>
                            </div>
                            <div className="text-sm text-muted-foreground line-clamp-2">{body}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

