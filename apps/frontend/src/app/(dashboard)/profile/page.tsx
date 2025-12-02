'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/authStore'
import { apiClient } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { User, Mail, Phone, Bell, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { user } = useAuthStore()
    const [isEditing, setIsEditing] = useState(false)

    // Query para buscar perfil
    const { data: profile, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const { data } = await apiClient.get('/users/me')
            return data
        },
    })

    // Mutation para atualizar perfil
    const updateMutation = useMutation({
        mutationFn: async (formData: any) => {
            const { data } = await apiClient.put('/users/me', formData)
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['profile'] })
            toast.success('Perfil atualizado com sucesso')
            setIsEditing(false)
        },
        onError: () => {
            toast.error('Erro ao atualizar perfil')
        },
    })

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        const data = {
            full_name: formData.get('full_name'),
            phone: formData.get('phone'),
            whatsapp_phone: formData.get('whatsapp_phone'),
        }
        updateMutation.mutate(data)
    }

    const handleToggle2FA = () => {
        if (profile?.twofa_enabled) {
            toast.info('Para desabilitar 2FA, entre em contato com o suporte')
        } else {
            router.push('/setup-2fa')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Perfil</h1>
                <p className="text-muted-foreground">Gerencie suas informações pessoais e preferências</p>
            </div>

            {/* Profile Info */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <User className="h-5 w-5" />
                        <span>Informações Pessoais</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="flex items-center space-x-2">
                                <Mail className="h-4 w-4" />
                                <span>Email</span>
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={user?.email || ''}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-xs text-muted-foreground">
                                O email não pode ser alterado
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="full_name">Nome Completo</Label>
                            <Input
                                id="full_name"
                                name="full_name"
                                defaultValue={profile?.full_name || ''}
                                disabled={!isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone" className="flex items-center space-x-2">
                                <Phone className="h-4 w-4" />
                                <span>Telefone</span>
                            </Label>
                            <Input
                                id="phone"
                                name="phone"
                                type="tel"
                                defaultValue={profile?.phone || ''}
                                disabled={!isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="whatsapp_phone">WhatsApp</Label>
                            <Input
                                id="whatsapp_phone"
                                name="whatsapp_phone"
                                type="tel"
                                defaultValue={profile?.whatsapp_phone || ''}
                                disabled={!isEditing}
                            />
                        </div>

                        <div className="flex space-x-2">
                            {!isEditing ? (
                                <Button type="button" onClick={() => setIsEditing(true)}>
                                    Editar Perfil
                                </Button>
                            ) : (
                                <>
                                    <Button type="submit" disabled={updateMutation.isPending}>
                                        Salvar Alterações
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsEditing(false)}
                                    >
                                        Cancelar
                                    </Button>
                                </>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Security Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Shield className="h-5 w-5" />
                        <span>Segurança</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Autenticação de Dois Fatores (2FA)</Label>
                            <p className="text-xs text-muted-foreground">
                                {profile?.twofa_enabled
                                    ? 'Sua conta está protegida com 2FA'
                                    : 'Adicione uma camada extra de segurança'}
                            </p>
                        </div>
                        <Button
                            variant={profile?.twofa_enabled ? 'outline' : 'default'}
                            onClick={handleToggle2FA}
                        >
                            {profile?.twofa_enabled ? '2FA Ativo' : 'Configurar 2FA'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Bell className="h-5 w-5" />
                        <span>Preferências de Notificação</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Alertas de Posições</Label>
                            <p className="text-xs text-muted-foreground">
                                Receba notificações quando SL/TP forem atingidos
                            </p>
                        </div>
                        <Switch
                            checked={profile?.position_alerts_enabled || false}
                            disabled
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

