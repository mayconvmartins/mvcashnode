'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/authStore'
import { apiClient } from '@/lib/api/client'
import { notificationsService } from '@/lib/api/notifications.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { User, Mail, Phone, Bell, Shield, MessageSquare, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { WhatsAppUserConfig } from '@/lib/api/notifications.service'

export default function ProfilePage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { user } = useAuthStore()
    const [isEditing, setIsEditing] = useState(false)
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        whatsapp_phone: '',
    })

    // Query para buscar perfil
    const { data: profile, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const { data } = await apiClient.get('/users/me')
            return data
        },
    })

    // Atualizar formData quando profile carregar
    useEffect(() => {
        if (profile) {
            setFormData({
                full_name: profile.profile?.full_name || profile.full_name || '',
                phone: profile.profile?.phone || profile.phone || '',
                whatsapp_phone: profile.profile?.whatsapp_phone || profile.whatsapp_phone || '',
            })
        }
    }, [profile])

    // Query para buscar configuração de notificações WhatsApp
    const { data: whatsappConfig, isLoading: loadingWhatsAppConfig } = useQuery({
        queryKey: ['notifications', 'config'],
        queryFn: () => notificationsService.getUserConfig(),
    })

    // Mutation para atualizar perfil
    const updateMutation = useMutation({
        mutationFn: async (formData: any) => {
            const { data } = await apiClient.put('/users/me', {
                full_name: formData.full_name || undefined,
                phone: formData.phone || undefined,
                whatsapp_phone: formData.whatsapp_phone || undefined,
            })
            return data
        },
        onSuccess: (updatedUser) => {
            // Atualizar cache com os dados retornados
            queryClient.setQueryData(['profile'], updatedUser)
            queryClient.invalidateQueries({ queryKey: ['profile'] })
            
            // Atualizar formData com os novos dados
            if (updatedUser) {
                setFormData({
                    full_name: updatedUser.profile?.full_name || updatedUser.full_name || '',
                    phone: updatedUser.profile?.phone || updatedUser.phone || '',
                    whatsapp_phone: updatedUser.profile?.whatsapp_phone || updatedUser.whatsapp_phone || '',
                })
            }
            
            toast.success('Perfil atualizado com sucesso')
            setIsEditing(false)
        },
        onError: (error: any) => {
            const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao atualizar perfil'
            toast.error(errorMessage)
        },
    })

    // Mutation para atualizar configuração de notificações WhatsApp
    const updateWhatsAppConfigMutation = useMutation({
        mutationFn: (data: Partial<WhatsAppUserConfig>) => notificationsService.updateUserConfig(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'config'] })
            queryClient.invalidateQueries({ queryKey: ['notifications', 'stats'] })
            toast.success('Preferências de notificação atualizadas!')
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao atualizar preferências')
        },
    })

    const handleWhatsAppConfigChange = (field: keyof WhatsAppUserConfig, value: boolean) => {
        if (!whatsappConfig) return
        
        updateWhatsAppConfigMutation.mutate({
            ...whatsappConfig,
            [field]: value,
        })
    }

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        updateMutation.mutate(formData)
    }

    const handleCancel = () => {
        // Restaurar valores originais do perfil
        if (profile) {
            setFormData({
                full_name: profile.full_name || '',
                phone: profile.phone || '',
                whatsapp_phone: profile.whatsapp_phone || '',
            })
        }
        setIsEditing(false)
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
                                value={formData.full_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
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
                                value={formData.phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                disabled={!isEditing}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="whatsapp_phone">WhatsApp</Label>
                            <Input
                                id="whatsapp_phone"
                                name="whatsapp_phone"
                                type="tel"
                                value={formData.whatsapp_phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_phone: e.target.value }))}
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
                                        onClick={handleCancel}
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

            {/* WhatsApp Notification Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <MessageSquare className="h-5 w-5" />
                        <span>Notificações WhatsApp</span>
                    </CardTitle>
                    <CardDescription>
                        Configure quais notificações você deseja receber via WhatsApp
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!(profile?.profile?.whatsapp_phone || profile?.whatsapp_phone) ? (
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                        Número do WhatsApp não configurado
                                    </p>
                                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                                        Configure seu número do WhatsApp acima para receber notificações
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="text-sm font-medium">Número configurado:</p>
                                <p className="text-sm text-muted-foreground font-mono">
                                    {profile?.profile?.whatsapp_phone || profile?.whatsapp_phone}
                                </p>
                            </div>

                            {loadingWhatsAppConfig ? (
                                <div className="space-y-3">
                                    <div className="h-12 bg-muted animate-pulse rounded" />
                                    <div className="h-12 bg-muted animate-pulse rounded" />
                                    <div className="h-12 bg-muted animate-pulse rounded" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label>Posição Aberta</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Notificar quando uma nova posição for aberta
                                            </p>
                                        </div>
                                        <Switch
                                            checked={whatsappConfig?.position_opened_enabled ?? true}
                                            onCheckedChange={(checked) => 
                                                handleWhatsAppConfigChange('position_opened_enabled', checked)
                                            }
                                            disabled={updateWhatsAppConfigMutation.isPending}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label>Posição Fechada</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Notificar quando uma posição for fechada
                                            </p>
                                        </div>
                                        <Switch
                                            checked={whatsappConfig?.position_closed_enabled ?? true}
                                            onCheckedChange={(checked) => 
                                                handleWhatsAppConfigChange('position_closed_enabled', checked)
                                            }
                                            disabled={updateWhatsAppConfigMutation.isPending}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label>Stop Loss Atingido</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Notificar quando o stop loss for acionado
                                            </p>
                                        </div>
                                        <Switch
                                            checked={whatsappConfig?.stop_loss_enabled ?? true}
                                            onCheckedChange={(checked) => 
                                                handleWhatsAppConfigChange('stop_loss_enabled', checked)
                                            }
                                            disabled={updateWhatsAppConfigMutation.isPending}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label>Take Profit Atingido</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Notificar quando o take profit for acionado
                                            </p>
                                        </div>
                                        <Switch
                                            checked={whatsappConfig?.take_profit_enabled ?? true}
                                            onCheckedChange={(checked) => 
                                                handleWhatsAppConfigChange('take_profit_enabled', checked)
                                            }
                                            disabled={updateWhatsAppConfigMutation.isPending}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="space-y-0.5">
                                            <Label>Alertas de Cofre</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Notificar sobre eventos relacionados a cofres
                                            </p>
                                        </div>
                                        <Switch
                                            checked={whatsappConfig?.vault_alerts_enabled ?? false}
                                            onCheckedChange={(checked) => 
                                                handleWhatsAppConfigChange('vault_alerts_enabled', checked)
                                            }
                                            disabled={updateWhatsAppConfigMutation.isPending}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Legacy Notification Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Bell className="h-5 w-5" />
                        <span>Preferências de Notificação (Legado)</span>
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

