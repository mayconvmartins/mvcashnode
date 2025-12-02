'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Wallet,
    Safe,
    Settings2,
    Webhook,
    LineChart,
    ArrowLeftRight,
    History,
    FileBarChart,
    ShieldAlert,
    LogOut,
    Menu,
    X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/stores/authStore'
import { useState } from 'react'

const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Wallet, label: 'Contas', href: '/accounts' },
    { icon: Safe, label: 'Cofres', href: '/vaults' },
    { icon: Settings2, label: 'Parâmetros', href: '/parameters' },
    { icon: Webhook, label: 'Webhooks', href: '/webhooks' },
    { icon: LineChart, label: 'Posições', href: '/positions' },
    { icon: ArrowLeftRight, label: 'Ordens Limit', href: '/limit-orders' },
    { icon: History, label: 'Operações', href: '/operations' },
    { icon: FileBarChart, label: 'Relatórios', href: '/reports' },
    { icon: ShieldAlert, label: 'Admin', href: '/admin', adminOnly: true },
]

export function Sidebar() {
    const pathname = usePathname()
    const { logout, user } = useAuthStore()
    const [isOpen, setIsOpen] = useState(false)

    const isAdmin = user?.roles?.includes('admin')

    return (
        <>
            {/* Mobile Menu Button */}
            <div className="lg:hidden fixed top-4 left-4 z-50">
                <Button variant="outline" size="icon" onClick={() => setIsOpen(!isOpen)}>
                    {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
            </div>

            {/* Sidebar Container */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 w-64 transform bg-card border-r border-border transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex h-full flex-col">
                    {/* Logo */}
                    <div className="flex h-16 items-center justify-center border-b border-border px-6">
                        <div className="flex items-center gap-2 font-bold text-xl gradient-text">
                            <LayoutDashboard className="h-6 w-6 text-primary" />
                            <span>TradingBot</span>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                        {menuItems.map((item) => {
                            if (item.adminOnly && !isAdmin) return null

                            const isActive = pathname === item.href

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                        isActive
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                    )}
                                    onClick={() => setIsOpen(false)}
                                >
                                    <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                                    {item.label}
                                </Link>
                            )
                        })}
                    </nav>

                    {/* User & Logout */}
                    <div className="border-t border-border p-4">
                        <div className="mb-4 flex items-center gap-3 px-2">
                            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                {user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="truncate text-sm font-medium">{user?.profile?.full_name || 'Usuário'}</p>
                                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={logout}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            Sair
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    )
}
