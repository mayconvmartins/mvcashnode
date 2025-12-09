'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { 
    FileText, 
    Edit, 
    Eye as EyeIcon,
    Loader2,
    RefreshCw,
    Save
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'

export function EmailTemplatesTab() {
    const queryClient = useQueryClient()
    const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
    const [previewingTemplate, setPreviewingTemplate] = useState<string | null>(null)
    const [previewData, setPreviewData] = useState<{ rendered: string; variables: Record<string, any> } | null>(null)

    const { data: templates, isLoading } = useQuery({
        queryKey: ['admin', 'email-templates'],
        queryFn: () => adminService.getEmailTemplates(),
    })

    const updateMutation = useMutation({
        mutationFn: ({ name, content }: { name: string; content: string }) => 
            adminService.updateEmailTemplate(name, content),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'email-templates'] })
            setEditingTemplate(null)
            toast.success('Template atualizado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar template')
        },
    })

    const previewMutation = useMutation({
        mutationFn: (name: string) =>
            adminService.previewEmailTemplate(name),
        onSuccess: (data) => {
            setPreviewData({ rendered: data.rendered, variables: data.variables })
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao gerar preview')
        },
    })

    const handlePreview = (templateName: string) => {
        setPreviewingTemplate(templateName)
        previewMutation.mutate(templateName)
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
                            <CardTitle>Templates de Email</CardTitle>
                            <CardDescription>
                                Gerencie os templates HTML de email para diferentes eventos do sistema
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!templates || templates.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Nenhum template encontrado</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {templates.map((template: any) => (
                                <Card key={template.name} className="relative">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <CardTitle className="text-lg">{template.name}</CardTitle>
                                                <CardDescription>
                                                    {template.filename}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge variant="outline" className="text-xs">
                                                    {template.variables.length} variáveis
                                                </Badge>
                                                <Badge variant="outline" className="text-xs">
                                                    {Math.round(template.size / 1024)} KB
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Última modificação: {formatDateTime(template.lastModified)}
                                            </p>
                                            <p className="text-sm text-muted-foreground line-clamp-3">
                                                {template.content.substring(0, 150)}...
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handlePreview(template.name)}
                                                >
                                                    <EyeIcon className="mr-2 h-4 w-4" />
                                                    Preview
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setEditingTemplate(template.name)}
                                                >
                                                    <Edit className="mr-2 h-4 w-4" />
                                                    Editar
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Dialog de edição */}
            {editingTemplate && (
                <EmailTemplateEditorDialog
                    templateName={editingTemplate}
                    onClose={() => setEditingTemplate(null)}
                    onSave={(content) => {
                        updateMutation.mutate({ name: editingTemplate, content })
                    }}
                />
            )}

            {/* Dialog de preview */}
            {previewingTemplate && (
                <EmailTemplatePreviewDialog
                    templateName={previewingTemplate}
                    previewData={previewData}
                    onClose={() => {
                        setPreviewingTemplate(null)
                        setPreviewData(null)
                    }}
                    onRefresh={() => previewMutation.mutate(previewingTemplate)}
                    isLoading={previewMutation.isPending}
                />
            )}
        </div>
    )
}

function EmailTemplateEditorDialog({
    templateName,
    onClose,
    onSave,
}: {
    templateName: string
    onClose: () => void
    onSave: (content: string) => void
}) {
    const [content, setContent] = useState('')
    const [isLoading, setIsLoading] = useState(true)

    const { data: template } = useQuery({
        queryKey: ['admin', 'email-templates', templateName],
        queryFn: () => adminService.getEmailTemplate(templateName),
        onSuccess: (data) => {
            setContent(data.content)
            setIsLoading(false)
        },
        onError: () => {
            setIsLoading(false)
        },
    })

    return (
        <Dialog open={!!templateName} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar Template: {templateName}</DialogTitle>
                    <DialogDescription>
                        Edite o template HTML. Use variáveis no formato {'{variavel}'}.
                    </DialogDescription>
                </DialogHeader>
                {isLoading ? (
                    <Skeleton className="h-96" />
                ) : (
                    <div className="space-y-4">
                        {template?.variables && template.variables.length > 0 && (
                            <div className="p-3 bg-muted rounded-lg">
                                <Label className="text-sm font-semibold mb-2 block">Variáveis disponíveis:</Label>
                                <div className="flex flex-wrap gap-2">
                                    {template.variables.map((variable: string) => (
                                        <Badge key={variable} variant="secondary" className="text-xs font-mono">
                                            {'{'}{variable}{'}'}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Conteúdo HTML *</Label>
                            <Textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Digite o template HTML aqui..."
                                className="min-h-[400px] font-mono text-sm"
                            />
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={() => onSave(content)}
                        disabled={!content.trim() || isLoading}
                    >
                        <Save className="mr-2 h-4 w-4" />
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function EmailTemplatePreviewDialog({
    templateName,
    previewData,
    onClose,
    onRefresh,
    isLoading,
}: {
    templateName: string
    previewData: { rendered: string; variables: Record<string, any> } | null
    onClose: () => void
    onRefresh: () => void
    isLoading: boolean
}) {
    return (
        <Dialog open={!!templateName} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Preview: {templateName}</DialogTitle>
                    <DialogDescription>
                        Visualização do template renderizado com dados de exemplo
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {isLoading ? (
                        <Skeleton className="h-32" />
                    ) : previewData ? (
                        <>
                            <div className="p-4 bg-muted rounded-lg border">
                                <div 
                                    className="prose max-w-none"
                                    dangerouslySetInnerHTML={{ __html: previewData.rendered }}
                                />
                            </div>
                            <div className="text-xs text-muted-foreground">
                                <p className="font-semibold mb-2">Variáveis usadas:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(previewData.variables).map(([key, value]) => (
                                        <div key={key} className="p-2 bg-muted rounded">
                                            <code className="text-xs">{'{'}{key}{'}'}</code>
                                            <p className="text-xs mt-1">{String(value)}</p>
                                        </div>
                                    ))}
                                </div>
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
