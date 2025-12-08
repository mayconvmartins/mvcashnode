'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <img
              src="/MvCash_Logo.png"
              alt="MvCash Logo"
              className="h-auto w-auto max-w-[300px]"
            />
          </div>

          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Automatize suas operações de trading na Binance com operações automatizadas, gestão inteligente de posições e análise de performance em tempo real.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button
              size="lg"
              variant="gradient"
              className="text-lg px-8 py-6"
              onClick={() => window.location.href = '/subscribe'}
            >
              Começar Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6"
              onClick={() => window.location.href = 'https://app.mvcash.com.br'}
            >
              Fazer Login
            </Button>
          </div>

          {/* Features Preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
              <TrendingUp className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2 text-gray-900">Automação Completa</h3>
              <p className="text-sm text-gray-600">
                Execute operações automatizadas de forma inteligente
              </p>
            </div>
            <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
              <TrendingUp className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2 text-gray-900">Gestão Inteligente</h3>
              <p className="text-sm text-gray-600">
                Controle SL/TP e monitore posições em tempo real
              </p>
            </div>
            <div className="p-6 rounded-lg border border-gray-200 bg-gray-50">
              <TrendingUp className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-semibold mb-2 text-gray-900">Análise Avançada</h3>
              <p className="text-sm text-gray-600">
                Relatórios detalhados de performance e PnL
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

