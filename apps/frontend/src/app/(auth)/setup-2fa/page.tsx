'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { QRCodeSVG } from 'react-qr-code'
import { authService } from '@/lib/api/auth.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Shield, CheckCircle2, Copy } from 'lucide-react'

export default function Setup2FAPage() {
    const router = useRouter()
    const { user } = useAuthStore()
    const [secret, setSecret] = useState<string>('')
    const [qrCode, setQrCode] = useState<string>('')
    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [token, setToken] = useState('')
    const [step, setStep] = useState<'setup' | 'verify'>('setup')

    const setupMutation = useMutation({
        mutationFn: authService.setup2FA,
        onSuccess: (data) => {
            setSecret(data.secret)
            setQrCode(data.qrCode)
            setBackupCodes(data.backupCodes)
            setStep('verify')
            toast.success('QR Code gerado com sucesso!')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao configurar 2FA')
        },
    })

    const verifyMutation = useMutation({
        mutationFn: authService.verify2FA,
        onSuccess: () => {
            toast.success('2FA configurado com sucesso!')
            router.push('/')
        },
        onError: (error: any) => {
            toast.error(error.message || 'Código inválido')
        },
    })

    const handleSetup = () => {
        setupMutation.mutate()
    }

    const handleVerify = (e: React.FormEvent) => {
        e.preventDefault()
        if (!token || token.length !== 6) {
            toast.error('Código deve ter 6 dígitos')
            return
        }
        verifyMutation.mutate({ token })
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success('Copiado para a área de transferência!')
    }

    if (!user) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="w-full max-w-2xl glass">
                <CardHeader className="space-y-4">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center">
                            <Shield className="h-8 w-8 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center gradient-text">
                        Configurar Autenticação de Dois Fatores
                    </CardTitle>
                    <CardDescription className="text-center">
                        Proteja sua conta com autenticação de dois fatores
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {step === 'setup' ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Clique no botão abaixo para gerar o QR Code. Em seguida, escaneie-o
                                    com seu aplicativo autenticador (Google Authenticator, Authy, etc.)
                                </p>
                            </div>
                            <Button
                                onClick={handleSetup}
                                disabled={setupMutation.isPending}
                                className="w-full"
                                variant="gradient"
                            >
                                {setupMutation.isPending ? (
                                    <>
                                        <Spinner size="sm" />
                                        Gerando...
                                    </>
                                ) : (
                                    'Gerar QR Code'
                                )}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-center p-4 bg-white rounded-lg">
                                    {qrCode && <QRCodeSVG value={qrCode} size={256} />}
                                </div>
                                <div className="space-y-2">
                                    <Label>Secret Key (Backup)</Label>
                                    <div className="flex gap-2">
                                        <Input value={secret} readOnly className="font-mono" />
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={() => copyToClipboard(secret)}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Guarde este código em local seguro. Você precisará dele se perder
                                        acesso ao aplicativo autenticador.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Códigos de Backup</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {backupCodes.map((code, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between p-2 bg-muted rounded-md font-mono text-sm"
                                            >
                                                <span>{code}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => copyToClipboard(code)}
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Guarde estes códigos em local seguro. Eles podem ser usados para
                                        recuperar acesso à sua conta.
                                    </p>
                                </div>
                            </div>
                            <form onSubmit={handleVerify} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="token">Código de Verificação</Label>
                                    <Input
                                        id="token"
                                        type="text"
                                        placeholder="000000"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        maxLength={6}
                                        className="text-center text-2xl font-mono tracking-widest"
                                        disabled={verifyMutation.isPending}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Digite o código de 6 dígitos do seu aplicativo autenticador
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => setStep('setup')}
                                    >
                                        Voltar
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        variant="gradient"
                                        disabled={verifyMutation.isPending || token.length !== 6}
                                    >
                                        {verifyMutation.isPending ? (
                                            <>
                                                <Spinner size="sm" />
                                                Verificando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4" />
                                                Verificar e Ativar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

