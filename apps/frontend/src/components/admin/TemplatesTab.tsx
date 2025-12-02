'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsService, type NotificationTemplateType, type WhatsAppNotificationTemplate, type CreateTemplateDto } from '@/lib/api/notifications.service'
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
import { toast } from 'sonner'
import { 
    FileText, 
    Edit, 
    Trash2, 
    Copy, 
    Play, 
    Eye as EyeIcon,
    Loader2,
    CheckCircle,
    XCircle,
    RefreshCw
} from 'lucide-react'

const TEMPLATE_TYPES: { value: NotificationTemplateType; label: string }[] = [
    { value: 'WEBHOOK_RECEIVED', label: 'Webhook Recebido' },
    { value: 'TEST_MESSAGE', label: 'Mensagem de Teste' },
    { value: 'POSITION_OPENED', label: 'Posição Aberta' },
    { value: 'POSITION_CLOSED', label: 'Posição Fechada' },
    { value: 'STOP_LOSS_TRIGGERED', label: 'Stop Loss Acionado' },
    { value: 'PARTIAL_TP_TRIGGERED', label: 'Take Profit Parcial' },
]

export function TemplatesTab() {
    const queryClient = useQueryClient()
    const [selectedType, setSelectedType] = useState<NotificationTemplateType | 'ALL'>('ALL')
    const [editingTemplate, setEditingTemplate] = useState<WhatsAppNotificationTemplate | null>(null)
    const [deletingTemplate, setDeletingTemplate] = useState<WhatsAppNotificationTemplate | null>(null)
    const [previewingTemplate, setPreviewingTemplate] = useState<WhatsAppNotificationTemplate | null>(null)
    const [previewData, setPreviewData] = useState<{ rendered: string; variables: Record<string, any> } | null>(null)

    const { data: templates, isLoading } = useQuery({
        queryKey: ['notifications', 'templates'],
        queryFn: () => notificationsService.getTemplates(),
    })

    const filteredTemplates = templates?.filter(t => 
        selectedType === 'ALL' || t.template_type === selectedType
    ) || []

    const createMutation = useMutation({
        mutationFn: (data: CreateTemplateDto) => notificationsService.createTemplate(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] })
            setEditingTemplate(null)
            toast.success('Template criado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao criar template')
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<CreateTemplateDto> }) => 
            notificationsService.updateTemplate(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] })
            setEditingTemplate(null)
            toast.success('Template atualizado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar template')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: (id: number) => notificationsService.deleteTemplate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] })
            setDeletingTemplate(null)
            toast.success('Template deletado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao deletar template')
        },
    })

    const setActiveMutation = useMutation({
        mutationFn: (id: number) => notificationsService.setTemplateActive(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] })
            toast.success('Template ativado!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao ativar template')
        },
    })

    const previewMutation = useMutation({
        mutationFn: ({ id, variables }: { id: number; variables?: Record<string, any> }) =>
            notificationsService.previewTemplate(id, variables),
        onSuccess: (data) => {
            setPreviewData({ rendered: data.rendered, variables: data.variables })
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao gerar preview')
        },
    })

    const handlePreview = (template: WhatsAppNotificationTemplate) => {
        setPreviewingTemplate(template)
        previewMutation.mutate({ id: template.id })
    }

    const handleDuplicate = (template: WhatsAppNotificationTemplate) => {
        const newTemplate: CreateTemplateDto = {
            template_type: template.template_type,
            name: `${template.name} (Cópia)`,
            subject: template.subject || undefined,
            body: template.body,
            variables_json: template.variables_json,
            is_active: false,
        }
        createMutation.mutate(newTemplate)
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-64" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <Card className="glass">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Templates de Notificação</CardTitle>
                            <CardDescription>
                                Gerencie os templates de mensagens WhatsApp para diferentes eventos
                            </CardDescription>
                        </div>
                        <Button onClick={() => setEditingTemplate({} as WhatsAppNotificationTemplate)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Novo Template
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filtro por tipo */}
                    <div className="flex items-center gap-2">
                        <Label>Filtrar por tipo:</Label>
                        <Select value={selectedType} onValueChange={(v) => setSelectedType(v as any)}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos</SelectItem>
                                {TEMPLATE_TYPES.map(type => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Lista de templates */}
                    {filteredTemplates.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum template encontrado</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {filteredTemplates.map((template) => (
                                <Card key={template.id} className="relative">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <CardTitle className="text-lg">{template.name}</CardTitle>
                                                <CardDescription>
                                                    {TEMPLATE_TYPES.find(t => t.value === template.template_type)?.label}
                                                </CardDescription>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {template.is_active ? (
                                                    <Badge variant="default" className="bg-green-500">
                                                        <CheckCircle className="mr-1 h-3 w-3" />
                                                        Ativo
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary">
                                                        <XCircle className="mr-1 h-3 w-3" />
                                                        Inativo
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                                            {template.body.substring(0, 150)}...
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handlePreview(template)}
                                            >
                                                <EyeIcon className="mr-2 h-4 w-4" />
                                                Preview
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setEditingTemplate(template)}
                                            >
                                                <Edit className="mr-2 h-4 w-4" />
                                                Editar
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDuplicate(template)}
                                            >
                                                <Copy className="mr-2 h-4 w-4" />
                                                Duplicar
                                            </Button>
                                            {!template.is_active && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setActiveMutation.mutate(template.id)}
                                                    disabled={setActiveMutation.isPending}
                                                >
                                                    <Play className="mr-2 h-4 w-4" />
                                                    Ativar
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setDeletingTemplate(template)}
                                                className="text-destructive"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Deletar
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Dialog de edição/criação */}
            {editingTemplate !== null && (
                <TemplateEditorDialog
                    template={editingTemplate}
                    onClose={() => setEditingTemplate(null)}
                    onSave={(data) => {
                        if (editingTemplate.id) {
                            updateMutation.mutate({ id: editingTemplate.id, data })
                        } else {
                            createMutation.mutate(data as CreateTemplateDto)
                        }
                    }}
                />
            )}

            {/* Dialog de preview */}
            {previewingTemplate && (
                <PreviewDialog
                    template={previewingTemplate}
                    previewData={previewData}
                    onClose={() => {
                        setPreviewingTemplate(null)
                        setPreviewData(null)
                    }}
                    onRefresh={() => previewMutation.mutate({ id: previewingTemplate.id })}
                    isLoading={previewMutation.isPending}
                />
            )}

            {/* Dialog de confirmação de deleção */}
            {deletingTemplate && (
                <AlertDialog open={!!deletingTemplate} onOpenChange={() => setDeletingTemplate(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>
                                Tem certeza que deseja deletar o template "{deletingTemplate.name}"? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteMutation.mutate(deletingTemplate.id)}
                                className="bg-destructive text-destructive-foreground"
                            >
                                Deletar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    )
}

function TemplateEditorDialog({
    template,
    onClose,
    onSave,
}: {
    template: WhatsAppNotificationTemplate | null
    onClose: () => void
    onSave: (data: any) => void
}) {
    const [formData, setFormData] = useState({
        template_type: (template?.template_type || 'WEBHOOK_RECEIVED') as NotificationTemplateType,
        name: template?.name || '',
        subject: template?.subject || '',
        body: template?.body || '',
        is_active: template?.is_active ?? false,
    })

    return (
        <Dialog open={!!template} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {template?.id ? 'Editar Template' : 'Novo Template'}
                    </DialogTitle>
                    <DialogDescription>
                        Configure o template de notificação. Use variáveis no formato {'{variavel}'}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Tipo de Template *</Label>
                            <Select
                                value={formData.template_type}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, template_type: v as NotificationTemplateType }))}
                                disabled={!!template?.id}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEMPLATE_TYPES.map(type => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Nome *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Nome do template"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Assunto (opcional)</Label>
                        <Input
                            value={formData.subject}
                            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                            placeholder="Assunto da mensagem"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Corpo da Mensagem *</Label>
                        <Textarea
                            value={formData.body}
                            onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                            placeholder="Digite o template aqui. Use {variavel} para variáveis."
                            className="min-h-[300px] font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Variáveis disponíveis serão mostradas após salvar o template.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={() => onSave(formData)}>
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function PreviewDialog({
    template,
    previewData,
    onClose,
    onRefresh,
    isLoading,
}: {
    template: WhatsAppNotificationTemplate
    previewData: { rendered: string; variables: Record<string, any> } | null
    onClose: () => void
    onRefresh: () => void
    isLoading: boolean
}) {
    return (
        <Dialog open={!!template} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Preview: {template.name}</DialogTitle>
                    <DialogDescription>
                        Visualização do template renderizado com dados de exemplo
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {isLoading ? (
                        <Skeleton className="h-32" />
                    ) : previewData ? (
                        <>
                            <div className="p-4 bg-muted rounded-lg">
                                <pre className="whitespace-pre-wrap text-sm">{previewData.rendered}</pre>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                <p className="font-semibold mb-2">Variáveis usadas:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    {Object.entries(previewData.variables).map(([key, value]) => (
                                        <li key={key}>
                                            <code>{'{'}{key}{'}'}</code>: {String(value)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    ) : (
                        <p className="text-muted-foreground">Clique em "Atualizar" para gerar o preview</p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
                        {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Atualizar Preview
                    </Button>
                    <Button onClick={onClose}>
                        Fechar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

