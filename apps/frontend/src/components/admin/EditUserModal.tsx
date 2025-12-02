'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService, UpdateUserDto } from '@/lib/api/admin.service'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { User } from '@/lib/types'

interface EditUserModalProps {
    user: User | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function EditUserModal({ user, open, onOpenChange }: EditUserModalProps) {
    const queryClient = useQueryClient()
    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        phone: '',
        whatsapp_phone: '',
        isAdmin: false,
        is_active: true,
        position_alerts_enabled: false,
    })

    useEffect(() => {
        if (user) {
            setFormData({
                email: user.email || '',
                full_name: user.profile?.full_name || '',
                phone: user.profile?.phone || '',
                whatsapp_phone: user.profile?.whatsapp_phone || '',
                isAdmin: user.roles?.includes('admin') || false,
                is_active: user.is_active ?? true,
                position_alerts_enabled: user.profile?.position_alerts_enabled ?? false,
            })
        }
    }, [user])

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: UpdateUserDto }) => 
            adminService.updateUser(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
            toast.success('Usuário atualizado com sucesso!')
            onOpenChange(false)
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar usuário')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!user) return

        const roles: ('admin' | 'user')[] = formData.isAdmin ? ['admin', 'user'] : ['user']

        updateMutation.mutate({
            id: user.id,
            data: {
                email: formData.email !== user.email ? formData.email : undefined,
                roles,
                is_active: formData.is_active,
                profile: {
                    full_name: formData.full_name || undefined,
                    phone: formData.phone || undefined,
                    whatsapp_phone: formData.whatsapp_phone || undefined,
                    position_alerts_enabled: formData.position_alerts_enabled,
                },
            },
        })
    }

    if (!user) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Editar Usuário</DialogTitle>
                    <DialogDescription>
                        Atualize os dados do usuário #{user.id}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-email">Email</Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="edit-full_name">Nome Completo</Label>
                            <Input
                                id="edit-full_name"
                                value={formData.full_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-phone">Telefone</Label>
                                <Input
                                    id="edit-phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-whatsapp_phone">WhatsApp</Label>
                                <Input
                                    id="edit-whatsapp_phone"
                                    value={formData.whatsapp_phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-4 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="edit-is_active">Status da Conta</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Usuários inativos não podem fazer login
                                    </p>
                                </div>
                                <Switch
                                    id="edit-is_active"
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => 
                                        setFormData(prev => ({ ...prev, is_active: checked }))
                                    }
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="edit-isAdmin"
                                    checked={formData.isAdmin}
                                    onCheckedChange={(checked) => 
                                        setFormData(prev => ({ ...prev, isAdmin: checked === true }))
                                    }
                                />
                                <Label htmlFor="edit-isAdmin" className="text-sm font-normal cursor-pointer">
                                    Permissões de administrador
                                </Label>
                            </div>

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="edit-position_alerts"
                                    checked={formData.position_alerts_enabled}
                                    onCheckedChange={(checked) => 
                                        setFormData(prev => ({ ...prev, position_alerts_enabled: checked === true }))
                                    }
                                />
                                <Label htmlFor="edit-position_alerts" className="text-sm font-normal cursor-pointer">
                                    Alertas de posição via WhatsApp
                                </Label>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

