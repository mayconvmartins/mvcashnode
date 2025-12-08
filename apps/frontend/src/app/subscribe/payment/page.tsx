'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CreditCard, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { CardPaymentForm } from '@/components/subscriptions/CardPaymentForm';
import { PixPaymentDisplay } from '@/components/subscriptions/PixPaymentDisplay';
import { PaymentStatus } from '@/components/subscriptions/PaymentStatus';
import { subscriptionsService } from '@/lib/api/subscriptions.service';
import { apiClient } from '@/lib/api/client';

function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferenceId = searchParams.get('preference_id');
  const subscriptionId = searchParams.get('subscription_id');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix' | null>(null);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64?: string;
    paymentId: string;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<any>(null);

  useEffect(() => {
    if (!preferenceId || !subscriptionId) {
      toast.error('Dados de pagamento não encontrados');
      router.push('/subscribe');
    } else {
      // Buscar dados do checkout
      fetchCheckoutData();
    }
  }, [preferenceId, subscriptionId, router]);

  const fetchCheckoutData = async () => {
    try {
      // Buscar dados da preferência ou usar dados salvos no localStorage
      // Em produção, isso viria da API ou seria passado via query params
      const savedCheckout = localStorage.getItem(`checkout_${preferenceId}`);
      if (savedCheckout) {
        const data = JSON.parse(savedCheckout);
        setCheckoutData({
          amount: data.amount,
          description: data.description,
          payerEmail: data.payerEmail,
          payerName: data.payerName,
          payerCpf: data.payerCpf,
        });
      } else {
        // Fallback: buscar do backend se possível
        toast.error('Dados do checkout não encontrados');
        router.push('/subscribe');
      }
    } catch (error) {
      console.error('Erro ao buscar dados do checkout:', error);
      toast.error('Erro ao carregar dados do pagamento');
      router.push('/subscribe');
    }
  };

  const handleCardPayment = async (paymentId: string) => {
    try {
      setPaymentStatus('in_process');
      toast.success('Pagamento processado! Verificando status...');
      
      // Verificar status do pagamento
      const checkInterval = setInterval(async () => {
        try {
          const response = await apiClient.get(`/subscriptions/payments/${paymentId}/status`);
          const status = response.data.status;
          setPaymentStatus(status);

          if (status === 'approved') {
            clearInterval(checkInterval);
            toast.success('Pagamento aprovado!');
            // Limpar dados do checkout
            if (preferenceId) {
              localStorage.removeItem(`checkout_${preferenceId}`);
            }
            router.push('/subscribe/success?payment_id=' + paymentId);
          } else if (status === 'rejected' || status === 'cancelled') {
            clearInterval(checkInterval);
            toast.error('Pagamento não aprovado');
            setPaymentStatus(status);
          } else if (status === 'in_process') {
            setPaymentStatus('in_process');
          }
        } catch (error) {
          console.error('Erro ao verificar status:', error);
        }
      }, 3000);

      // Limpar intervalo após 5 minutos
      setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao processar pagamento');
      setPaymentStatus('rejected');
    }
  };

  const handlePixPayment = async () => {
    if (!checkoutData) {
      toast.error('Dados do checkout não disponíveis');
      return;
    }

    try {
      const response = await apiClient.post('/subscriptions/payments/pix', {
        transaction_amount: Number(checkoutData.amount),
        description: checkoutData.description,
        payer: {
          email: checkoutData.payerEmail || '',
          first_name: checkoutData.payerName?.split(' ')[0] || '',
          last_name: checkoutData.payerName?.split(' ').slice(1).join(' ') || '',
          identification: {
            type: 'CPF',
            number: checkoutData.payerCpf?.replace(/\D/g, '') || '',
          },
        },
        subscription_id: subscriptionId ? parseInt(subscriptionId) : undefined,
      });

      const payment = response.data;
      setPixData({
        qrCode: payment.point_of_interaction?.transaction_data?.qr_code || '',
        qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64,
        paymentId: payment.id,
      });
      setPaymentStatus('pending');

      // Polling para verificar status do PIX
      const checkInterval = setInterval(async () => {
        try {
          const statusResponse = await apiClient.get(
            `/subscriptions/payments/${payment.id}/status`
          );
          const status = statusResponse.data.status;
          setPaymentStatus(status);

          if (status === 'approved') {
            clearInterval(checkInterval);
            toast.success('Pagamento PIX aprovado!');
            // Limpar dados do checkout
            if (preferenceId) {
              localStorage.removeItem(`checkout_${preferenceId}`);
            }
            router.push('/subscribe/success?payment_id=' + payment.id);
          } else if (status === 'rejected' || status === 'cancelled') {
            clearInterval(checkInterval);
            toast.error('Pagamento não aprovado');
            setPaymentStatus(status);
          } else {
            setPaymentStatus(status);
          }
        } catch (error) {
          console.error('Erro ao verificar status PIX:', error);
        }
      }, 5000);

      // Limpar intervalo após 30 minutos
      setTimeout(() => clearInterval(checkInterval), 30 * 60 * 1000);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Erro ao criar pagamento PIX');
      setPaymentStatus('rejected');
    }
  };

  if (!preferenceId || !subscriptionId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Finalizar Pagamento</CardTitle>
            <CardDescription>
              Escolha o método de pagamento para concluir sua assinatura
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={paymentMethod || undefined}
              onValueChange={(value) => setPaymentMethod(value as 'card' | 'pix')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="card">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Cartão de Crédito
                </TabsTrigger>
                <TabsTrigger value="pix">
                  <QrCode className="h-4 w-4 mr-2" />
                  PIX
                </TabsTrigger>
              </TabsList>

              <TabsContent value="card" className="mt-6">
                {checkoutData ? (
                  <CardPaymentForm
                    amount={Number(checkoutData.amount)}
                    description={checkoutData.description}
                    payerEmail={checkoutData.payerEmail || ''}
                    payerName={checkoutData.payerName || ''}
                    payerCpf={checkoutData.payerCpf || ''}
                    subscriptionId={subscriptionId ? parseInt(subscriptionId) : undefined}
                    onSuccess={handleCardPayment}
                    onError={(error) => toast.error(error)}
                  />
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                )}
                {paymentStatus && (
                  <div className="mt-4">
                    <PaymentStatus status={paymentStatus as any} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pix" className="mt-6">
                {pixData ? (
                  <PixPaymentDisplay
                    qrCode={pixData.qrCode}
                    qrCodeBase64={pixData.qrCodeBase64}
                    amount={Number(checkoutData?.amount || 0)}
                    onPaymentConfirmed={() => {
                      router.push('/subscribe/success?payment_id=' + pixData.paymentId);
                    }}
                  />
                ) : (
                  <div className="space-y-4">
                    <p className="text-center text-muted-foreground">
                      Clique no botão abaixo para gerar o código PIX
                    </p>
                    <Button
                      onClick={handlePixPayment}
                      className="w-full"
                      disabled={!checkoutData}
                    >
                      {checkoutData ? (
                        `Gerar Código PIX - R$ ${Number(checkoutData.amount).toFixed(2)}`
                      ) : (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Carregando...
                        </>
                      )}
                    </Button>
                  </div>
                )}
                {paymentStatus && (
                  <div className="mt-4">
                    <PaymentStatus status={paymentStatus as any} />
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-4 pt-6 mt-6 border-t">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
              >
                Voltar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12 px-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <PaymentForm />
    </Suspense>
  );
}
