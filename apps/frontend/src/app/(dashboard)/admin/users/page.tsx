'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { adminService } from '@/lib/api/admin.service'
import type { User } from '@/lib/types'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils/format'

export default function UsersAdminPage() {
    const queryClient = useQueryClient()

    const { data: users, isLoading } = useQuery({
        queryKey: ['admin', 'users'],
        queryFn: adminService.listUsers,
    })

    const activateMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
            adminService.activateUser(id, is_active),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
            toast.success('Status do usuário atualizado!')
        },
    })

    const columns: Column<User>[] = [
        { key: 'id', label: 'ID', render: (user) => <span>#{user.id}</span> },
        { key: 'email', label: 'Email', render: (user) => <span className="font-medium">{user.email}</span> },
        {
            key: 'roles',
            label: 'Roles',
            render: (user) => (
                <div className="flex gap-1">
                    {user.roles.map((role) => (
                        <Badge key={role} variant="outline">
                            {role}
                        </Badge>
                    ))}
                </div>
            ),
        },
        {
            key: 'is_active',
            label: 'Status',
            render: (user) => (
                <Badge variant={user.is_active ? 'success' : 'secondary'}>
                    {user.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
            ),
        },
        { key: 'created_at', label: 'Criado em', render: (user) => <span className="text-sm">{formatDateTime(user.created_at)}</span> },
        {
            key: 'actions',
            label: 'Ações',
            render: (user) => (
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => activateMutation.mutate({ id: user.id, is_active: !user.is_active })}
                    >
                        {user.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                </div>
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
            </div>

            <Card className="glass">
                <CardHeader>
                    <CardTitle>Todos os Usuários</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable data={users || []} columns={columns} loading={isLoading} />
                </CardContent>
            </Card>
        </div>
    )
}

