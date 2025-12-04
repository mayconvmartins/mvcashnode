'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, Eye, Copy } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { webhooksService } from '@/lib/api/webhooks.service'
import type { WebhookSource } from '@/lib/types'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'
import { useAuth } from '@/lib/hooks/useAuth'

export default function WebhooksPage() {
    const queryClient = useQueryClient()
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
    const { user } = useAuth()
    
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue?.toLowerCase?.() === 'admin'
    })

    const { data: webhooks, isLoading } = useQuery({
        queryKey: ['webhooks'],
        queryFn: webhooksService.list,
    })

    const deleteMutation = useMutation({
        mutationFn: webhooksService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['webhooks'] })
            toast.success('Webhook excluído com sucesso!')
            setDeleteConfirmId(null)
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao excluir webhook')
        },
    })

    const copyWebhookURL = (code: string) => {
        const baseUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL || window.location.origin
        const url = `${baseUrl}/webhooks/${code}`
        navigator.clipboard.writeText(url)
        toast.success('URL copiada para a área de transferência!')
    }

    const columns: Column<WebhookSource>[] = [
        {
            key: 'label',
            label: 'Nome',
            render: (webhook) => (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{webhook.label}</span>
                    {webhook.is_shared && (
                        <Badge variant="outline" className="text-xs">
                            {webhook.is_owner ? 'Compartilhado' : 'Vinculado'}
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            key: 'webhook_code',
            label: 'Código',
            render: (webhook) => (
                <div className="flex items-center gap-2">
                    {webhook.webhook_code ? (
                        <>
                            <span className="font-mono text-sm">{webhook.webhook_code}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyWebhookURL(webhook.webhook_code!)}
                            >
                                <Copy className="h-3 w-3" />
                            </Button>
                        </>
                    ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                    )}
                </div>
            ),
        },
        {
            key: 'trade_mode',
            label: 'Modo',
            render: (webhook) => (
                <Badge variant={webhook.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                    {webhook.trade_mode}
                </Badge>
            ),
        },
        {
            key: 'is_active',
            label: 'Status',
            render: (webhook) => (
                <Badge variant={webhook.is_active ? 'success' : 'secondary'}>
                    {webhook.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
            ),
        },
        {
            key: 'rate_limit_per_min',
            label: 'Rate Limit',
            render: (webhook) => <span className="text-sm">{webhook.rate_limit_per_min}/min</span>,
        },
        {
            key: 'created_at',
            label: 'Criado em',
            render: (webhook) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(webhook.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (webhook) => {
                const isOwner = webhook.is_owner !== false // Default true se não especificado
                const canEdit = isOwner && webhook.webhook_code // Só pode editar se for dono e tiver código
                
                return (
                    <div className="flex items-center gap-1">
                        {canEdit ? (
                            <>
                                <Link href={`/webhooks/${webhook.id}`}>
                                    <Button variant="ghost" size="sm" title="Ver Detalhes">
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </Link>
                                <Link href={`/webhooks/${webhook.id}/edit`}>
                                    <Button variant="ghost" size="sm" title="Editar">
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                </Link>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeleteConfirmId(webhook.id)}
                                    disabled={deleteMutation.isPending}
                                    title="Excluir"
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </>
                        ) : (
                            <span className="text-sm text-muted-foreground">Sem permissão</span>
                        )}
                    </div>
                )
            },
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Webhooks</h1>
                    <p className="text-muted-foreground mt-1">Gerencie seus webhooks de trading</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/webhooks/events">
                        <Button variant="outline">
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Eventos
                        </Button>
                    </Link>
                    <Link href="/webhooks/new">
                        <Button variant="gradient">
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Webhook
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todos os Webhooks</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={webhooks || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <p className="text-lg font-medium mb-2">Nenhum webhook cadastrado</p>
                                <p className="text-muted-foreground mb-4">
                                    Comece criando seu primeiro webhook
                                </p>
                                <Link href="/webhooks/new">
                                    <Button variant="gradient">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Criar Webhook
                                    </Button>
                                </Link>
                            </div>
                        }
                    />
                </CardContent>
            </Card>

            {/* Delete Confirmation */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
                <DialogContent>
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Confirmar Exclusão</h3>
                        <p className="text-sm text-muted-foreground">
                            Tem certeza que deseja excluir este webhook? Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

