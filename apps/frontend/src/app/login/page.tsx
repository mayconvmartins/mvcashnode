'use client'

import { useState, useEffect, Suspense, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/lib/api/auth.service'
import { useAuthStore } from '@/lib/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Shield, Lock, Fingerprint, Eye, EyeOff, Mail, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { startAuthentication } from '@simplewebauthn/browser'
import { markLoginTime } from '@/components/auth/PostLoginPrompts'

function LoginPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { setTokens, setUser, logout } = useAuthStore()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [twoFactorCode, setTwoFactorCode] = useState('')
    const [error, setError] = useState('')
    const [requires2FA, setRequires2FA] = useState(false)
    const [sessionToken, setSessionToken] = useState<string | null>(null)
    const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(false)
    const [hasPasskeys, setHasPasskeys] = useState(false)
    const [isPasskeySupported, setIsPasskeySupported] = useState(false)
    const [isCheckingPasskeys, setIsCheckingPasskeys] = useState(false)
    const [isConditionalUISupported, setIsConditionalUISupported] = useState(false)
    const [isConditionalUIActive, setIsConditionalUIActive] = useState(false)
    
    // AbortController para cancelar conditional UI quando necessário
    const conditionalUIAbortController = useRef<AbortController | null>(null)
    
    // Flag para evitar reiniciar o Conditional UI após erro ou cancelamento
    const conditionalUIStartedRef = useRef(false)
    // Flag para indicar que login foi bem-sucedido e não deve mais iniciar Conditional UI
    const loginSuccessfulRef = useRef(false)

    // Verificar suporte a Passkeys e Conditional UI
    useEffect(() => {
        const checkSupport = async () => {
            if (typeof window === 'undefined' || !window.PublicKeyCredential) {
                console.log('[Passkey Support] WebAuthn não disponível')
                return
            }

            try {
                // Verificar suporte básico a Passkeys
                const platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
                console.log('[Passkey Support] Platform authenticator:', platformAvailable)
                setIsPasskeySupported(platformAvailable)

                // Verificar suporte a Conditional UI (autofill)
                if (typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
                    const conditionalAvailable = await PublicKeyCredential.isConditionalMediationAvailable()
                    console.log('[Passkey Support] Conditional UI:', conditionalAvailable)
                    setIsConditionalUISupported(conditionalAvailable)
                } else {
                    console.log('[Passkey Support] Conditional UI não suportado pelo browser')
                }
            } catch (err) {
                console.error('[Passkey Support] Erro ao verificar suporte:', err)
                setIsPasskeySupported(false)
                setIsConditionalUISupported(false)
            }
        }

        checkSupport()
    }, [])

    // Iniciar Conditional UI (Passkey Autofill) quando suportado
    const startConditionalUI = useCallback(async () => {
        // Não iniciar se está ativo ou login foi bem-sucedido
        if (isConditionalUIActive || loginSuccessfulRef.current) {
            console.log('[ConditionalUI] Pulando - já ativo ou login bem-sucedido')
            return
        }

        if (!isConditionalUISupported) {
            console.log('[ConditionalUI] Pulando - não suportado')
            return
        }

        // Verificar se já foi iniciado nesta sessão (evita loop)
        if (conditionalUIStartedRef.current) {
            console.log('[ConditionalUI] Pulando - já foi iniciado nesta sessão')
            return
        }

        // Marcar como iniciado para não reiniciar em loop
        conditionalUIStartedRef.current = true
        console.log('[ConditionalUI] Iniciando autofill de Passkey...')

        try {
            // Cancelar qualquer autenticação condicional anterior
            if (conditionalUIAbortController.current) {
                conditionalUIAbortController.current.abort()
            }

            // Criar novo AbortController
            conditionalUIAbortController.current = new AbortController()
            setIsConditionalUIActive(true)

            // Obter opções de autenticação do servidor (sem email específico)
            const options = await authService.passkeyAuthenticateStart()
            console.log('[ConditionalUI] Opções recebidas, aguardando seleção do usuário...')

            // Iniciar autenticação condicional (aparece no autofill)
            const authResponse = await startAuthentication({
                ...options,
                useBrowserAutofill: true,
            })

            // Se chegou aqui, o usuário selecionou uma passkey do autofill
            console.log('[ConditionalUI] Passkey selecionada, autenticando...')
            loginSuccessfulRef.current = true
            const loginResult = await authService.passkeyAuthenticateFinish(authResponse, undefined, rememberMe)
            handleLoginSuccess(loginResult)

        } catch (err: any) {
            // Ignorar erros de cancelamento e NotAllowedError (usuário fechou)
            if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
                // NÃO reiniciar o Conditional UI após o usuário fechar
                console.log('[ConditionalUI] Usuário cancelou ou fechou o prompt')
                return
            }
            console.error('[ConditionalUI] Erro:', err)
        } finally {
            setIsConditionalUIActive(false)
        }
    }, [isConditionalUISupported, isConditionalUIActive, rememberMe])

    // Ativar Conditional UI UMA VEZ quando o componente montar e suporte for detectado
    useEffect(() => {
        console.log('[ConditionalUI Effect] isSupported:', isConditionalUISupported, 'requires2FA:', requires2FA, 'started:', conditionalUIStartedRef.current)
        
        // Só iniciar se suportado, não estiver em 2FA, e não tiver sido iniciado ainda
        if (isConditionalUISupported && !requires2FA && !conditionalUIStartedRef.current) {
            console.log('[ConditionalUI Effect] Chamando startConditionalUI...')
            startConditionalUI()
        }

        // Cleanup: cancelar ao desmontar
        return () => {
            if (conditionalUIAbortController.current) {
                conditionalUIAbortController.current.abort()
            }
        }
    }, [isConditionalUISupported, requires2FA, startConditionalUI])

    // Verificar se o email tem passkeys (para mostrar botão manual)
    useEffect(() => {
        if (email && email.includes('@') && isPasskeySupported) {
            const timer = setTimeout(async () => {
                setIsCheckingPasskeys(true)
                try {
                    const result = await authService.checkEmailHasPasskeys(email)
                    setHasPasskeys(result.hasPasskeys)
                } catch {
                    setHasPasskeys(false)
                } finally {
                    setIsCheckingPasskeys(false)
                }
            }, 500)
            return () => clearTimeout(timer)
        } else {
            setHasPasskeys(false)
        }
    }, [email, isPasskeySupported])

    // Limpar qualquer token de impersonation ao carregar a página de login
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const accessToken = localStorage.getItem('accessToken')
            if (accessToken) {
                try {
                    const parts = accessToken.split('.')
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]))
                        if (payload.isImpersonation === true) {
                            logout()
                        }
                    }
                } catch (e) {
                    localStorage.removeItem('isImpersonating')
                    localStorage.removeItem('originalAdminToken')
                }
            } else {
                localStorage.removeItem('isImpersonating')
                localStorage.removeItem('originalAdminToken')
            }
        }
    }, [logout])

    const loginMutation = useMutation({
        mutationFn: authService.login,
        onSuccess: (data) => {
            handleLoginSuccess(data)
        },
        onError: (error: any) => {
            const errorMessage = error.message || error.response?.data?.message || 'Falha no login'
            
            if (errorMessage.includes('É necessário alterar a senha') || errorMessage.includes('alterar a senha antes')) {
                setRequiresPasswordChange(true)
                setError('')
                return
            }
            
            setError(errorMessage)
            toast.error(errorMessage)
        },
    })

    const passkeyMutation = useMutation({
        mutationFn: async () => {
            // Cancelar Conditional UI se estiver ativo
            if (conditionalUIAbortController.current) {
                conditionalUIAbortController.current.abort()
            }

            // Obter opções de autenticação
            const options = await authService.passkeyAuthenticateStart(email || undefined)
            
            // Usar WebAuthn API para autenticar (modo modal, não autofill)
            const authResponse = await startAuthentication(options)
            
            // Enviar resposta para o servidor
            return authService.passkeyAuthenticateFinish(authResponse, email || undefined, rememberMe)
        },
        onSuccess: (data) => {
            handleLoginSuccess(data)
        },
        onError: (error: any) => {
            // Tratar erros específicos do WebAuthn
            if (error.name === 'NotAllowedError') {
                // Este erro pode significar várias coisas
                const msg = error.message?.toLowerCase() || ''
                if (msg.includes('timed out')) {
                    toast.error('Tempo esgotado. Tente novamente.')
                    setError('A operação expirou. Clique no botão novamente para tentar.')
                } else if (msg.includes('not allowed')) {
                    toast.error('Operação bloqueada pelo navegador')
                    setError('Nenhuma Passkey encontrada ou a operação foi bloqueada. Use email e senha.')
                } else {
                    // Usuário apenas cancelou - não mostrar erro
                    console.log('[Passkey] Usuário cancelou a operação')
                }
                return
            }
            
            if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
                // Usuário cancelou - não mostrar erro
                console.log('[Passkey] Operação cancelada')
                return
            }
            
            // Outros erros
            const errorMessage = error.message || 'Falha na autenticação com Passkey'
            setError(errorMessage)
            toast.error(errorMessage)
        },
    })

    const handleLoginSuccess = (data: any) => {
        // Marcar login como bem-sucedido para parar Conditional UI
        loginSuccessfulRef.current = true
        
        // Cancelar Conditional UI
        if (conditionalUIAbortController.current) {
            conditionalUIAbortController.current.abort()
        }

        if (data.requires2FA && data.sessionToken) {
            setRequires2FA(true)
            setSessionToken(data.sessionToken)
            toast.info('Por favor, informe o código 2FA')
            return
        }

        if (typeof window !== 'undefined') {
            localStorage.removeItem('isImpersonating')
            localStorage.removeItem('originalAdminToken')
        }
        
        if (data.accessToken && data.refreshToken && data.user) {
            setTokens(data.accessToken, data.refreshToken, rememberMe, data.expiresIn)
            setUser(data.user)
            
            // Marcar momento do login para exibir prompts pós-login
            markLoginTime()
            
            toast.success('Login realizado com sucesso!')
            
            setTimeout(() => {
                const redirect = searchParams.get('redirect')
                window.location.replace(redirect || '/')
            }, 200)
        } else {
            setError('Resposta inválida do servidor')
            toast.error('Erro ao realizar login')
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        // Cancelar Conditional UI ao fazer login manual
        if (conditionalUIAbortController.current) {
            conditionalUIAbortController.current.abort()
        }

        if (requires2FA && sessionToken) {
            loginMutation.mutate({ 
                email, 
                password,
                twoFactorCode
            })
        } else {
            loginMutation.mutate({ 
                email, 
                password,
                rememberMe
            })
        }
    }

    const handlePasskeyLogin = () => {
        setError('')
        passkeyMutation.mutate()
    }

    const handleBack = () => {
        setRequires2FA(false)
        setSessionToken(null)
        setTwoFactorCode('')
        setError('')
        // NÃO reiniciar Conditional UI ao voltar
        // O usuário pode usar email/senha ou clicar no botão de Passkey manualmente
    }

    const changePasswordMutation = useMutation({
        mutationFn: authService.changePasswordRequired,
        onSuccess: () => {
            toast.success('Senha alterada com sucesso! Faça login com sua nova senha.')
            setRequiresPasswordChange(false)
            setPassword('')
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

    const isPending = loginMutation.isPending || passkeyMutation.isPending

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />

            <Card className="w-full max-w-md relative backdrop-blur-xl bg-slate-900/80 border-slate-800 shadow-2xl">
                <CardHeader className="space-y-4 pb-2">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
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
                    <div className="space-y-1">
                        <CardTitle className="text-2xl text-center text-white">
                            MVCash Trading
                        </CardTitle>
                        <CardDescription className="text-center text-slate-400">
                            {requires2FA 
                                ? 'Informe o código 2FA para continuar' 
                                : 'Entre com suas credenciais'}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-4">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg animate-in fade-in">
                                {error}
                            </div>
                        )}

                        {!requires2FA ? (
                            <>
                                {/* Email - com suporte a WebAuthn Conditional UI */}
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-slate-300 flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        Email
                                    </Label>
                                    <Input
                                        id="email"
                                        name="username"
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={isPending}
                                        required
                                        autoFocus
                                        autoComplete="username webauthn"
                                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500"
                                    />
                                    {isCheckingPasskeys && (
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Verificando Passkeys...
                                        </p>
                                    )}
                                    {isConditionalUISupported && !hasPasskeys && !isCheckingPasskeys && (
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <Fingerprint className="h-3 w-3" />
                                            Passkeys disponíveis aparecerão no autofill
                                        </p>
                                    )}
                                </div>

                                {/* Passkey Button - mostrar se email tem passkeys */}
                                {hasPasskeys && isPasskeySupported && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50 text-white hover:bg-purple-500/20 transition-all"
                                        onClick={handlePasskeyLogin}
                                        disabled={isPending}
                                    >
                                        {passkeyMutation.isPending ? (
                                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                        ) : (
                                            <Fingerprint className="h-5 w-5 mr-2" />
                                        )}
                                        Entrar com Passkey
                                    </Button>
                                )}

                                {/* Divider quando tem passkeys */}
                                {hasPasskeys && isPasskeySupported && (
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <span className="w-full border-t border-slate-700" />
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-slate-900 px-2 text-slate-500">ou com senha</span>
                                        </div>
                                    </div>
                                )}

                                {/* Password */}
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-slate-300 flex items-center gap-2">
                                        <KeyRound className="h-4 w-4" />
                                        Senha
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            id="password"
                                            name="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            disabled={isPending}
                                            required
                                            autoComplete="current-password"
                                            className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Remember Me */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="rememberMe"
                                            checked={rememberMe}
                                            onCheckedChange={(checked) => setRememberMe(checked === true)}
                                            disabled={isPending}
                                            className="border-slate-600 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                                        />
                                        <Label
                                            htmlFor="rememberMe"
                                            className="text-sm text-slate-400 cursor-pointer"
                                        >
                                            Lembrar de mim
                                        </Label>
                                    </div>
                                    <Link
                                        href="/forgot-password"
                                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        Esqueci a senha
                                    </Link>
                                </div>

                                {/* Submit Button */}
                                <Button
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25 transition-all"
                                    disabled={isPending || !email || !password}
                                >
                                    {loginMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Verificando...
                                        </>
                                    ) : (
                                        'Entrar'
                                    )}
                                </Button>

                                {/* Passkey hint */}
                                {isPasskeySupported && !hasPasskeys && email && !isConditionalUISupported && (
                                    <p className="text-xs text-center text-slate-500">
                                        Dica: Configure Passkeys no seu perfil para login mais rápido e seguro
                                    </p>
                                )}
                            </>
                        ) : (
                            /* 2FA Section */
                            <>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-center p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                        <Shield className="h-8 w-8 text-blue-400 mr-3" />
                                        <div>
                                            <p className="font-medium text-white">Verificação em duas etapas</p>
                                            <p className="text-sm text-slate-400">Digite o código do seu autenticador</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="twoFactorCode" className="text-slate-300 flex items-center gap-2">
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
                                            className="text-center text-2xl font-mono tracking-widest bg-slate-800/50 border-slate-700 text-white"
                                            disabled={isPending}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                                        onClick={handleBack}
                                        disabled={isPending}
                                    >
                                        Voltar
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                                        disabled={isPending || !twoFactorCode || twoFactorCode.length !== 6}
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
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <Lock className="h-5 w-5" />
                            Alteração de Senha Obrigatória
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Você precisa alterar sua senha antes de fazer login.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                            <p className="text-sm text-yellow-500">
                                ⚠️ Esta alteração é obrigatória para continuar usando o sistema
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="newPassword" className="text-slate-300">Nova Senha</Label>
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
                                className="bg-slate-800/50 border-slate-700 text-white"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-slate-300">Confirmar Nova Senha</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Digite novamente"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={changePasswordMutation.isPending}
                                required
                                minLength={8}
                                className="bg-slate-800/50 border-slate-700 text-white"
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-blue-500 to-purple-600"
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
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Spinner size="lg" />
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}
