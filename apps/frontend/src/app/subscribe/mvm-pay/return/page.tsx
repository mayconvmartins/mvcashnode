'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ExternalLink } from 'lucide-react';

function ReturnInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = searchParams.get('status') || 'pending';
  const state = searchParams.get('state') || '';
  const [email, setEmail] = useState('');

  const statusLabel = useMemo(() => {
    if (status === 'success') return 'Pagamento identificado';
    if (status === 'failure') return 'Pagamento não concluído';
    return 'Pagamento em processamento';
  }, [status]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>MvM Pay</CardTitle>
            <CardDescription>
              Retorno do checkout externo. {statusLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {state ? (
                <p>state: <span className="font-mono">{state}</span></p>
              ) : (
                <p>state não informado.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use o mesmo email utilizado no checkout do MvM Pay.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => router.push(`/subscribe/register?email=${encodeURIComponent(email)}`)}
                disabled={!email}
              >
                Finalizar cadastro
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/subscribe')}
              >
                Voltar
              </Button>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <ExternalLink className="h-3 w-3" />
              Se ainda estiver pendente, aguarde e tente novamente em alguns minutos.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MvmPayReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <ReturnInner />
    </Suspense>
  );
}

