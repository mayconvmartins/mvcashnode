'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, TestTube, Wallet, RefreshCw, TrendingUp, MoreVertical, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AccountForm } from '@/components/accounts/AccountForm'
import { TestConnectionButton } from '@/components/accounts/TestConnectionButton'
import { accountsService } from '@/lib/api/accounts.service'
import { subscriptionsService } from '@/lib/api/subscriptions.service'
import type { ExchangeAccount } from '@/lib/types'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'
import { useAuthStore } from '@/lib/stores/authStore'

export default function AccountsPage() {
    const queryClient = useQueryClient()
    const { user } = useAuthStore()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingAccount, setEditingAccount] = useState<ExchangeAccount | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
    
    // Verificar se é assinante
    const isSubscriber = user?.roles?.some((r: any) => r.role === 'subscriber')
    const isAdmin = user?.roles?.some((r: any) => r.role === 'admin')
    const isSubscriberOnly = isSubscriber && !isAdmin

    const { data: accounts, isLoading } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsService.list,
    })
    
    // Buscar plano do assinante para verificar limite de contas
    const { data: myPlan } = useQuery({
        queryKey: ['my-plan'],
        queryFn: subscriptionsService.getMyPlan,
        enabled: isSubscriberOnly, // Só buscar se for assinante
    })
    
    // Calcular se atingiu limite de contas
    const maxAccounts = myPlan?.plan?.max_exchange_accounts
    const currentAccountsCount = accounts?.length || 0
    const hasReachedLimit = maxAccounts !== null && maxAccounts !== undefined && currentAccountsCount >= maxAccounts
    const canAddAccount = !isSubscriberOnly || !hasReachedLimit

    const deleteMutation = useMutation({
        mutationFn: accountsService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Conta excluída com sucesso!')
            setDeleteConfirmId(null)
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao excluir conta')
        },
    })

    const syncBalancesMutation = useMutation({
        mutationFn: accountsService.syncBalances,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            toast.success('Saldos sincronizados com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao sincronizar saldos')
        },
    })

    const syncPositionsMutation = useMutation({
        mutationFn: accountsService.syncPositions,
        onSuccess: () => {
            toast.success('Posições sincronizadas com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || 'Falha ao sincronizar posições')
        },
    })

    const handleEdit = (account: ExchangeAccount) => {
        setEditingAccount(account)
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
        setEditingAccount(null)
    }

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id)
    }

    const columns: Column<ExchangeAccount>[] = [
        {
            key: 'label',
            label: 'Nome',
            render: (account) => <span className="font-medium">{account.label}</span>,
        },
        {
            key: 'exchange',
            label: 'Exchange',
            render: (account) => (
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{account.exchange}</Badge>
                    {account.testnet && (
                        <Badge variant="warning" className="text-xs">
                            TESTNET
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            key: 'trade_mode',
            label: 'Modo',
            render: (account) => (
                <Badge variant={account.is_simulation ? 'secondary' : 'destructive'}>
                    {account.is_simulation ? 'SIMULATION' : 'REAL'}
                </Badge>
            ),
        },
        {
            key: 'is_active',
            label: 'Status',
            render: (account) => (
                <Badge variant={account.is_active ? 'success' : 'secondary'}>
                    {account.is_active ? 'Ativa' : 'Inativa'}
                </Badge>
            ),
        },
        {
            key: 'created_at',
            label: 'Criada em',
            render: (account) => (
                <span className="text-sm text-muted-foreground">{formatDateTime(account.created_at)}</span>
            ),
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (account) => (
                <div className="flex items-center gap-2">
                    <TestConnectionButton accountId={account.id} />
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleEdit(account)}
                        title="Editar conta"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações da Conta</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => syncBalancesMutation.mutate(account.id)}
                                disabled={syncBalancesMutation.isPending}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Sincronizar Saldos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => syncPositionsMutation.mutate(account.id)}
                                disabled={syncPositionsMutation.isPending}
                            >
                                <TrendingUp className="h-4 w-4 mr-2" />
                                Sincronizar Posições
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    window.open(`/accounts/${account.id}`, '_blank')
                                }}
                            >
                                <Wallet className="h-4 w-4 mr-2" />
                                Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => setDeleteConfirmId(account.id)}
                                disabled={deleteMutation.isPending}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir Conta
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Contas de Exchange</h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie suas contas de exchange para trading
                        {isSubscriberOnly && maxAccounts && (
                            <span className="ml-2 text-sm">
                                ({currentAccountsCount}/{maxAccounts} contas)
                            </span>
                        )}
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button 
                            variant="gradient" 
                            onClick={() => setEditingAccount(null)}
                            disabled={!canAddAccount}
                            title={hasReachedLimit ? `Limite de ${maxAccounts} conta(s) atingido` : undefined}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Conta
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>
                                {editingAccount ? 'Editar Conta' : 'Nova Conta de Exchange'}
                            </DialogTitle>
                            <DialogDescription>
                                {editingAccount
                                    ? 'Atualize as informações da conta'
                                    : 'Adicione uma nova conta de exchange para trading'}
                            </DialogDescription>
                        </DialogHeader>
                        <AccountForm account={editingAccount} onSuccess={handleCloseDialog} />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Alerta de limite de contas */}
            {isSubscriberOnly && hasReachedLimit && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Você atingiu o limite de {maxAccounts} conta(s) exchange permitidas pelo seu plano. 
                        Para adicionar mais contas, faça upgrade do seu plano.
                    </AlertDescription>
                </Alert>
            )}

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todas as Contas</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        data={accounts || []}
                        columns={columns}
                        loading={isLoading}
                        emptyState={
                            <div className="text-center py-12">
                                <TestTube className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-lg font-medium mb-2">Nenhuma conta cadastrada</p>
                                <p className="text-muted-foreground mb-4">
                                    Comece adicionando sua primeira conta de exchange
                                </p>
                                <Button 
                                    onClick={() => setIsDialogOpen(true)} 
                                    variant="gradient"
                                    disabled={!canAddAccount}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Adicionar Conta
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
                            Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.
                            Todas as configurações e históricos associados serão perdidos.
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

