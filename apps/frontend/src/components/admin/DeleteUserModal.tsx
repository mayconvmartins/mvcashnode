'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { User } from '@/lib/types'

interface DeleteUserModalProps {
    user: User | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function DeleteUserModal({ user, open, onOpenChange }: DeleteUserModalProps) {
    const queryClient = useQueryClient()

    const deleteMutation = useMutation({
        mutationFn: (id: number) => adminService.deleteUser(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
            toast.success('Usuário excluído com sucesso!')
            onOpenChange(false)
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao excluir usuário')
        },
    })

    const handleDelete = () => {
        if (user) {
            deleteMutation.mutate(user.id)
        }
    }

    if (!user) return null

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <p>
                            Você está prestes a excluir o usuário <strong>{user.email}</strong>.
                        </p>
                        <p className="text-destructive font-medium">
                            Esta ação não pode ser desfeita!
                        </p>
                        <p className="text-sm">
                            Todos os dados associados a este usuário serão permanentemente removidos,
                            incluindo posições, configurações e histórico.
                        </p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleteMutation.isPending}
                    >
                        {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Excluir Usuário
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

