'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface ResetPasswordModalProps {
    userId: string
    open: boolean
    onClose: () => void
}

export function ResetPasswordModal({ userId, open, onClose }: ResetPasswordModalProps) {
    const queryClient = useQueryClient()
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const resetMutation = useMutation({
        mutationFn: () => adminService.resetUserPassword(userId, { newPassword }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
            toast.success('Senha resetada com sucesso!')
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.message || 'Falha ao resetar senha')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (newPassword.length < 8) {
            toast.error('A senha deve ter pelo menos 8 caracteres')
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error('As senhas não coincidem')
            return
        }

        if (confirm('Tem certeza que deseja resetar a senha deste usuário?')) {
            resetMutation.mutate()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Resetar Senha</DialogTitle>
                    <DialogDescription>
                        Defina uma nova senha para o usuário
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="newPassword">Nova Senha</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            required
                            minLength={8}
                        />
                    </div>
                    <div>
                        <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Digite novamente"
                            required
                        />
                    </div>

                    <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3">
                        <p className="text-sm text-yellow-600 dark:text-yellow-500">
                            ⚠️ O usuário precisará fazer login novamente com a nova senha
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            variant="destructive"
                            disabled={resetMutation.isPending}
                        >
                            {resetMutation.isPending ? 'Resetando...' : 'Resetar Senha'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

