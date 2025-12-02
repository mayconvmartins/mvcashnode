'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, Eye, Wallet } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { VaultForm } from '@/components/vaults/VaultForm'
import { vaultsService } from '@/lib/api/vaults.service'
import { useTradeMode } from '@/lib/hooks/useTradeMode'
import type { Vault } from '@/lib/types'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime } from '@/lib/utils/format'

export default function VaultsPage() {
    const queryClient = useQueryClient()
    const { tradeMode } = useTradeMode()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingVault, setEditingVault] = useState<Vault | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

    const { data: vaults, isLoading } = useQuery({
        queryKey: ['vaults', tradeMode],
        queryFn: () => vaultsService.list({ trade_mode: tradeMode }),
    })

    const deleteMutation = useMutation({
        mutationFn: vaultsService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vaults'] })
            toast.success('Cofre excluído com sucesso!')
            setDeleteConfirmId(null)
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao excluir cofre')
        },
    })

    const handleEdit = (vault: Vault) => {
        setEditingVault(vault)
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
        setEditingVault(null)
    }

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id)
    }

    const columns: Column<Vault>[] = [
        {
            key: 'label',
            label: 'Nome',
            render: (vault) => (
                <div>
                    <span className="font-medium">{vault.label}</span>
                    {vault.description && (
                        <p className="text-sm text-muted-foreground">{vault.description}</p>
                    )}
                </div>
            ),
        },
        {
            key: 'exchange_account_id',
            label: 'Conta',
            render: (vault) => <span className="text-sm">Conta ID: {vault.exchange_account_id}</span>,
        },
        {
            key: 'trade_mode',
            label: 'Modo',
            render: (vault) => (
                <Badge variant={vault.trade_mode === 'REAL' ? 'destructive' : 'secondary'}>
                    {vault.trade_mode}
                </Badge>
            ),
        },
        {
            key: 'balance',
            label: 'Saldo Total',
            render: (vault) => (
                <span className="font-mono font-medium">{formatCurrency(vault.total_balance_usd || 0)}</span>
            ),
        },
        {
            key: 'created_at',
            label: 'Criado em',
            render: (vault) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(vault.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (vault) => (
                <div className="flex items-center gap-2">
                    <Link href={`/vaults/${vault.id}`}>
                        <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                        </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(vault)}>
                        <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(vault.id)}
                        disabled={deleteMutation.isPending}
                    >
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Cofres Virtuais</h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie seus cofres virtuais para controle de saldo
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ModeToggle />
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="gradient" onClick={() => setEditingVault(null)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Novo Cofre
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingVault ? 'Editar Cofre' : 'Novo Cofre Virtual'}
                                </DialogTitle>
                                <DialogDescription>
                                    {editingVault
                                        ? 'Atualize as informações do cofre'
                                        : 'Crie um novo cofre virtual para gerenciar saldos'}
                                </DialogDescription>
                            </DialogHeader>
                            <VaultForm vault={editingVault} onSuccess={handleCloseDialog} />
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todos os Cofres - {tradeMode}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={vaults || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-lg font-medium mb-2">Nenhum cofre cadastrado</p>
                                <p className="text-muted-foreground mb-4">
                                    Comece criando seu primeiro cofre virtual
                                </p>
                                <Button onClick={() => setIsDialogOpen(true)} variant="gradient">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Criar Cofre
                                </Button>
                            </div>
                        }
                    />
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Exclusão</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja excluir este cofre? Esta ação não pode ser desfeita.
                            Todos os saldos e transações associados serão perdidos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

