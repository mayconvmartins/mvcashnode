'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Fingerprint, Shield, Zap, X, Loader2 } from 'lucide-react'
import { authService } from '@/lib/api/auth.service'
import { startRegistration } from '@simplewebauthn/browser'
import { toast } from 'sonner'

const STORAGE_KEY = 'mvcash_skip_passkey_prompt'

interface PasskeyEnrollmentPromptProps {
    onComplete?: () => void
}

export function PasskeyEnrollmentPrompt({ onComplete }: PasskeyEnrollmentPromptProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isRegistering, setIsRegistering] = useState(false)
    const [isPasskeySupported, setIsPasskeySupported] = useState(false)

    // Verificar suporte a Passkeys
    useEffect(() => {
        const checkSupport = async () => {
            if (typeof window === 'undefined' || !window.PublicKeyCredential) {
                return
            }

            try {
                const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                setIsPasskeySupported(available)
            } catch {
                setIsPasskeySupported(false)
            }
        }

        checkSupport()
    }, [])

    // Buscar passkeys do usuário
    const { data: passkeys, isLoading: isLoadingPasskeys } = useQuery({
        queryKey: ['passkeys'],
        queryFn: () => authService.listPasskeys(),
        enabled: isPasskeySupported,
        retry: false,
    })

    // Verificar se deve mostrar o prompt
    useEffect(() => {
        // Aguardar verificações
        if (isLoadingPasskeys || !isPasskeySupported) {
            return
        }

        // Se não suporta Passkeys, não mostrar
        if (!isPasskeySupported) {
            onComplete?.()
            return
        }

        // Se já tem passkeys, não mostrar
        if (passkeys && passkeys.length > 0) {
            onComplete?.()
            return
        }

        // Se usuário marcou "não perguntar novamente"
        if (typeof window !== 'undefined') {
            const skipPrompt = localStorage.getItem(STORAGE_KEY)
            if (skipPrompt === 'true') {
                onComplete?.()
                return
            }
        }

        // Aguardar um pouco para não sobrepor outros prompts
        const timer = setTimeout(() => {
            setIsOpen(true)
        }, 500)

        return () => clearTimeout(timer)
    }, [isLoadingPasskeys, isPasskeySupported, passkeys, onComplete])

    const handleRegister = async () => {
        setIsRegistering(true)
        try {
            // Obter opções de registro do servidor
            const options = await authService.passkeyRegisterStart()
            
            // Iniciar registro via WebAuthn
            const registrationResponse = await startRegistration(options)
            
            // Enviar resposta para o servidor
            await authService.passkeyRegisterFinish(registrationResponse)
            
            toast.success('Passkey cadastrada com sucesso!')
            setIsOpen(false)
            onComplete?.()
        } catch (err: any) {
            // Ignorar cancelamentos
            if (err.name === 'NotAllowedError' || err.message?.includes('cancelled')) {
                return
            }
            console.error('[PasskeyEnrollment] Erro:', err)
            toast.error(err.message || 'Erro ao cadastrar Passkey')
        } finally {
            setIsRegistering(false)
        }
    }

    const handleLater = () => {
        setIsOpen(false)
        onComplete?.()
    }

    const handleNeverAsk = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, 'true')
        }
        setIsOpen(false)
        onComplete?.()
    }

    if (!isOpen) {
        return null
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                handleLater()
            }
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                        <Fingerprint className="h-8 w-8 text-primary" />
                    </div>
                    <DialogTitle className="text-center text-xl">
                        Configurar Login Rápido?
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        Use sua biometria (Face ID, Touch ID, Windows Hello) para fazer login instantaneamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Zap className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Login em 1 segundo</p>
                            <p className="text-xs text-muted-foreground">
                                Sem digitar email e senha
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Shield className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Mais seguro que senhas</p>
                            <p className="text-xs text-muted-foreground">
                                Imune a phishing e roubo de credenciais
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Fingerprint className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Funciona em todos dispositivos</p>
                            <p className="text-xs text-muted-foreground">
                                iPhone, Android, Windows, Mac
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                        onClick={handleRegister}
                        disabled={isRegistering}
                        className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    >
                        {isRegistering ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Configurando...
                            </>
                        ) : (
                            <>
                                <Fingerprint className="h-4 w-4 mr-2" />
                                Configurar Passkey
                            </>
                        )}
                    </Button>
                    <div className="flex gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={handleLater}
                            className="flex-1"
                            disabled={isRegistering}
                        >
                            Mais Tarde
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleNeverAsk}
                            className="flex-1 text-muted-foreground"
                            disabled={isRegistering}
                        >
                            <X className="h-4 w-4 mr-1" />
                            Não perguntar
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// Função para resetar a preferência (útil para testes)
export function resetPasskeyPromptPreference() {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
    }
}

