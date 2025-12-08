'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { ReactNode, useState } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { WebSocketProvider } from '@/components/websocket/WebSocketProvider'
import { MercadoPagoProvider } from '@/components/providers/MercadoPagoProvider'

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 0, // Dados sempre considerados stale (tempo real)
                        gcTime: 5 * 60 * 1000, // 5 minutos de cache em memória (antes era cacheTime)
                        refetchOnWindowFocus: false, // Não refetch ao focar janela
                        refetchOnReconnect: true, // Refetch ao reconectar
                        retry: 1, // Apenas 1 tentativa de retry
                        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff exponencial
                    },
                    mutations: {
                        retry: 0, // Não retry em mutations
                    },
                },
            })
    )

    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <QueryClientProvider client={queryClient}>
                <WebSocketProvider>
                    <MercadoPagoProvider>
                        {children}
                        <Toaster />
                    </MercadoPagoProvider>
                </WebSocketProvider>
            </QueryClientProvider>
        </ThemeProvider>
    )
}
