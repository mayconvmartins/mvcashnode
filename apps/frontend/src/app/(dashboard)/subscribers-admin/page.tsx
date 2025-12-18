'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SubscribersAdminPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/subscribers-admin/subscribers')
    }, [router])

    return (
        <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Redirecionando...</p>
        </div>
    )
}

