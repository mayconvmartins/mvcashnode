'use client';

import { useQuery } from '@tanstack/react-query';
import { subscriptionsService, SubscriptionPlan } from '@/lib/api/subscriptions.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'quarterly'>('monthly');

  const { data: plans, isLoading, error } = useQuery({
    queryKey: ['subscription', 'plans'],
    queryFn: () => subscriptionsService.getPlans(),
  });

  if (isLoading) {
    return (
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-24 bg-white" id="pricing">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-red-600">Erro ao carregar planos. Tente novamente mais tarde.</p>
          </div>
        </div>
      </section>
    );
  }

  // Garantir que plans é um array
  const plansArray = Array.isArray(plans) ? plans : [];

  if (plansArray.length === 0) {
    return (
      <section className="py-24 bg-white" id="pricing">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-600">Nenhum plano disponível no momento.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-24 bg-white" id="pricing">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Planos e Preços
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Escolha o plano ideal para suas necessidades de trading
          </p>

          {/* Toggle Mensal/Trimestral */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-white">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'monthly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Mensal
              </button>
              <button
                onClick={() => setBillingPeriod('quarterly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'quarterly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Trimestral
                <span className="ml-1 text-xs text-green-600">-10%</span>
              </button>
            </div>
          </div>
        </div>

        {/* Planos */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plansArray.map((plan) => {
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
                className="relative flex flex-col"
              >
                <CardHeader>
                  <CardTitle className="text-2xl text-gray-900">{plan.name}</CardTitle>
                  <CardDescription className="text-gray-600">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-gray-900">R$ {price.toFixed(2)}</span>
                      <span className="text-gray-600 ml-2">
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
                    <ul className="space-y-2 mb-6 flex-1">
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
                    className="w-full mt-auto"
                    variant={plan.is_active ? 'default' : 'outline'}
                    onClick={() => {
                      if (plan.is_active) {
                        window.location.href = `https://app.mvcash.com.br/subscribe`;
                      }
                    }}
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
    </section>
  );
}

