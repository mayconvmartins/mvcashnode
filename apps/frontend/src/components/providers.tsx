'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { ReactNode, useState } from 'react'
import { Toaster } from '@/components/ui/toaster'

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000, // 1 minute
                        refetchOnWindowFocus: false,
                        retry: 1,
                    },
                },
            })
    )

    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <QueryClientProvider client={queryClient}>
                {children}
                <Toaster />
            </QueryClientProvider>
        </ThemeProvider>
    )
}
