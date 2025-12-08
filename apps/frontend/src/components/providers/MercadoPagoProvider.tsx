'use client';

import { useEffect, useState } from 'react';
import { initMercadoPago } from '@mercadopago/sdk-react';

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
        // Tentar buscar public key
        const response = await fetch('/api/v1/admin/mercadopago/public-key');
        if (response.ok) {
          const data = await response.json();
          if (data.public_key) {
            initMercadoPago(data.public_key, { locale: 'pt-BR' });
            setIsInitialized(true);
          }
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
