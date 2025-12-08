'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { useEffect, useState, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

function SuccessForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preferenceId = searchParams.get('preference_id');
  const [showRegistration, setShowRegistration] = useState(false);

  useEffect(() => {
    // Verificar se precisa finalizar cadastro
    // Em produção, isso seria verificado via API
    if (preferenceId) {
      // Aguardar alguns segundos antes de mostrar opção de registro
      const timer = setTimeout(() => {
        setShowRegistration(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [preferenceId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Pagamento Recebido!</CardTitle>
            <CardDescription>
              Seu pagamento foi processado com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">
              Aguarde a confirmação do pagamento. Você receberá um email com
              instruções para finalizar seu cadastro e acessar a plataforma.
            </p>

            {showRegistration && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm mb-2">
                  Se você já recebeu o email de confirmação, pode finalizar seu
                  cadastro agora:
                </p>
                <Button
                  onClick={() => router.push('/subscribe/register')}
                  className="w-full"
                >
                  Finalizar Cadastro
                </Button>
              </div>
            )}

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => router.push('/login')}
                className="flex-1"
              >
                Fazer Login
              </Button>
              <Button
                onClick={() => router.push('/')}
                className="flex-1"
              >
                Ir para Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <SuccessForm />
    </Suspense>
  );
}
