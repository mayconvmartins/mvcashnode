'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

interface PixPaymentDisplayProps {
  qrCode: string;
  qrCodeBase64?: string;
  amount: number;
  onPaymentConfirmed?: () => void;
}

export function PixPaymentDisplay({
  qrCode,
  qrCodeBase64,
  amount,
  onPaymentConfirmed,
}: PixPaymentDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(qrCode);
    setCopied(true);
    toast.success('Código PIX copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckPayment = async () => {
    // Em produção, isso seria verificado via polling ou webhook
    setIsChecking(true);
    // Simular verificação
    setTimeout(() => {
      setIsChecking(false);
      toast.info('Verificando pagamento...');
    }, 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamento via PIX</CardTitle>
        <CardDescription>
          Escaneie o QR Code ou copie o código para pagar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-white rounded-lg">
            {qrCodeBase64 ? (
              <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" className="w-64 h-64" />
            ) : (
              <QRCodeSVG value={qrCode} size={256} />
            )}
          </div>

          <div className="w-full space-y-2">
            <Label className="text-sm font-medium">Código PIX (Copiar e Colar)</Label>
            <div className="flex gap-2">
              <Input
                value={qrCode}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg w-full">
            <p className="text-sm text-muted-foreground text-center">
              Valor: <span className="font-bold text-foreground">R$ {amount.toFixed(2)}</span>
            </p>
            <p className="text-xs text-muted-foreground text-center mt-2">
              O pagamento é processado automaticamente após a confirmação
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleCheckPayment}
            disabled={isChecking}
            className="w-full"
          >
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Verificando...
              </>
            ) : (
              'Verificar Pagamento'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
