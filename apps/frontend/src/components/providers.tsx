'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { ReactNode, useState } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { WebSocketProvider } from '@/components/websocket/WebSocketProvider'
import { MercadoPagoProvider } from './providers/MercadoPagoProvider'
import { WebPushProvider } from './providers/WebPushProvider'

/**
 * Configurações de cache do React Query otimizadas para performance
 * 
 * staleTime: Tempo que os dados são considerados "frescos" (não refetch automático)
 * - Padrão: 30s - bom equilíbrio entre atualização e performance
 * - Dados em tempo real devem sobrescrever com staleTime menor
 * 
 * gcTime: Tempo que os dados ficam em cache após não serem mais usados
 * - 10 minutos - mantém dados em memória para navegação rápida
 * 
 * Para queries específicas, sobrescrever nas chamadas:
 * - Monitor alerts: staleTime: 5000 (5s)
 * - Positions: staleTime: 30000 (30s)
 * - Configurações: staleTime: 300000 (5min)
 */
export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Dados considerados frescos por 30 segundos (reduz requisições)
                        staleTime: 30 * 1000, // 30 segundos
                        // Cache em memória por 10 minutos (navegação rápida entre páginas)
                        gcTime: 10 * 60 * 1000, // 10 minutos
                        // Não refetch ao focar janela (reduz requisições desnecessárias)
                        refetchOnWindowFocus: false,
                        // Refetch ao reconectar para garantir dados atualizados
                        refetchOnReconnect: true,
                        // Apenas 1 tentativa de retry para não sobrecarregar
                        retry: 1,
                        // Backoff exponencial: 1s, 2s, 4s... até 30s
                        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
                        // Não refetch em background quando dados estão stale (economiza recursos)
                        refetchOnMount: true,
                        // Estrutural sharing para otimizar re-renders
                        structuralSharing: true,
                    },
                    mutations: {
                        // Não retry em mutations para evitar duplicação
                        retry: 0,
                    },
                },
            })
    )

    // Modo do site (app = dashboard, public = landing page)
    const siteMode = process.env.NEXT_PUBLIC_SITE_MODE || 'app';
    
    // Site público usa tema claro fixo, app usa sistema com toggle manual
    const isPublicSite = siteMode === 'public';

    return (
        <ThemeProvider 
            attribute="class" 
            defaultTheme={isPublicSite ? 'light' : 'system'}
            enableSystem={!isPublicSite}
            forcedTheme={isPublicSite ? 'light' : undefined}
            storageKey="mvcash-theme"
            disableTransitionOnChange={false}
        >
            <QueryClientProvider client={queryClient}>
                <WebSocketProvider>
                    <WebPushProvider>
                        <MercadoPagoProvider>
                            {children}
                            <Toaster />
                        </MercadoPagoProvider>
                    </WebPushProvider>
                </WebSocketProvider>
            </QueryClientProvider>
        </ThemeProvider>
    )
}
