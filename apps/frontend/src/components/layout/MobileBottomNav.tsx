'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    LineChart,
    Plus,
    FileBarChart,
    Menu,
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/authStore'

interface NavItem {
    icon: React.ElementType
    label: string
    href: string
    isAction?: boolean
}

export function MobileBottomNav({ onMenuClick }: { onMenuClick: () => void }) {
    const pathname = usePathname()
    const { user } = useAuthStore()

    // Verificar se o usuário é assinante
    const isSubscriber = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'subscriber' || roleValue === 'SUBSCRIBER'
    })

    const navItems: NavItem[] = [
        { 
            icon: LayoutDashboard, 
            label: 'Home', 
            href: isSubscriber ? '/subscriber-dashboard' : '/' 
        },
        { 
            icon: LineChart, 
            label: 'Posições', 
            href: '/positions' 
        },
        { 
            icon: Plus, 
            label: 'Novo', 
            href: '/parameters/new',
            isAction: true 
        },
        { 
            icon: FileBarChart, 
            label: 'Relatórios', 
            href: '/reports' 
        },
        { 
            icon: Menu, 
            label: 'Menu', 
            href: '#menu' 
        },
    ]

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border safe-area-bottom">
            <div className="flex items-center justify-around h-16 px-2">
                {navItems.map((item) => {
                    const isActive = item.href !== '#menu' && (
                        pathname === item.href || 
                        (item.href !== '/' && item.href !== '/subscriber-dashboard' && pathname.startsWith(item.href))
                    )
                    
                    if (item.href === '#menu') {
                        return (
                            <button
                                key={item.label}
                                onClick={onMenuClick}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
                                    "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                <span className="text-[10px] font-medium">{item.label}</span>
                            </button>
                        )
                    }

                    if (item.isAction) {
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className="flex items-center justify-center -mt-4"
                            >
                                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/25 hover:scale-105 transition-transform">
                                    <item.icon className="h-6 w-6 text-white" />
                                </div>
                            </Link>
                        )
                    }

                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
                                isActive
                                    ? "text-primary bg-primary/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            )}
                        >
                            <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}

