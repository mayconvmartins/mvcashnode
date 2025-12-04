'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/lib/api/auth.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Lock, CheckCircle2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function ResetPasswordPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [token, setToken] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordReset, setPasswordReset] = useState(false)

    useEffect(() => {
        const tokenParam = searchParams.get('token')
        if (tokenParam) {
            setToken(tokenParam)
        } else {
            toast.error('Token de recuperação não encontrado')
        }
    }, [searchParams])

    const resetPasswordMutation = useMutation({
        mutationFn: authService.resetPassword,
        onSuccess: () => {
            setPasswordReset(true)
            toast.success('Senha redefinida com sucesso!')
            setTimeout(() => {
                router.push('/login')
            }, 3000)
        },
        onError: (error: any) => {
            const errorMessage = error.message || error.response?.data?.message || 'Erro ao redefinir senha'
            toast.error(errorMessage)
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        if (!token) {
            toast.error('Token de recuperação não encontrado')
            return
        }

        if (newPassword.length < 8) {
            toast.error('A senha deve ter pelo menos 8 caracteres')
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error('As senhas não coincidem')
            return
        }

        resetPasswordMutation.mutate({
            token,
            newPassword,
        })
    }

    if (passwordReset) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
                <Card className="w-full max-w-md glass">
                    <CardHeader className="space-y-4">
                        <div className="flex justify-center">
                            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                            </div>
                        </div>
                        <CardTitle className="text-2xl text-center gradient-text">
                            Senha Redefinida!
                        </CardTitle>
                        <CardDescription className="text-center">
                            Sua senha foi redefinida com sucesso. Você será redirecionado para o login.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="gradient"
                            className="w-full"
                            asChild
                        >
                            <Link href="/login">
                                Ir para Login
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="w-full max-w-md glass">
                <CardHeader className="space-y-4">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center">
                            <Lock className="h-8 w-8 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center gradient-text">
                        Redefinir Senha
                    </CardTitle>
                    <CardDescription className="text-center">
                        Digite sua nova senha
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nova Senha</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={resetPasswordMutation.isPending || !token}
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
                                disabled={resetPasswordMutation.isPending || !token}
                                required
                                minLength={8}
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            variant="gradient"
                            disabled={resetPasswordMutation.isPending || !token || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                        >
                            {resetPasswordMutation.isPending ? (
                                <>
                                    <Spinner size="sm" />
                                    Redefinindo...
                                </>
                            ) : (
                                <>
                                    <Lock className="h-4 w-4 mr-2" />
                                    Redefinir Senha
                                </>
                            )}
                        </Button>

                        <div className="text-center">
                            <Link
                                href="/login"
                                className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Voltar ao Login
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Spinner size="lg" />
            </div>
        }>
            <ResetPasswordPageContent />
        </Suspense>
    )
}

