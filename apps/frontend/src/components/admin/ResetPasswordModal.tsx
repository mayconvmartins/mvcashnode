'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

interface ResetPasswordModalProps {
    userId: string | number
    open: boolean
    onClose: () => void
}

export function ResetPasswordModal({ userId, open, onClose }: ResetPasswordModalProps) {
    const queryClient = useQueryClient()
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [mustChangePassword, setMustChangePassword] = useState(false)

    const resetMutation = useMutation({
        mutationFn: () => adminService.changeUserPassword(userId, { 
            newPassword,
            mustChangePassword 
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
            toast.success('Senha alterada com sucesso!')
            setNewPassword('')
            setConfirmPassword('')
            setMustChangePassword(false)
            onClose()
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || error.message || 'Falha ao alterar senha')
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

        if (confirm('Tem certeza que deseja alterar a senha deste usuário?')) {
            resetMutation.mutate()
        }
    }

    const handleClose = () => {
        setNewPassword('')
        setConfirmPassword('')
        setMustChangePassword(false)
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Alterar Senha do Usuário</DialogTitle>
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

                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox
                            id="mustChangePassword"
                            checked={mustChangePassword}
                            onCheckedChange={(checked) => setMustChangePassword(checked === true)}
                        />
                        <Label 
                            htmlFor="mustChangePassword" 
                            className="text-sm font-normal cursor-pointer"
                        >
                            Usuário deve alterar senha no próximo login
                        </Label>
                    </div>

                    {!mustChangePassword && (
                        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3">
                            <p className="text-sm text-blue-600 dark:text-blue-500">
                                ℹ️ Se desmarcado, o usuário não precisará alterar a senha no próximo login
                            </p>
                        </div>
                    )}

                    {mustChangePassword && (
                        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3">
                            <p className="text-sm text-yellow-600 dark:text-yellow-500">
                                ⚠️ O usuário precisará alterar a senha no próximo login
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            variant="default"
                            disabled={resetMutation.isPending}
                        >
                            {resetMutation.isPending ? 'Alterando...' : 'Alterar Senha'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

