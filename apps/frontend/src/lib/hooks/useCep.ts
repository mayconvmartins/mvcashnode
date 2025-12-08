import { useState } from 'react';
import { toast } from 'sonner';

export interface CepData {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export function useCep() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CepData | null>(null);

  const fetchCep = async (cep: string): Promise<CepData | null> => {
    // Remove caracteres não numéricos
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      toast.error('CEP deve ter 8 dígitos');
      return null;
    }

    setLoading(true);
    try {
      // Tentar BrasilAPI primeiro
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
        if (response.ok) {
          const result = await response.json();
          setData({
            cep: result.cep,
            logradouro: result.street || '',
            complemento: result.complement || '',
            bairro: result.neighborhood || '',
            localidade: result.city || '',
            uf: result.state || '',
          });
          return data;
        }
      } catch (e) {
        // Se falhar, tentar ViaCEP
      }

      // Tentar ViaCEP como fallback
      const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (viaCepResponse.ok) {
        const result = await viaCepResponse.json();
        if (result.erro) {
          toast.error('CEP não encontrado');
          return null;
        }
        setData({
          cep: result.cep,
          logradouro: result.logradouro || '',
          complemento: result.complemento || '',
          bairro: result.bairro || '',
          localidade: result.localidade || '',
          uf: result.uf || '',
        });
        return data;
      }
    } catch (error: any) {
      toast.error('Erro ao buscar CEP');
      console.error('Erro ao buscar CEP:', error);
      return null;
    } finally {
      setLoading(false);
    }

    return null;
  };

  return {
    fetchCep,
    loading,
    data,
    clear: () => setData(null),
  };
}
