'use client';

import { useEffect, useState } from 'react';
import { initMercadoPago } from '@mercadopago/sdk-react';
import { adminService } from '@/lib/api/admin.service';

interface MercadoPagoProviderProps {
  children: React.ReactNode;
}

export function MercadoPagoProvider({ children }: MercadoPagoProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Inicializar Mercado Pago com public key
    // A public key será obtida dinamicamente quando necessário
    // Por enquanto, inicializamos sem key (será configurado quando necessário)
    const initializeMP = async () => {
      try {
        // Tentar buscar public key usando o adminService
        const data = await adminService.getMercadoPagoPublicKey();
        if (data?.public_key) {
          initMercadoPago(data.public_key, { locale: 'pt-BR' });
          setIsInitialized(true);
        } else {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Erro ao inicializar Mercado Pago:', error);
        // Continuar mesmo sem inicializar (para desenvolvimento)
        setIsInitialized(true);
      }
    };

    initializeMP();
  }, []);

  return <>{children}</>;
}
