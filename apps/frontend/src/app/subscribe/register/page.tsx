'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
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
    full_name: z.string().min(3, 'Informe seu nome completo'),
    phone: z.string().optional(),
    whatsapp_phone: z.string().optional(),
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
  const { setTokens, setUser } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ email: string; expires_at: string } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const isTokenMode = useMemo(() => !!token, [token]);

  useEffect(() => {
    if (!token) return;
    setTokenLoading(true);
    subscriptionsService.getRegistrationTokenInfo(token)
      .then((info) => setTokenInfo(info))
      .catch((e: any) => {
        toast.error(e?.response?.data?.message || 'Token inválido/expirado');
      })
      .finally(() => setTokenLoading(false));
  }, [token]);

  const onSubmit = async (data: RegisterFormData) => {
    if (!token) {
      toast.error('Token não encontrado. Verifique o link do email.');
      return;
    }

    setIsSubmitting(true);
    try {
      await subscriptionsService.completeRegistration({
        token,
        password: data.password,
        full_name: data.full_name,
        phone: data.phone,
        whatsapp_phone: data.whatsapp_phone,
      });

      // Tentar fazer login automaticamente
      const effectiveEmail = tokenInfo?.email;
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
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Ativar Conta</CardTitle>
            <CardDescription>
              Complete seus dados e defina sua senha para acessar a plataforma
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

              {isTokenMode && (
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={tokenInfo?.email || (tokenLoading ? 'Carregando...' : '')} disabled />
                  {tokenInfo?.expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Link expira em {new Date(tokenInfo.expires_at).toLocaleString()}.
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="full_name">Nome completo *</Label>
                <Input id="full_name" {...register('full_name')} placeholder="Seu nome" />
                {errors.full_name && (
                  <p className="text-sm text-red-500 mt-1">{errors.full_name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" {...register('phone')} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <Label htmlFor="whatsapp_phone">WhatsApp</Label>
                  <Input id="whatsapp_phone" {...register('whatsapp_phone')} placeholder="(11) 99999-9999" />
                </div>
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
                  'Ativar e Entrar'
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
