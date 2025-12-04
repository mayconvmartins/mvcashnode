'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Shield, ShieldOff, Key, Smartphone, UserCheck, ExternalLink, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'
import { toast } from 'sonner'
import { useState } from 'react'
import { ResetPasswordModal } from '@/components/admin/ResetPasswordModal'

export default function UserDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const userId = Number(params.id)

    const { data: user, isLoading } = useQuery({
        queryKey: ['admin', 'user', userId],
        queryFn: () => adminService.getUser(userId),
    })

    const toggleActiveMutation = useMutation({
        mutationFn: async () => {
            if (user?.is_active) {
                await adminService.deleteUser(userId) // Soft delete = desativar
            } else {
                await adminService.activateUser(userId)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
            toast.success('Status do usuário atualizado!')
        },
        onError: () => {
            toast.error('Falha ao atualizar status')
        },
    })

    const impersonateMutation = useMutation({
        mutationFn: () => adminService.impersonateUser(userId),
        onSuccess: (data) => {
            // Abrir nova janela com o token de impersonation
            const url = new URL(window.location.origin)
            url.pathname = '/'
            url.searchParams.set('impersonate_token', data.accessToken)
            
            // Abrir em nova janela
            const newWindow = window.open(url.toString(), '_blank', 'noopener,noreferrer')
            
            if (newWindow) {
                toast.success(`Logado como ${data.user.email} em nova janela`)
            } else {
                // Se popup foi bloqueado, copiar token para clipboard
                navigator.clipboard.writeText(data.accessToken)
                toast.info('Popup bloqueado. Token copiado para clipboard.')
            }
        },
        onError: (error: any) => {
            toast.error(error?.response?.data?.message || 'Erro ao logar como usuário')
        },
    })

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-[400px]" />
            </div>
        )
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <h2 className="text-2xl font-bold mb-4">Usuário não encontrado</h2>
                <Button onClick={() => router.push('/admin/users')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para Usuários
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/admin/users')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">{user.profile?.full_name || user.email}</h1>
                        <p className="text-muted-foreground">{user.email}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge 
                        variant={user.is_active ? 'default' : 'secondary'}
                        className={user.is_active ? 'bg-green-500' : ''}
                    >
                        {user.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {user.profile?.twofa_enabled && (
                        <Badge variant="outline">
                            <Smartphone className="mr-1 h-3 w-3" />
                            2FA
                        </Badge>
                    )}
                    {(user.roles || []).map((role: string) => (
                        <Badge 
                            key={role}
                            variant={role === 'admin' ? 'default' : 'outline'}
                            className={role === 'admin' ? 'bg-purple-500' : ''}
                        >
                            {role === 'admin' ? 'Admin' : 'Usuário'}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="details" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="sessions">Sessões</TabsTrigger>
                    <TabsTrigger value="audit">Auditoria</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4">
                    {/* User Info */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Informações do Usuário</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">ID:</span>
                                <span className="font-mono">#{user.id}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Email:</span>
                                <span>{user.email}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Nome Completo:</span>
                                <span>{user.profile?.full_name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Telefone:</span>
                                <span>{user.profile?.phone || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">WhatsApp:</span>
                                <span>{user.profile?.whatsapp_phone || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Permissões:</span>
                                <div className="flex gap-1">
                                    {(user.roles || []).map((role: string) => (
                                        <Badge key={role} variant="outline">{role}</Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Criado em:</span>
                                <span>{formatDateTime(user.created_at)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-muted-foreground">Atualizado em:</span>
                                <span>{formatDateTime(user.updated_at)}</span>
                            </div>
                            <div className="flex justify-between py-2">
                                <span className="text-muted-foreground">Deve trocar senha:</span>
                                <Badge variant={user.must_change_password ? 'destructive' : 'secondary'}>
                                    {user.must_change_password ? 'Sim' : 'Não'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Ações</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            <Button
                                variant={user.is_active ? 'destructive' : 'default'}
                                onClick={() => toggleActiveMutation.mutate()}
                                disabled={toggleActiveMutation.isPending}
                            >
                                {toggleActiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {user.is_active ? (
                                    <>
                                        <ShieldOff className="mr-2 h-4 w-4" />
                                        Desativar Usuário
                                    </>
                                ) : (
                                    <>
                                        <Shield className="mr-2 h-4 w-4" />
                                        Ativar Usuário
                                    </>
                                )}
                            </Button>
                            <ResetPasswordButton userId={userId} />
                            {user.profile?.twofa_enabled && (
                                <Button variant="outline" onClick={() => toast.info('Funcionalidade em desenvolvimento')}>
                                    <Smartphone className="mr-2 h-4 w-4" />
                                    Resetar 2FA
                                </Button>
                            )}
                            <Button 
                                variant="outline" 
                                className="bg-purple-500/10 border-purple-500 text-purple-500 hover:bg-purple-500/20"
                                onClick={() => impersonateMutation.mutate()}
                                disabled={impersonateMutation.isPending || !user.is_active}
                                title={!user.is_active ? 'Não é possível logar como usuário inativo' : 'Logar como este usuário'}
                            >
                                {impersonateMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <UserCheck className="mr-2 h-4 w-4" />
                                )}
                                Logar Como
                                <ExternalLink className="ml-2 h-3 w-3" />
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="sessions">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sessões Ativas</CardTitle>
                            <CardDescription>Dispositivos e localizações recentes</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-center text-muted-foreground py-8">
                                Funcionalidade em desenvolvimento
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="audit">
                    <UserAuditLogs userId={userId} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

// Componente para exibir logs de auditoria do usuário
function UserAuditLogs({ userId }: { userId: number }) {
    const { data: logs, isLoading } = useQuery({
        queryKey: ['admin', 'user', userId, 'audit-logs'],
        queryFn: () => adminService.getUserAuditLogs(userId, 1, 20),
    })

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Histórico de Auditoria</CardTitle>
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-32" />
                </CardContent>
            </Card>
        )
    }

    const items = logs?.data || []

    return (
        <Card>
            <CardHeader>
                <CardTitle>Histórico de Auditoria</CardTitle>
                <CardDescription>Últimas ações do usuário</CardDescription>
            </CardHeader>
            <CardContent>
                {items.length > 0 ? (
                    <div className="space-y-3">
                        {items.map((log: any) => (
                            <div key={log.id} className="flex items-start gap-3 text-sm p-3 border rounded-lg">
                                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="text-xs">
                                            {log.action}
                                        </Badge>
                                        <span className="text-muted-foreground text-xs">
                                            {log.entity_type}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDateTime(log.created_at)}
                                        {log.ip && ` • IP: ${log.ip}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground py-8">
                        Nenhum histórico de auditoria
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

// Componente para botão de alterar senha
function ResetPasswordButton({ userId }: { userId: number }) {
    const [modalOpen, setModalOpen] = useState(false)

    return (
        <>
            <Button variant="outline" onClick={() => setModalOpen(true)}>
                <Key className="mr-2 h-4 w-4" />
                Alterar Senha
            </Button>
            <ResetPasswordModal
                userId={userId}
                open={modalOpen}
                onClose={() => setModalOpen(false)}
            />
        </>
    )
}

