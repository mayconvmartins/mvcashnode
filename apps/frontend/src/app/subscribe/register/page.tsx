'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { subscriptionsService } from '@/lib/api/subscriptions.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/stores/authStore';
import { authService } from '@/lib/api/auth.service';

const registerSchema = z
  .object({
    email: z.string().email('Email inválido').optional(),
    password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const prefilledEmail = searchParams.get('email') || undefined;
  const { setTokens, setUser } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    const effectiveEmail = data.email || prefilledEmail;
    if (!token && !effectiveEmail) {
      toast.error('Informe o email para finalizar o cadastro');
      return;
    }

    setIsSubmitting(true);
    try {
      await subscriptionsService.completeRegistration(token || '', data.password, effectiveEmail);

      // Tentar fazer login automaticamente
      if (effectiveEmail) {
        try {
          const loginResult = await authService.login({
            email: effectiveEmail,
            password: data.password,
          });

          if (loginResult.accessToken && loginResult.refreshToken) {
            setTokens(loginResult.accessToken, loginResult.refreshToken, false);
            if (loginResult.user) {
              setUser(loginResult.user);
            }
            toast.success('Cadastro concluído! Redirecionando...');
            router.push('/');
          }
        } catch (loginError) {
          toast.success('Cadastro concluído! Faça login para continuar.');
          router.push('/login');
        }
      } else {
        toast.success('Cadastro concluído! Faça login para continuar.');
        router.push('/login');
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Erro ao finalizar cadastro'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Finalizar Cadastro</CardTitle>
            <CardDescription>
              Defina sua senha para acessar a plataforma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!token && (
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Token não encontrado. Verifique o link do email.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="email">{token ? 'Email (opcional)' : 'Email *'}</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="seu@email.com"
                  defaultValue={prefilledEmail}
                />
                {errors.email && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="password">Senha *</Label>
                <Input
                  id="password"
                  type="password"
                  {...register('password')}
                  placeholder="Mínimo 8 caracteres"
                />
                {errors.password && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  {...register('confirmPassword')}
                  placeholder="Digite a senha novamente"
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processando...
                  </>
                ) : (
                  'Finalizar Cadastro'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
