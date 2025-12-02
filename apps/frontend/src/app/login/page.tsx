'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/lib/api/auth.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
    const router = useRouter()
    const { setTokens, setUser } = useAuthStore()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')

    const loginMutation = useMutation({
        mutationFn: authService.login,
        onSuccess: (data) => {
            setTokens(data.accessToken, data.refreshToken)
            setUser(data.user)
            router.push('/')
        },
        onError: (error: any) => {
            setError(error.response?.data?.message || 'Falha no login')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        loginMutation.mutate({ email, password })
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
                            <label htmlFor="password" className="text-sm font-medium">
                                Senha
                            </label>
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
