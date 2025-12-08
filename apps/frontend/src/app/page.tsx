'use client';

import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Pricing } from '@/components/landing/Pricing';
import { Footer } from '@/components/landing/Footer';

export default function HomePage() {
  // Esta página só deve ser servida na porta 6010 (site público)
  // Na porta 5010, o middleware redireciona para mvcash.com.br
  // Não fazer verificação no lado do cliente para evitar loops

  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </main>
  );
}

