'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService, CreateUserDto } from '@/lib/api/admin.service'
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
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'

interface CreateUserModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
    const queryClient = useQueryClient()
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        full_name: '',
        phone: '',
        whatsapp_phone: '',
        isAdmin: false,
    })

    const createMutation = useMutation({
        mutationFn: (data: CreateUserDto) => adminService.createUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
            toast.success('Usuário criado com sucesso!')
            onOpenChange(false)
            resetForm()
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao criar usuário')
        },
    })

    const resetForm = () => {
        setFormData({
            email: '',
            password: '',
            full_name: '',
            phone: '',
            whatsapp_phone: '',
            isAdmin: false,
        })
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!formData.email || !formData.password) {
            toast.error('Email e senha são obrigatórios')
            return
        }

        if (formData.password.length < 8) {
            toast.error('A senha deve ter pelo menos 8 caracteres')
            return
        }

        const roles: ('admin' | 'user')[] = formData.isAdmin ? ['admin', 'user'] : ['user']

        createMutation.mutate({
            email: formData.email,
            password: formData.password,
            roles,
            profile: {
                full_name: formData.full_name || formData.email.split('@')[0],
                phone: formData.phone || undefined,
                whatsapp_phone: formData.whatsapp_phone || undefined,
            },
        })
    }

    const generatePassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
        let password = ''
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        setFormData(prev => ({ ...prev, password }))
        setShowPassword(true)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Criar Novo Usuário</DialogTitle>
                    <DialogDescription>
                        Preencha os dados para criar um novo usuário no sistema.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="usuario@exemplo.com"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                required
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="password">Senha *</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Mínimo 8 caracteres"
                                        value={formData.password}
                                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                        required
                                        minLength={8}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button type="button" variant="outline" onClick={generatePassword}>
                                    Gerar
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="full_name">Nome Completo</Label>
                            <Input
                                id="full_name"
                                placeholder="Nome do usuário"
                                value={formData.full_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="phone">Telefone</Label>
                                <Input
                                    id="phone"
                                    placeholder="+55 11 99999-9999"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="whatsapp_phone">WhatsApp</Label>
                                <Input
                                    id="whatsapp_phone"
                                    placeholder="+55 11 99999-9999"
                                    value={formData.whatsapp_phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox
                                id="isAdmin"
                                checked={formData.isAdmin}
                                onCheckedChange={(checked) => 
                                    setFormData(prev => ({ ...prev, isAdmin: checked === true }))
                                }
                            />
                            <Label htmlFor="isAdmin" className="text-sm font-normal cursor-pointer">
                                Conceder permissões de administrador
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar Usuário
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

