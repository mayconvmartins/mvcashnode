'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/lib/api/auth.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'

function LoginPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { setTokens, setUser, logout } = useAuthStore()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [twoFactorCode, setTwoFactorCode] = useState('')
    const [error, setError] = useState('')
    const [requires2FA, setRequires2FA] = useState(false)
    const [sessionToken, setSessionToken] = useState<string | null>(null)
    const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(false)

    // Limpar qualquer token de impersonation ao carregar a página de login
    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Verificar se há token de impersonation
            const accessToken = localStorage.getItem('accessToken')
            if (accessToken) {
                try {
                    const parts = accessToken.split('.')
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]))
                        if (payload.isImpersonation === true) {
                            // Limpar tokens de impersonation
                            logout()
                        }
                    }
                } catch (e) {
                    // Se não conseguir decodificar, limpar flags de qualquer forma
                    localStorage.removeItem('isImpersonating')
                    localStorage.removeItem('originalAdminToken')
                }
            } else {
                // Limpar flags mesmo sem token
                localStorage.removeItem('isImpersonating')
                localStorage.removeItem('originalAdminToken')
            }
        }
    }, [logout])

    const loginMutation = useMutation({
        mutationFn: authService.login,
        onSuccess: (data) => {
            // Verificar se requer 2FA
            if (data.requires2FA && data.sessionToken) {
                setRequires2FA(true)
                setSessionToken(data.sessionToken)
                toast.info('Por favor, informe o código 2FA')
                return
            }

            // Limpar qualquer flag de impersonation antes de salvar novos tokens
            if (typeof window !== 'undefined') {
                localStorage.removeItem('isImpersonating')
                localStorage.removeItem('originalAdminToken')
            }
            
            // Salvar tokens e usuário
            if (data.accessToken && data.refreshToken && data.user) {
                setTokens(data.accessToken, data.refreshToken, rememberMe)
                setUser(data.user)
                toast.success('Login realizado com sucesso!')
                
                // Aguardar para garantir que os cookies foram salvos
                setTimeout(() => {
                    const redirect = searchParams.get('redirect')
                    // Usar window.location.replace para forçar reload completo
                    window.location.replace(redirect || '/')
                }, 200)
            } else {
                setError('Resposta inválida do servidor')
                toast.error('Erro ao realizar login')
            }
        },
        onError: (error: any) => {
            const errorMessage = error.message || error.response?.data?.message || 'Falha no login'
            
            // Verificar se é erro de senha obrigatória
            if (errorMessage.includes('É necessário alterar a senha') || errorMessage.includes('alterar a senha antes')) {
                setRequiresPasswordChange(true)
                setError('')
                return
            }
            
            setError(errorMessage)
            toast.error(errorMessage)
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (requires2FA && sessionToken) {
            // Segunda etapa: validar 2FA
            loginMutation.mutate({ 
                email, 
                password,
                twoFactorCode
            })
        } else {
            // Primeira etapa: validar email e senha
            loginMutation.mutate({ 
                email, 
                password
            })
        }
    }

    const handleBack = () => {
        setRequires2FA(false)
        setSessionToken(null)
        setTwoFactorCode('')
        setError('')
    }

    const changePasswordMutation = useMutation({
        mutationFn: authService.changePasswordRequired,
        onSuccess: () => {
            toast.success('Senha alterada com sucesso! Faça login com sua nova senha.')
            setRequiresPasswordChange(false)
            setPassword('') // Limpar senha antiga
            setNewPassword('')
            setConfirmPassword('')
            setError('')
        },
        onError: (error: any) => {
            const errorMessage = error.message || error.response?.data?.message || 'Erro ao alterar senha'
            toast.error(errorMessage)
        },
    })

    const handleChangePassword = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (newPassword.length < 8) {
            toast.error('A senha deve ter pelo menos 8 caracteres')
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error('As senhas não coincidem')
            return
        }

        changePasswordMutation.mutate({
            email,
            currentPassword: password,
            newPassword,
        })
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="w-full max-w-md glass">
                <CardHeader className="space-y-4">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center">
                            <svg
                                className="h-8 w-8 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                            </svg>
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center gradient-text">
                        Trading Automation
                    </CardTitle>
                    <CardDescription className="text-center">
                        {requires2FA ? 'Informe o código 2FA para continuar' : 'Entre com suas credenciais para acessar o dashboard'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-destructive/10 border border-destructive/50 text-destructive text-sm p-3 rounded-md animate-in fade-in">
                                {error}
                            </div>
                        )}

                        {!requires2FA ? (
                            <>
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <label htmlFor="email" className="text-sm font-medium">
                                        Email
                                    </label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={loginMutation.isPending}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <Label htmlFor="password">Senha</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={loginMutation.isPending}
                                        required
                                    />
                                </div>

                                <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
                                    <Checkbox
                                        id="rememberMe"
                                        checked={rememberMe}
                                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                                        disabled={loginMutation.isPending}
                                    />
                                    <Label
                                        htmlFor="rememberMe"
                                        className="text-sm font-normal cursor-pointer"
                                    >
                                        Lembrar de mim
                                    </Label>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full animate-in fade-in slide-in-from-bottom-2"
                                    variant="gradient"
                                    disabled={loginMutation.isPending || !email || !password}
                                >
                                    {loginMutation.isPending ? 'Verificando...' : 'Entrar'}
                                </Button>

                                <div className="text-center">
                                    <Link
                                        href="/forgot-password"
                                        className="text-sm text-muted-foreground hover:text-primary"
                                    >
                                        Esqueci minha senha
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-center p-4 bg-primary/10 rounded-lg">
                                        <Shield className="h-8 w-8 text-primary mr-3" />
                                        <div>
                                            <p className="font-medium">Autenticação em duas etapas</p>
                                            <p className="text-sm text-muted-foreground">Digite o código do seu aplicativo autenticador</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="twoFactorCode" className="flex items-center gap-2">
                                            <Shield className="h-4 w-4" />
                                            Código 2FA
                                        </Label>
                                        <Input
                                            id="twoFactorCode"
                                            type="text"
                                            placeholder="000000"
                                            value={twoFactorCode}
                                            onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            maxLength={6}
                                            className="text-center text-2xl font-mono tracking-widest"
                                            disabled={loginMutation.isPending}
                                            autoFocus
                                        />
                                        <p className="text-xs text-muted-foreground text-center">
                                            Código de 6 dígitos do seu aplicativo autenticador
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2 animate-in fade-in slide-in-from-bottom-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={handleBack}
                                        disabled={loginMutation.isPending}
                                    >
                                        Voltar
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        variant="gradient"
                                        disabled={loginMutation.isPending || !twoFactorCode || twoFactorCode.length !== 6}
                                    >
                                        {loginMutation.isPending ? 'Verificando...' : 'Verificar'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </form>
                </CardContent>
            </Card>

            {/* Modal de alteração de senha obrigatória */}
            <Dialog open={requiresPasswordChange} onOpenChange={(open) => {
                if (!open) {
                    setRequiresPasswordChange(false)
                    setNewPassword('')
                    setConfirmPassword('')
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5" />
                            Alteração de Senha Obrigatória
                        </DialogTitle>
                        <DialogDescription>
                            Você precisa alterar sua senha antes de fazer login. Por favor, defina uma nova senha.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-3">
                            <p className="text-sm text-yellow-600 dark:text-yellow-500">
                                ⚠️ Esta alteração é obrigatória para continuar usando o sistema
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nova Senha</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={changePasswordMutation.isPending}
                                required
                                minLength={8}
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Digite novamente"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={changePasswordMutation.isPending}
                                required
                                minLength={8}
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="submit"
                                variant="gradient"
                                disabled={changePasswordMutation.isPending || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                            >
                                {changePasswordMutation.isPending ? 'Alterando...' : 'Alterar Senha'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Spinner size="lg" />
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}
