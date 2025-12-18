'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/stores/authStore'
import { apiClient } from '@/lib/api/client'
import { notificationsService } from '@/lib/api/notifications.service'
import { authService, type PasskeyInfo, type SessionInfo } from '@/lib/api/auth.service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { 
    User, Mail, Phone, Bell, Shield, MessageSquare, AlertCircle, 
    Fingerprint, Plus, Trash2, Smartphone, Monitor, Tablet, LogOut, 
    Loader2, Key, Edit2, BellRing, BellOff
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { WhatsAppUserConfig } from '@/lib/api/notifications.service'
import { startRegistration } from '@simplewebauthn/browser'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useWebPush } from '@/components/providers/WebPushProvider'
import { sendTestNotification } from '@/lib/utils/webpush'

// ============================================
// WEB PUSH SECTION COMPONENT
// ============================================

function WebPushSection() {
    const { isSupported, isSubscribed, permission, isLoading, subscribe, unsubscribe } = useWebPush()
    const [isSendingTest, setIsSendingTest] = useState(false)

    const handleToggle = async () => {
        if (isSubscribed) {
            const success = await unsubscribe()
            if (success) {
                toast.success('Notificações push desativadas')
            } else {
                toast.error('Erro ao desativar notificações push')
            }
        } else {
            const success = await subscribe()
            if (success) {
                toast.success('Notificações push ativadas!')
            } else {
                toast.error('Erro ao ativar notificações push. Verifique as permissões do navegador.')
            }
        }
    }

    const handleSendTest = async () => {
        setIsSendingTest(true)
        try {
            const success = await sendTestNotification()
            if (success) {
                toast.success('Notificação de teste enviada!')
            } else {
                toast.error('Erro ao enviar notificação de teste')
            }
        } finally {
            setIsSendingTest(false)
        }
    }

    if (!isSupported) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <BellRing className="h-5 w-5" />
                        <span>Notificações Push</span>
                    </CardTitle>
                    <CardDescription>Receba notificações mesmo quando o app estiver fechado</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                            Notificações push não são suportadas neste navegador.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                    <BellRing className="h-5 w-5" />
                    <span>Notificações Push</span>
                </CardTitle>
                <CardDescription>Receba notificações mesmo quando o app estiver fechado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {permission === 'denied' ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="flex items-start gap-3">
                            <BellOff className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                                    Notificações bloqueadas
                                </p>
                                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                    Você bloqueou as notificações. Para ativar, acesse as configurações do navegador.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Notificações Push</Label>
                                <p className="text-xs text-muted-foreground">
                                    Receba alertas sobre posições, trades e webhooks
                                </p>
                            </div>
                            <Switch
                                checked={isSubscribed}
                                onCheckedChange={handleToggle}
                                disabled={isLoading}
                            />
                        </div>

                        {isSubscribed && (
                            <div className="pt-2 border-t">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleSendTest}
                                    disabled={isSendingTest}
                                >
                                    {isSendingTest ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Enviando...
                                        </>
                                    ) : (
                                        <>
                                            <BellRing className="h-4 w-4 mr-2" />
                                            Enviar notificação de teste
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}

// ============================================
// PASSKEYS SECTION COMPONENT
// ============================================

function PasskeysSection() {
    const queryClient = useQueryClient()
    const [isRegistering, setIsRegistering] = useState(false)
    const [newPasskeyName, setNewPasskeyName] = useState('')
    const [isPasskeySupported, setIsPasskeySupported] = useState(false)

    // Verificar suporte a Passkeys
    useEffect(() => {
        if (typeof window !== 'undefined' && window.PublicKeyCredential) {
            PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                .then((available) => setIsPasskeySupported(available))
                .catch(() => setIsPasskeySupported(false))
        }
    }, [])

    // Query para listar passkeys
    const { data: passkeys, isLoading } = useQuery({
        queryKey: ['passkeys'],
        queryFn: authService.listPasskeys,
    })

    // Mutation para registrar passkey
    const registerMutation = useMutation({
        mutationFn: async () => {
            const options = await authService.passkeyRegisterStart(newPasskeyName || undefined)
            const response = await startRegistration(options)
            return authService.passkeyRegisterFinish(response, newPasskeyName || undefined)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['passkeys'] })
            toast.success('Passkey registrada com sucesso!')
            setIsRegistering(false)
            setNewPasskeyName('')
        },
        onError: (error: any) => {
            if (error.message?.includes('cancelled') || error.name === 'AbortError') {
                return
            }
            toast.error(error.message || 'Erro ao registrar passkey')
        },
    })

    // Mutation para remover passkey
    const deleteMutation = useMutation({
        mutationFn: authService.deletePasskey,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['passkeys'] })
            toast.success('Passkey removida com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao remover passkey')
        },
    })

    const handleRegister = () => {
        registerMutation.mutate()
    }

    const handleDelete = (id: number) => {
        if (confirm('Tem certeza que deseja remover esta passkey?')) {
            deleteMutation.mutate(id)
        }
    }

    if (!isPasskeySupported) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                        <Fingerprint className="h-5 w-5" />
                        <span>Passkeys</span>
                    </CardTitle>
                    <CardDescription>Login sem senha usando biometria ou PIN</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                            Passkeys não são suportadas neste dispositivo ou navegador.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center space-x-2">
                            <Fingerprint className="h-5 w-5" />
                            <span>Passkeys</span>
                        </CardTitle>
                        <CardDescription>Login sem senha usando biometria ou PIN</CardDescription>
                    </div>
                    <Button
                        onClick={() => setIsRegistering(true)}
                        disabled={isRegistering}
                        size="sm"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar Passkey
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Formulário de registro */}
                {isRegistering && (
                    <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
                        <div className="space-y-2">
                            <Label htmlFor="passkeyName">Nome do dispositivo (opcional)</Label>
                            <Input
                                id="passkeyName"
                                placeholder="Ex: iPhone 15 Pro"
                                value={newPasskeyName}
                                onChange={(e) => setNewPasskeyName(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleRegister}
                                disabled={registerMutation.isPending}
                            >
                                {registerMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Registrando...
                                    </>
                                ) : (
                                    <>
                                        <Fingerprint className="h-4 w-4 mr-2" />
                                        Usar biometria
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setIsRegistering(false)
                                    setNewPasskeyName('')
                                }}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Lista de passkeys */}
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : passkeys && passkeys.length > 0 ? (
                    <div className="space-y-2">
                        {passkeys.map((passkey) => (
                            <div
                                key={passkey.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Key className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">
                                            {passkey.deviceName || 'Passkey'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Criada {formatDistanceToNow(new Date(passkey.createdAt), { 
                                                addSuffix: true, 
                                                locale: ptBR 
                                            })}
                                            {passkey.lastUsedAt && (
                                                <> · Último uso {formatDistanceToNow(new Date(passkey.lastUsedAt), { 
                                                    addSuffix: true, 
                                                    locale: ptBR 
                                                })}</>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(passkey.id)}
                                    disabled={deleteMutation.isPending}
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-muted-foreground">
                        <Fingerprint className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhuma passkey cadastrada</p>
                        <p className="text-xs mt-1">
                            Adicione uma passkey para login mais rápido e seguro
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ============================================
// SESSIONS SECTION COMPONENT
// ============================================

function SessionsSection() {
    const queryClient = useQueryClient()

    // Query para listar sessões
    const { data: sessions, isLoading } = useQuery({
        queryKey: ['sessions'],
        queryFn: authService.listSessions,
    })

    // Mutation para encerrar sessão
    const terminateMutation = useMutation({
        mutationFn: authService.terminateSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] })
            toast.success('Sessão encerrada com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao encerrar sessão')
        },
    })

    // Mutation para encerrar outras sessões
    const terminateOthersMutation = useMutation({
        mutationFn: authService.terminateOtherSessions,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] })
            toast.success(`${data.terminatedCount} sessão(ões) encerrada(s)!`)
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao encerrar sessões')
        },
    })

    const getDeviceIcon = (deviceType: string | null) => {
        switch (deviceType) {
            case 'mobile':
                return <Smartphone className="h-5 w-5" />
            case 'tablet':
                return <Tablet className="h-5 w-5" />
            default:
                return <Monitor className="h-5 w-5" />
        }
    }

    const handleTerminate = (id: number) => {
        if (confirm('Tem certeza que deseja encerrar esta sessão?')) {
            terminateMutation.mutate(id)
        }
    }

    const handleTerminateOthers = () => {
        if (confirm('Tem certeza que deseja encerrar todas as outras sessões?')) {
            terminateOthersMutation.mutate()
        }
    }

    const otherSessionsCount = sessions?.filter(s => !s.isCurrent).length || 0

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center space-x-2">
                            <Monitor className="h-5 w-5" />
                            <span>Sessões Ativas</span>
                        </CardTitle>
                        <CardDescription>Gerencie os dispositivos conectados à sua conta</CardDescription>
                    </div>
                    {otherSessionsCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleTerminateOthers}
                            disabled={terminateOthersMutation.isPending}
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            Encerrar outras ({otherSessionsCount})
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : sessions && sessions.length > 0 ? (
                    <div className="space-y-2">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={`flex items-center justify-between p-3 border rounded-lg ${
                                    session.isCurrent ? 'border-primary bg-primary/5' : ''
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${
                                        session.isCurrent ? 'bg-primary/10' : 'bg-muted'
                                    }`}>
                                        {getDeviceIcon(session.deviceType)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium">
                                                {session.deviceName || session.browser || 'Dispositivo desconhecido'}
                                            </p>
                                            {session.isCurrent && (
                                                <Badge variant="default" className="text-xs">
                                                    Atual
                                                </Badge>
                                            )}
                                            {session.isPasskeyAuth && (
                                                <Badge variant="secondary" className="text-xs">
                                                    <Fingerprint className="h-3 w-3 mr-1" />
                                                    Passkey
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {session.os && <>{session.os} · </>}
                                            {session.ipAddress && <>{session.ipAddress} · </>}
                                            Ativo {formatDistanceToNow(new Date(session.lastActivityAt), { 
                                                addSuffix: true, 
                                                locale: ptBR 
                                            })}
                                        </p>
                                    </div>
                                </div>
                                {!session.isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleTerminate(session.id)}
                                        disabled={terminateMutation.isPending}
                                    >
                                        <LogOut className="h-4 w-4 text-destructive" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-muted-foreground">
                        <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhuma sessão ativa</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

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

            {/* Passkeys Section */}
            <PasskeysSection />

            {/* Sessions Section */}
            <SessionsSection />

            {/* Web Push Notifications */}
            <WebPushSection />

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

