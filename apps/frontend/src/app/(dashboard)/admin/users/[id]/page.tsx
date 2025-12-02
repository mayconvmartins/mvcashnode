'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/lib/api/admin.service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Shield, ShieldOff, Key, Smartphone } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import { toast } from 'sonner'
import { useState } from 'react'
import { ResetPasswordModal } from '@/components/admin/ResetPasswordModal'
import { Reset2FAModal } from '@/components/admin/Reset2FAModal'

export default function UserDetailPage() {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const userId = params.id as string

    const [showResetPassword, setShowResetPassword] = useState(false)
    const [showReset2FA, setShowReset2FA] = useState(false)

    const { data: user, isLoading } = useQuery({
        queryKey: ['admin', 'user', userId],
        queryFn: () => adminService.getUserById(userId),
    })

    const toggleActiveMutation = useMutation({
        mutationFn: () => adminService.toggleUserActive(userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
            toast.success('Status do usuário atualizado!')
        },
        onError: () => {
            toast.error('Falha ao atualizar status')
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
                    <Badge variant={user.active ? 'default' : 'secondary'}>
                        {user.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {user.twoFactorEnabled && (
                        <Badge variant="outline">
                            <Smartphone className="mr-1 h-3 w-3" />
                            2FA
                        </Badge>
                    )}
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
                        <CardContent className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">ID:</span>
                                <span className="font-mono">{user.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Email:</span>
                                <span>{user.email}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Nome Completo:</span>
                                <span>{user.profile?.full_name || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Role:</span>
                                <Badge>{user.role || 'USER'}</Badge>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Criado em:</span>
                                <span>{formatDate(user.createdAt)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Último Login:</span>
                                <span>{user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Nunca'}</span>
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
                                variant={user.active ? 'destructive' : 'default'}
                                onClick={() => toggleActiveMutation.mutate()}
                                disabled={toggleActiveMutation.isPending}
                            >
                                {user.active ? (
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
                            <Button variant="outline" onClick={() => setShowResetPassword(true)}>
                                <Key className="mr-2 h-4 w-4" />
                                Resetar Senha
                            </Button>
                            {user.twoFactorEnabled && (
                                <Button variant="outline" onClick={() => setShowReset2FA(true)}>
                                    <Smartphone className="mr-2 h-4 w-4" />
                                    Resetar 2FA
                                </Button>
                            )}
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
                            {user.sessions && user.sessions.length > 0 ? (
                                <div className="space-y-4">
                                    {user.sessions.map((session: any) => (
                                        <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                                            <div>
                                                <p className="font-medium">{session.device || 'Dispositivo Desconhecido'}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {session.ip} • {formatDate(session.lastActivity)}
                                                </p>
                                            </div>
                                            <Badge variant={session.active ? 'default' : 'secondary'}>
                                                {session.active ? 'Ativa' : 'Expirada'}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">
                                    Nenhuma sessão ativa
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="audit">
                    <Card>
                        <CardHeader>
                            <CardTitle>Histórico de Auditoria</CardTitle>
                            <CardDescription>Últimas ações do usuário</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {user.auditLogs && user.auditLogs.length > 0 ? (
                                <div className="space-y-3">
                                    {user.auditLogs.map((log: any, index: number) => (
                                        <div key={index} className="flex items-start gap-3 text-sm">
                                            <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                                            <div className="flex-1">
                                                <p className="font-medium">{log.action}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(log.timestamp)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">
                                    Nenhum histórico
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Modals */}
            {showResetPassword && (
                <ResetPasswordModal
                    userId={userId}
                    open={showResetPassword}
                    onClose={() => setShowResetPassword(false)}
                />
            )}
            {showReset2FA && (
                <Reset2FAModal
                    userId={userId}
                    open={showReset2FA}
                    onClose={() => setShowReset2FA(false)}
                />
            )}
        </div>
    )
}

