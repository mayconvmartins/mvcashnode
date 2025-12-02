'use client'

import { RouteGuard } from '@/components/auth/RouteGuard'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <RouteGuard requireAuth>
            <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto bg-background p-6">
                        <ImpersonationBanner />
                        {children}
                    </main>
                </div>
            </div>
        </RouteGuard>
    )
}

