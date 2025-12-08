'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { subscriptionsService } from '@/lib/api/subscriptions.service';
import { useCep } from '@/lib/hooks/useCep';
import { validateCpf, formatCpf } from '@/lib/utils/cpf-validation';
import { maskCpf, maskCep, maskPhone } from '@/lib/utils/mask';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const checkoutSchema = z.object({
  full_name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  cpf: z
    .string()
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF inválido')
    .refine((cpf) => validateCpf(cpf), {
      message: 'CPF inválido. Verifique os dígitos verificadores.',
    }),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address_street: z.string().min(3, 'Rua obrigatória'),
  address_number: z.string().min(1, 'Número obrigatório'),
  address_complement: z.string().optional(),
  address_neighborhood: z.string().min(2, 'Bairro obrigatório'),
  address_city: z.string().min(2, 'Cidade obrigatória'),
  address_state: z.string().length(2, 'Estado deve ter 2 caracteres'),
  address_zipcode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

function CheckoutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan_id');
  const period = searchParams.get('period') as 'monthly' | 'quarterly' | null;
  const { fetchCep, loading: cepLoading, data: cepData } = useCep();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
  });

  const zipcode = watch('address_zipcode');

  // Buscar CEP quando mudar
  useEffect(() => {
    if (zipcode && zipcode.replace(/\D/g, '').length === 8) {
      const timeoutId = setTimeout(() => {
        fetchCep(zipcode);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [zipcode, fetchCep]);

  // Preencher campos quando CEP for encontrado
  useEffect(() => {
    if (cepData) {
      setValue('address_street', cepData.logradouro);
      setValue('address_neighborhood', cepData.bairro);
      setValue('address_city', cepData.localidade);
      setValue('address_state', cepData.uf);
      if (cepData.complemento) {
        setValue('address_complement', cepData.complemento);
      }
    }
  }, [cepData, setValue]);

  // Formatar CPF usando utilitário
  const handleCpfChange = (value: string) => {
    const formatted = maskCpf(value);
    setValue('cpf', formatted);
  };

  // Formatar CEP usando utilitário
  const handleCepChange = (value: string) => {
    const formatted = maskCep(value);
    setValue('address_zipcode', formatted);
  };

  // Formatar telefone usando utilitário
  const handlePhoneChange = (field: 'phone' | 'whatsapp', value: string) => {
    const formatted = maskPhone(value);
    setValue(field, formatted);
  };

  const onSubmit = async (data: CheckoutFormData) => {
    if (!planId || !period) {
      toast.error('Plano não selecionado');
      router.push('/subscribe');
      return;
    }

    setIsSubmitting(true);
    try {
      const checkoutData = {
        plan_id: parseInt(planId),
        billing_period: period,
        ...data,
      };

      // Buscar plano para obter valores
      const plans = await subscriptionsService.getPlans();
      const selectedPlan = plans.find(p => p.id === parseInt(planId));
      
      if (!selectedPlan) {
        toast.error('Plano não encontrado');
        return;
      }

      const amount = period === 'monthly' 
        ? Number(selectedPlan.price_monthly)
        : Number(selectedPlan.price_quarterly);

      const result = await subscriptionsService.createCheckout(checkoutData);
      
      // Salvar dados do checkout no localStorage para usar na página de pagamento
      localStorage.setItem(
        `checkout_${result.preference_id}`,
        JSON.stringify({
          amount,
          description: `${selectedPlan.name} - Assinatura ${period === 'monthly' ? 'Mensal' : 'Trimestral'}`,
          payerEmail: data.email,
          payerName: data.full_name,
          payerCpf: data.cpf,
        })
      );
      
      // Redirecionar para página de pagamento
      router.push(`/subscribe/payment?preference_id=${result.preference_id}&subscription_id=${result.subscription_id}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao criar checkout');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!planId || !period) {
    router.push('/subscribe');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Dados para Assinatura</CardTitle>
            <CardDescription>
              Preencha seus dados para continuar com o pagamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Dados Pessoais */}
              <div className="space-y-4">
                <h3 className="font-semibold">Dados Pessoais</h3>
                
                <div>
                  <Label htmlFor="full_name">Nome Completo *</Label>
                  <Input
                    id="full_name"
                    {...register('full_name')}
                    placeholder="João Silva"
                  />
                  {errors.full_name && (
                    <p className="text-sm text-red-500 mt-1">{errors.full_name.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cpf">CPF *</Label>
                    <Input
                      id="cpf"
                      {...register('cpf')}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      onChange={(e) => handleCpfChange(e.target.value)}
                    />
                    {errors.cpf && (
                      <p className="text-sm text-red-500 mt-1">{errors.cpf.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="birth_date">Data de Nascimento *</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      {...register('birth_date')}
                    />
                    {errors.birth_date && (
                      <p className="text-sm text-red-500 mt-1">{errors.birth_date.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="joao@example.com"
                  />
                  {errors.email && (
                    <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      {...register('phone')}
                      placeholder="(11) 98765-4321"
                      onChange={(e) => handlePhoneChange('phone', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      {...register('whatsapp')}
                      placeholder="(11) 98765-4321"
                      onChange={(e) => handlePhoneChange('whatsapp', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-4">
                <h3 className="font-semibold">Endereço</h3>

                  <div>
                    <Label htmlFor="address_zipcode">CEP *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="address_zipcode"
                        {...register('address_zipcode')}
                        placeholder="00000-000"
                        maxLength={9}
                        onChange={(e) => handleCepChange(e.target.value)}
                      />
                      {cepLoading && (
                        <Loader2 className="h-4 w-4 animate-spin mt-2" />
                      )}
                    </div>
                    {errors.address_zipcode && (
                      <p className="text-sm text-red-500 mt-1">{errors.address_zipcode.message}</p>
                    )}
                  </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="address_street">Rua *</Label>
                    <Input
                      id="address_street"
                      {...register('address_street')}
                      placeholder="Rua das Flores"
                    />
                    {errors.address_street && (
                      <p className="text-sm text-red-500 mt-1">{errors.address_street.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="address_number">Número *</Label>
                    <Input
                      id="address_number"
                      {...register('address_number')}
                      placeholder="123"
                    />
                    {errors.address_number && (
                      <p className="text-sm text-red-500 mt-1">{errors.address_number.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    {...register('address_complement')}
                    placeholder="Apto 45"
                  />
                </div>

                <div>
                  <Label htmlFor="address_neighborhood">Bairro *</Label>
                  <Input
                    id="address_neighborhood"
                    {...register('address_neighborhood')}
                    placeholder="Centro"
                  />
                  {errors.address_neighborhood && (
                    <p className="text-sm text-red-500 mt-1">{errors.address_neighborhood.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="address_city">Cidade *</Label>
                    <Input
                      id="address_city"
                      {...register('address_city')}
                      placeholder="São Paulo"
                    />
                    {errors.address_city && (
                      <p className="text-sm text-red-500 mt-1">{errors.address_city.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="address_state">Estado *</Label>
                    <Input
                      id="address_state"
                      {...register('address_state')}
                      placeholder="SP"
                      maxLength={2}
                      className="uppercase"
                    />
                    {errors.address_state && (
                      <p className="text-sm text-red-500 mt-1">{errors.address_state.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processando...
                    </>
                  ) : (
                    'Continuar para Pagamento'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <CheckoutForm />
    </Suspense>
  );
}
