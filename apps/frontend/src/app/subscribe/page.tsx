'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { subscriptionsService } from '@/lib/api/subscriptions.service';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    Check, 
    Loader2, 
    TrendingUp, 
    Zap, 
    Shield, 
    Clock,
    Star,
    ArrowRight,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function SubscribePage() {
    const router = useRouter();
    const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'quarterly'>('monthly');

    const { data: plans, isLoading } = useQuery({
        queryKey: ['subscription', 'plans'],
        queryFn: () => subscriptionsService.getPlans(),
    });

    const handleSelectPlan = (planId: number) => {
        setSelectedPlan(planId);
        router.push(`/subscribe/checkout?plan_id=${planId}&period=${billingPeriod}`);
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                    <p className="text-muted-foreground">Carregando planos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
            {/* Hero Section */}
            <div className="relative overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full" />
                
                <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-12 sm:pt-24 sm:pb-16">
                    <div className="text-center">
                        {/* Logo/Brand */}
                        <div className="inline-flex items-center gap-2 bg-primary/10 rounded-full px-4 py-1.5 mb-6">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">MVCash Trading</span>
                        </div>
                        
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
                            Automatize seu
                            <span className="gradient-text block sm:inline sm:ml-2">Trading com IA</span>
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                            Execute suas estratégias automaticamente 24/7. 
                            Integração direta com exchanges e alertas TradingView.
                        </p>

                        {/* Features highlight */}
                        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-12">
                            <div className="flex items-center gap-2 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Zap className="h-4 w-4 text-primary" />
                                </div>
                                <span>Execução Instantânea</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                    <Shield className="h-4 w-4 text-emerald-500" />
                                </div>
                                <span>SL/TP Automático</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                    <Clock className="h-4 w-4 text-blue-500" />
                                </div>
                                <span>Operando 24/7</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pricing Section */}
            <div className="max-w-6xl mx-auto px-4 pb-16 sm:pb-24">
                {/* Billing Toggle */}
                <div className="flex justify-center mb-10">
                    <div className="inline-flex items-center rounded-full border bg-card p-1 shadow-sm">
                        <button
                            onClick={() => setBillingPeriod('monthly')}
                            className={cn(
                                'px-5 py-2.5 rounded-full text-sm font-medium transition-all',
                                billingPeriod === 'monthly'
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Mensal
                        </button>
                        <button
                            onClick={() => setBillingPeriod('quarterly')}
                            className={cn(
                                'px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                                billingPeriod === 'quarterly'
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Trimestral
                            <Badge className="bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30 text-[10px] px-1.5">
                                -10%
                            </Badge>
                        </button>
                    </div>
                </div>

                {/* Plans Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                    {plans?.map((plan, index) => {
                        const price = billingPeriod === 'monthly'
                            ? Number(plan.price_monthly)
                            : Number(plan.price_quarterly);
                        const monthlyEquivalent = billingPeriod === 'quarterly' 
                            ? price / 3 
                            : price;
                        const savings = billingPeriod === 'quarterly'
                            ? Number(plan.price_monthly) * 3 - Number(plan.price_quarterly)
                            : 0;
                        const isPopular = index === 1; // Middle plan is popular

                        return (
                            <Card
                                key={plan.id}
                                className={cn(
                                    'relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1',
                                    selectedPlan === plan.id && 'ring-2 ring-primary',
                                    isPopular && 'border-primary/50 shadow-lg lg:scale-105'
                                )}
                            >
                                {/* Popular Badge */}
                                {isPopular && (
                                    <div className="absolute top-0 right-0">
                                        <div className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-lg flex items-center gap-1">
                                            <Star className="h-3 w-3 fill-current" />
                                            Popular
                                        </div>
                                    </div>
                                )}

                                <CardHeader className="pb-0">
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold">{plan.name}</h3>
                                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                                    </div>
                                </CardHeader>

                                <CardContent className="pt-6">
                                    {/* Price */}
                                    <div className="mb-6">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm text-muted-foreground">R$</span>
                                            <span className="text-4xl font-bold tracking-tight">
                                                {price.toFixed(0)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                /{billingPeriod === 'monthly' ? 'mês' : 'trim'}
                                            </span>
                                        </div>
                                        {billingPeriod === 'quarterly' && (
                                            <p className="text-sm text-muted-foreground mt-1">
                                                R$ {monthlyEquivalent.toFixed(2)}/mês
                                            </p>
                                        )}
                                        {savings > 0 && (
                                            <Badge variant="secondary" className="mt-2 bg-emerald-500/10 text-emerald-600">
                                                Economia de R$ {savings.toFixed(2)}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Features */}
                                    {plan.features_json && Array.isArray(plan.features_json) && (
                                        <ul className="space-y-3 mb-6">
                                            {plan.features_json.map((feature: string, idx: number) => (
                                                <li key={idx} className="flex items-start gap-3">
                                                    <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <Check className="h-3 w-3 text-emerald-500" />
                                                    </div>
                                                    <span className="text-sm">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {/* CTA Button */}
                                    <Button
                                        className={cn(
                                            'w-full gap-2 h-11',
                                            isPopular && 'bg-gradient-to-r from-primary to-accent hover:opacity-90'
                                        )}
                                        onClick={() => handleSelectPlan(plan.id)}
                                        disabled={!plan.is_active}
                                    >
                                        {plan.is_active ? (
                                            <>
                                                Começar Agora
                                                <ArrowRight className="h-4 w-4" />
                                            </>
                                        ) : (
                                            'Indisponível'
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Trust indicators */}
                <div className="mt-16 text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                        Pagamento seguro via Mercado Pago ou Cripto (TransFi)
                    </p>
                    <div className="flex flex-wrap justify-center gap-6 text-muted-foreground/60">
                        <div className="flex items-center gap-2 text-sm">
                            <Shield className="h-4 w-4" />
                            SSL Certificado
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4" />
                            Cancele quando quiser
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4" />
                            Acesso imediato
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
