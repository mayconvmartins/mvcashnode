'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/lib/api/auth.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { setTokens, setUser } = useAuthStore()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [twoFactorCode, setTwoFactorCode] = useState('')
    const [error, setError] = useState('')

    const loginMutation = useMutation({
        mutationFn: authService.login,
        onSuccess: (data) => {
            // Salvar tokens e usuário
            setTokens(data.accessToken, data.refreshToken)
            setUser(data.user)
            toast.success('Login realizado com sucesso!')
            
            // Aguardar para garantir que os cookies foram salvos
            setTimeout(() => {
                const redirect = searchParams.get('redirect')
                // Usar window.location.replace para forçar reload completo
                window.location.replace(redirect || '/')
            }, 200)
        },
        onError: (error: any) => {
            const errorMessage = error.message || error.response?.data?.message || 'Falha no login'
            setError(errorMessage)
            toast.error(errorMessage)
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        loginMutation.mutate({ 
            email, 
            password,
            ...(twoFactorCode ? { twoFactorCode } : {})
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
                        Entre com suas credenciais para acessar o dashboard
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-destructive/10 border border-destructive/50 text-destructive text-sm p-3 rounded-md">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
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
                            />
                        </div>

                        <div className="space-y-2">
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

                        <div className="space-y-2">
                            <Label htmlFor="twoFactorCode" className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                Código 2FA (opcional)
                            </Label>
                            <Input
                                id="twoFactorCode"
                                type="text"
                                placeholder="000000"
                                value={twoFactorCode}
                                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                className="text-center text-lg font-mono tracking-widest"
                                disabled={loginMutation.isPending}
                            />
                            <p className="text-xs text-muted-foreground">
                                Digite o código de 6 dígitos se você habilitou 2FA
                            </p>
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            variant="gradient"
                            disabled={loginMutation.isPending}
                        >
                            {loginMutation.isPending ? 'Entrando...' : 'Entrar'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
