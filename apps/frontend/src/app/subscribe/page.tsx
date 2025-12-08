'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { subscriptionsService, SubscriptionPlan } from '@/lib/api/subscriptions.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Escolha seu Plano</h1>
          <p className="text-muted-foreground text-lg">
            Acesso completo à plataforma de trading automatizado
          </p>
        </div>

        {/* Toggle Mensal/Trimestral */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border p-1 bg-muted">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingPeriod('quarterly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingPeriod === 'quarterly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Trimestral
              <span className="ml-1 text-xs text-green-600">-10%</span>
            </button>
          </div>
        </div>

        {/* Planos */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans?.map((plan) => {
            const price =
              billingPeriod === 'monthly'
                ? Number(plan.price_monthly)
                : Number(plan.price_quarterly);
            const savings =
              billingPeriod === 'quarterly'
                ? Number(plan.price_monthly) * 3 - Number(plan.price_quarterly)
                : 0;

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  selectedPlan === plan.id ? 'ring-2 ring-primary' : ''
                }`}
              >
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold">R$ {price.toFixed(2)}</span>
                      <span className="text-muted-foreground ml-2">
                        /{billingPeriod === 'monthly' ? 'mês' : 'trimestre'}
                      </span>
                    </div>
                    {savings > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        Economize R$ {savings.toFixed(2)} no trimestre
                      </p>
                    )}
                  </div>

                  {plan.features_json && (
                    <ul className="space-y-2 mb-6">
                      {Array.isArray(plan.features_json) &&
                        plan.features_json.map((feature: string, idx: number) => (
                          <li key={idx} className="flex items-start">
                            <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                    </ul>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={!plan.is_active}
                  >
                    {plan.is_active ? 'Assinar Agora' : 'Indisponível'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
