'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { Pricing } from '@/components/landing/Pricing';
import { Footer } from '@/components/landing/Footer';

export default function HomePage() {
  const router = useRouter();
  const siteMode = process.env.NEXT_PUBLIC_SITE_MODE || 'app';

  useEffect(() => {
    // Se estiver na porta 5010 (app), redirecionar para login
    // O middleware já faz isso, mas garantir no cliente também
    if (siteMode === 'app' && typeof window !== 'undefined') {
      router.replace('/login');
    }
  }, [siteMode, router]);

  // Se não for site público, não renderizar nada (será redirecionado)
  if (siteMode !== 'public') {
    return null;
  }

  // Esta página só deve ser servida na porta 6010 (site público)
  return (
    <main className="min-h-screen bg-white">
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </main>
  );
}

