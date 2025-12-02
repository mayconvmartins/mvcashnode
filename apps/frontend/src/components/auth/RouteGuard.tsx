'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'
import { Spinner } from '@/components/ui/spinner'

interface RouteGuardProps {
    children: React.ReactNode
    requireAuth?: boolean
    requireAdmin?: boolean
}

export function RouteGuard({ children, requireAuth = true, requireAdmin = false }: RouteGuardProps) {
    const router = useRouter()
    const pathname = usePathname()
    const { isAuthenticated, user } = useAuthStore()

    useEffect(() => {
        if (requireAuth && !isAuthenticated) {
            router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
            return
        }

        if (requireAdmin && (!user || !user.roles?.includes('admin'))) {
            router.push('/')
            return
        }
    }, [isAuthenticated, user, requireAuth, requireAdmin, router, pathname])

    if (requireAuth && !isAuthenticated) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    if (requireAdmin && (!user || !user.roles?.includes('admin'))) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    return <>{children}</>
}

