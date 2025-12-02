'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, Eye, MoreHorizontal, KeyRound, UserCog } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { adminService } from '@/lib/api/admin.service'
import type { User } from '@/lib/types'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'
import { CreateUserModal } from '@/components/admin/CreateUserModal'
import { EditUserModal } from '@/components/admin/EditUserModal'
import { DeleteUserModal } from '@/components/admin/DeleteUserModal'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'

export default function UsersAdminPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    
    // Modal states
    const [createModalOpen, setCreateModalOpen] = useState(false)
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)

    const { data: users, isLoading } = useQuery({
        queryKey: ['admin', 'users'],
        queryFn: () => adminService.listUsers(),
    })

    const resetPasswordMutation = useMutation({
        mutationFn: (id: number) => adminService.resetPassword(id),
        onSuccess: (data) => {
            toast.success('Senha resetada com sucesso! Uma nova senha foi enviada ao usuário.')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao resetar senha')
        },
    })

    const handleEdit = (user: User) => {
        setSelectedUser(user)
        setEditModalOpen(true)
    }

    const handleDelete = (user: User) => {
        setSelectedUser(user)
        setDeleteModalOpen(true)
    }

    const handleResetPassword = (user: User) => {
        if (confirm(`Deseja resetar a senha do usuário ${user.email}?`)) {
            resetPasswordMutation.mutate(user.id)
        }
    }

    const handleViewDetails = (user: User) => {
        router.push(`/admin/users/${user.id}`)
    }

    // Normalizar dados - pode vir como array direto ou paginado
    const usersList = Array.isArray(users) ? users : (users?.data || users?.items || [])

    const columns: Column<User>[] = [
        { 
            key: 'id', 
            label: 'ID', 
            render: (user) => (
                <span className="font-mono text-xs text-muted-foreground">#{user.id}</span>
            ) 
        },
        { 
            key: 'email', 
            label: 'Usuário', 
            render: (user) => (
                <div>
                    <p className="font-medium">{user.email}</p>
                    {user.profile?.full_name && (
                        <p className="text-sm text-muted-foreground">{user.profile.full_name}</p>
                    )}
                </div>
            ) 
        },
        {
            key: 'roles',
            label: 'Permissões',
            render: (user) => (
                <div className="flex gap-1 flex-wrap">
                    {(user.roles || []).map((role) => (
                        <Badge 
                            key={role} 
                            variant={role === 'admin' ? 'default' : 'outline'}
                            className={role === 'admin' ? 'bg-purple-500 hover:bg-purple-600' : ''}
                        >
                            {role === 'admin' ? 'Admin' : 'Usuário'}
                        </Badge>
                    ))}
                </div>
            ),
        },
        {
            key: 'is_active',
            label: 'Status',
            render: (user) => (
                <Badge 
                    variant={user.is_active ? 'default' : 'secondary'}
                    className={user.is_active ? 'bg-green-500 hover:bg-green-600' : ''}
                >
                    {user.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
            ),
        },
        { 
            key: 'created_at', 
            label: 'Criado em', 
            render: (user) => (
                <span className="text-sm text-muted-foreground">
                    {formatDateTime(user.created_at)}
                </span>
            ) 
        },
        {
            key: 'actions',
            label: 'Ações',
            render: (user) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleViewDetails(user)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver Detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(user)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            Resetar Senha
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                            onClick={() => handleDelete(user)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Gerenciamento de Usuários</h1>
                    <p className="text-muted-foreground mt-1">Gerencie usuários do sistema</p>
                </div>
                <Button onClick={() => setCreateModalOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Usuário
                </Button>
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserCog className="h-5 w-5" />
                        Todos os Usuários
                    </CardTitle>
                    <CardDescription>
                        {usersList.length} usuário(s) cadastrado(s)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable data={usersList} columns={columns} loading={isLoading} />
                </CardContent>
            </Card>

            {/* Modals */}
            <CreateUserModal 
                open={createModalOpen} 
                onOpenChange={setCreateModalOpen} 
            />
            <EditUserModal 
                user={selectedUser} 
                open={editModalOpen} 
                onOpenChange={setEditModalOpen} 
            />
            <DeleteUserModal 
                user={selectedUser} 
                open={deleteModalOpen} 
                onOpenChange={setDeleteModalOpen} 
            />
        </div>
    )
}

