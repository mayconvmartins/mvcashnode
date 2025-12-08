'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo e Descrição */}
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <img
                src="/MvCash_Logo.png"
                alt="MvCash Logo"
                className="h-auto max-w-[150px]"
              />
            </div>
            <p className="text-gray-600 mb-4 max-w-md">
              Plataforma de automação de trading para Binance. Gerencie suas operações, 
              automatize estratégias e analise performance em tempo real.
            </p>
          </div>

          {/* Links Rápidos */}
          <div>
            <h3 className="font-semibold mb-4 text-gray-900">Links Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Início
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Planos
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Ajuda
                </Link>
              </li>
              <li>
                <a
                  href="https://app.mvcash.com.br/subscribe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Assinar
                </a>
              </li>
            </ul>
          </div>

          {/* Acesso */}
          <div>
            <h3 className="font-semibold mb-4 text-gray-900">Acesso</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://app.mvcash.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Login
                </a>
              </li>
              <li>
                <a
                  href="https://app.mvcash.com.br/subscribe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Criar Conta
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
          <p>&copy; {new Date().getFullYear()} MvCash. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

