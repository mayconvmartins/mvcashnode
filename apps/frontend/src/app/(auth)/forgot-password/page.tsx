'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/lib/api/auth.service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Mail, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [emailSent, setEmailSent] = useState(false)

    const forgotPasswordMutation = useMutation({
        mutationFn: authService.forgotPassword,
        onSuccess: () => {
            setEmailSent(true)
            toast.success('Se o email existir, um link de recuperação foi enviado')
        },
        onError: (error: any) => {
            // Sempre mostrar sucesso para não revelar se o email existe
            setEmailSent(true)
            toast.success('Se o email existir, um link de recuperação foi enviado')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!email) {
            toast.error('Por favor, informe seu email')
            return
        }
        forgotPasswordMutation.mutate(email)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="w-full max-w-md glass">
                <CardHeader className="space-y-4">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center">
                            <Mail className="h-8 w-8 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center gradient-text">
                        Recuperação de Senha
                    </CardTitle>
                    <CardDescription className="text-center">
                        {emailSent 
                            ? 'Verifique sua caixa de entrada' 
                            : 'Digite seu email para receber um link de recuperação'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {emailSent ? (
                        <div className="space-y-4">
                            <div className="bg-primary/10 border border-primary/50 rounded-lg p-4 text-center">
                                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                                <p className="text-sm text-muted-foreground mb-2">
                                    Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link de recuperação.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    O link expira em 1 hora. Verifique também sua pasta de spam.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                        setEmailSent(false)
                                        setEmail('')
                                    }}
                                >
                                    Enviar novamente
                                </Button>
                                <Button
                                    variant="gradient"
                                    className="flex-1"
                                    asChild
                                >
                                    <Link href="/login">
                                        Voltar ao Login
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="seu@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={forgotPasswordMutation.isPending}
                                    required
                                    autoFocus
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                variant="gradient"
                                disabled={forgotPasswordMutation.isPending || !email}
                            >
                                {forgotPasswordMutation.isPending ? (
                                    <>
                                        <Spinner size="sm" />
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        <Mail className="h-4 w-4 mr-2" />
                                        Enviar Link de Recuperação
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
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

