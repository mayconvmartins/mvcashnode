'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Reset2FAModalProps {
    userId: string
    open: boolean
    onClose: () => void
}

export function Reset2FAModal({ userId, open, onClose }: Reset2FAModalProps) {
    const queryClient = useQueryClient()

    const resetMutation = useMutation({
        mutationFn: () => adminService.resetUser2FA(userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
            toast.success('2FA resetado com sucesso!')
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao resetar 2FA')
        },
    })

    const handleConfirm = () => {
        if (confirm('Tem certeza que deseja resetar o 2FA deste usuário? O usuário precisará configurar novamente.')) {
            resetMutation.mutate()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Resetar Autenticação de Dois Fatores</DialogTitle>
                    <DialogDescription>
                        Esta ação irá desativar o 2FA do usuário
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
                        <h4 className="font-medium text-yellow-600 dark:text-yellow-500 mb-2">
                            ⚠️ Atenção
                        </h4>
                        <ul className="text-sm text-yellow-600 dark:text-yellow-500 space-y-1">
                            <li>• O 2FA do usuário será completamente desativado</li>
                            <li>• O usuário precisará configurar o 2FA novamente se desejar</li>
                            <li>• Esta ação não pode ser desfeita</li>
                        </ul>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Use esta função apenas se o usuário perdeu acesso ao dispositivo de autenticação.
                    </p>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button 
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={resetMutation.isPending}
                    >
                        {resetMutation.isPending ? 'Resetando...' : 'Resetar 2FA'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

