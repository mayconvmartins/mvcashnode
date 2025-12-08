'use client';

import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo e Descrição */}
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <Image
                src="/MvCash_Logo.png"
                alt="MvCash Logo"
                width={150}
                height={50}
                className="h-auto"
              />
            </div>
            <p className="text-muted-foreground mb-4 max-w-md">
              Plataforma de automação de trading para Binance. Gerencie suas operações, 
              automatize estratégias e analise performance em tempo real.
            </p>
          </div>

          {/* Links Rápidos */}
          <div>
            <h3 className="font-semibold mb-4">Links Rápidos</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  Início
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                  Planos
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-muted-foreground hover:text-foreground transition-colors">
                  Ajuda
                </Link>
              </li>
              <li>
                <Link href="/subscribe" className="text-muted-foreground hover:text-foreground transition-colors">
                  Assinar
                </Link>
              </li>
            </ul>
          </div>

          {/* Acesso */}
          <div>
            <h3 className="font-semibold mb-4">Acesso</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://app.mvcash.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Login
                </a>
              </li>
              <li>
                <Link href="/subscribe" className="text-muted-foreground hover:text-foreground transition-colors">
                  Criar Conta
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} MvCash. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

