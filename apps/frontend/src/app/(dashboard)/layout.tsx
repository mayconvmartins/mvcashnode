'use client'

import { RouteGuard } from '@/components/auth/RouteGuard'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { useAuthRefresh } from '@/lib/hooks/useAuthRefresh'
import { PostLoginPrompts } from '@/components/auth/PostLoginPrompts'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    // Hook para refresh automático quando "Lembrar de mim" estiver ativo
    useAuthRefresh()

    return (
        <RouteGuard requireAuth>
            <div className="flex min-h-screen lg:h-screen overflow-hidden">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-6 pb-20 lg:pb-6">
                        <ImpersonationBanner />
                        {children}
                    </main>
                </div>
            </div>
            
            {/* Prompts pós-login (notificações e passkey) */}
            <PostLoginPrompts />
            
            {/* PWA prompts */}
            <UpdatePrompt />
            <InstallPrompt />
        </RouteGuard>
    )
}
