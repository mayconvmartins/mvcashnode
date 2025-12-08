'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';

const cardPaymentSchema = z.object({
  cardNumber: z.string().min(13, 'Número do cartão inválido'),
  cardholderName: z.string().min(3, 'Nome inválido'),
  cardExpirationMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês inválido'),
  cardExpirationYear: z.string().regex(/^\d{2}$/, 'Ano inválido'),
  securityCode: z.string().min(3).max(4),
  installments: z.number().min(1).max(12),
  identificationType: z.string(),
  identificationNumber: z.string().min(8),
});

type CardPaymentFormData = z.infer<typeof cardPaymentSchema>;

interface CardPaymentFormProps {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  payerCpf: string;
  subscriptionId?: number;
  onSuccess: (paymentId: string) => void;
  onError: (error: string) => void;
}

export function CardPaymentForm({
  amount,
  description,
  payerEmail,
  payerName,
  payerCpf,
  subscriptionId,
  onSuccess,
  onError,
}: CardPaymentFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CardPaymentFormData>({
    resolver: zodResolver(cardPaymentSchema),
    defaultValues: {
      installments: 1,
      identificationType: 'CPF',
      identificationNumber: payerCpf.replace(/\D/g, ''),
    },
  });

  const installments = watch('installments');
  const identificationType = watch('identificationType');

  const onSubmit = async (data: CardPaymentFormData) => {
    setIsProcessing(true);
    try {
      // Em produção, aqui seria usado o SDK do Mercado Pago para gerar o token do cartão
      // Por enquanto, vamos usar a API do backend diretamente
      // O SDK do Mercado Pago gera um token que é enviado ao backend
      
      // TODO: Integrar com SDK do Mercado Pago para gerar token do cartão
      // Por enquanto, vamos simular ou usar endpoint do backend
      
      const response = await apiClient.post('/subscriptions/payments/card', {
        token: 'test_token', // Em produção, viria do SDK do Mercado Pago
        issuer_id: '', // Será obtido do SDK
        payment_method_id: 'credit_card',
        transaction_amount: amount,
        installments: data.installments,
        description,
        payer: {
          email: payerEmail,
          identification: {
            type: data.identificationType,
            number: data.identificationNumber.replace(/\D/g, ''),
          },
        },
        subscription_id: subscriptionId,
      });

      if (response.data.id) {
        onSuccess(response.data.id);
      } else {
        throw new Error('Erro ao processar pagamento');
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error.message || 'Erro ao processar pagamento';
      toast.error(errorMessage);
      onError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cardNumber">Número do Cartão *</Label>
        <Input
          id="cardNumber"
          placeholder="0000 0000 0000 0000"
          maxLength={19}
          {...register('cardNumber')}
        />
        {errors.cardNumber && (
          <p className="text-sm text-red-500">{errors.cardNumber.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cardholderName">Nome no Cartão *</Label>
        <Input
          id="cardholderName"
          placeholder="NOME COMO ESTÁ NO CARTÃO"
          {...register('cardholderName')}
        />
        {errors.cardholderName && (
          <p className="text-sm text-red-500">{errors.cardholderName.message}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cardExpirationMonth">Mês *</Label>
          <Input
            id="cardExpirationMonth"
            placeholder="MM"
            maxLength={2}
            {...register('cardExpirationMonth')}
          />
          {errors.cardExpirationMonth && (
            <p className="text-sm text-red-500">{errors.cardExpirationMonth.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cardExpirationYear">Ano *</Label>
          <Input
            id="cardExpirationYear"
            placeholder="AA"
            maxLength={2}
            {...register('cardExpirationYear')}
          />
          {errors.cardExpirationYear && (
            <p className="text-sm text-red-500">{errors.cardExpirationYear.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="securityCode">CVV *</Label>
          <Input
            id="securityCode"
            type="password"
            placeholder="123"
            maxLength={4}
            {...register('securityCode')}
          />
          {errors.securityCode && (
            <p className="text-sm text-red-500">{errors.securityCode.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="installments">Parcelas *</Label>
        <Select
          value={installments?.toString() || '1'}
          onValueChange={(value) => setValue('installments', parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
              <SelectItem key={num} value={num.toString()}>
                {num}x {num > 1 ? 'sem juros' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="identificationType">Tipo de Documento *</Label>
          <Select
            value={identificationType || 'CPF'}
            onValueChange={(value) => setValue('identificationType', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CPF">CPF</SelectItem>
              <SelectItem value="CNPJ">CNPJ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identificationNumber">Número do Documento *</Label>
          <Input
            id="identificationNumber"
            placeholder={identificationType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
            {...register('identificationNumber')}
          />
          {errors.identificationNumber && (
            <p className="text-sm text-red-500">{errors.identificationNumber.message}</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isProcessing} className="w-full">
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Processando...
          </>
        ) : (
          `Pagar R$ ${amount.toFixed(2)}`
        )}
      </Button>
    </form>
  );
}
