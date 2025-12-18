'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    CheckCircle2, 
    Loader2, 
    ArrowRight, 
    Mail, 
    Sparkles,
    TrendingUp,
    LogIn,
} from 'lucide-react';
import { useEffect, useState, Suspense } from 'react';
import { cn } from '@/lib/utils';

function ConfettiEffect() {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
            {[...Array(50)].map((_, i) => (
                <div
                    key={i}
                    className="absolute animate-confetti"
                    style={{
                        left: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 3}s`,
                        animationDuration: `${3 + Math.random() * 2}s`,
                    }}
                >
                    <div
                        className={cn(
                            'w-3 h-3 rounded-sm',
                            ['bg-primary', 'bg-accent', 'bg-emerald-500', 'bg-yellow-500', 'bg-pink-500'][Math.floor(Math.random() * 5)]
                        )}
                        style={{
                            transform: `rotate(${Math.random() * 360}deg)`,
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

function SuccessForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const preferenceId = searchParams.get('preference_id');
    const [showRegistration, setShowRegistration] = useState(false);
    const [showConfetti, setShowConfetti] = useState(true);

    useEffect(() => {
        // Hide confetti after 5 seconds
        const confettiTimer = setTimeout(() => {
            setShowConfetti(false);
        }, 5000);

        // Show registration option after 3 seconds
        if (preferenceId) {
            const regTimer = setTimeout(() => {
                setShowRegistration(true);
            }, 3000);
            return () => {
                clearTimeout(confettiTimer);
                clearTimeout(regTimer);
            };
        }

        return () => clearTimeout(confettiTimer);
    }, [preferenceId]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 flex items-center justify-center p-4">
            {showConfetti && <ConfettiEffect />}
            
            <div className="w-full max-w-lg">
                <Card className="relative overflow-hidden border-0 shadow-2xl">
                    {/* Background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-primary/5" />
                    
                    <CardContent className="relative p-8 sm:p-10">
                        {/* Success Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                                </div>
                                <div className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-yellow-500 flex items-center justify-center animate-bounce">
                                    <Sparkles className="h-3 w-3 text-white" />
                                </div>
                            </div>
                        </div>

                        {/* Title */}
                        <div className="text-center mb-8">
                            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                                Pagamento Confirmado! 🎉
                            </h1>
                            <p className="text-muted-foreground">
                                Bem-vindo à família MVCash Trading
                            </p>
                        </div>

                        {/* Steps */}
                        <div className="space-y-4 mb-8">
                            <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <Mail className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-medium">Verifique seu Email</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Enviamos instruções para finalizar seu cadastro
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                                </div>
                                <div>
                                    <h3 className="font-medium">Configure sua Conta</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Conecte suas exchanges e configure seus parâmetros
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Registration CTA */}
                        {showRegistration && (
                            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6 animate-fade-in">
                                <p className="text-sm text-center mb-3">
                                    Já recebeu o email de confirmação?
                                </p>
                                <Button
                                    onClick={() => router.push('/subscribe/register')}
                                    className="w-full gap-2"
                                    size="lg"
                                >
                                    Finalizar Cadastro
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button
                                variant="outline"
                                onClick={() => router.push('/login')}
                                className="flex-1 gap-2"
                            >
                                <LogIn className="h-4 w-4" />
                                Fazer Login
                            </Button>
                            <Button
                                onClick={() => router.push('/')}
                                className="flex-1 gap-2"
                            >
                                Ir para Dashboard
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Help text */}
                <p className="text-center text-sm text-muted-foreground mt-6">
                    Problemas? Entre em contato com{' '}
                    <a href="mailto:suporte@mvcash.com" className="text-primary hover:underline">
                        suporte@mvcash.com
                    </a>
                </p>
            </div>
        </div>
    );
}

export const dynamic = 'force-dynamic';

export default function SuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Carregando...</p>
                </div>
            </div>
        }>
            <SuccessForm />
        </Suspense>
    );
}
