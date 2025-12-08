'use client';

import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Pricing } from '@/components/landing/Pricing';
import { Footer } from '@/components/landing/Footer';

export default function HomePage() {
  // Esta página só deve ser servida na porta 6010 (site público)
  // Na porta 5010, o middleware redireciona para mvcash.com.br
  const siteMode = process.env.NEXT_PUBLIC_SITE_MODE || 'app';
  
  // Se por algum motivo esta página for acessada na porta 5010, redirecionar
  if (typeof window !== 'undefined' && siteMode === 'app') {
    window.location.href = 'https://mvcash.com.br';
    return null;
  }

  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </main>
  );
}

