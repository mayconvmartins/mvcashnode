'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Wallet,
    Vault,
    Settings2,
    Webhook,
    LineChart,
    ArrowLeftRight,
    History,
    FileBarChart,
    ShieldAlert,
    LogOut,
    Menu,
    X,
    Activity,
    Users,
    FileText,
    MessageSquare,
    ChevronDown,
    ChevronRight,
    BookOpen,
    Target,
    CreditCard,
    Receipt,
    Package,
    Wrench,
    Flame
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/lib/stores/authStore'
import { useState } from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'

const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Wallet, label: 'Contas', href: '/accounts' },
    { icon: Vault, label: 'Cofres', href: '/vaults' },
    { icon: Settings2, label: 'Parâmetros', href: '/parameters' },
    { icon: Webhook, label: 'Webhooks', href: '/webhooks', subscriberBlocked: true }, // Bloqueado para assinantes
    { icon: Activity, label: 'Monitor Webhook', href: '/webhooks/monitor', subscriberBlocked: true }, // Bloqueado para assinantes
    { icon: LineChart, label: 'Posições', href: '/positions' },
    { icon: Package, label: 'Resíduos', href: '/positions/residue' },
    { icon: Flame, label: 'Mapa de Calor', href: '/heatmap' },
    { icon: ArrowLeftRight, label: 'Ordens Limit', href: '/limit-orders' },
    { icon: History, label: 'Operações', href: '/operations', subscriberBlocked: true }, // Bloqueado para assinantes
    { icon: FileBarChart, label: 'Relatórios', href: '/reports' },
    { icon: Target, label: 'Monitor TP/SL', href: '/monitoring-positionstp-sl' },
    { icon: Activity, label: 'Monitoramento', href: '/monitoring', adminOnly: true },
]

const adminMenuItems = [
    { icon: LayoutDashboard, label: 'Painel Admin', href: '/admin' },
    { icon: Users, label: 'Usuários', href: '/admin/users' },
    { icon: Receipt, label: 'Assinaturas', href: '/admin/subscriptions' },
    { icon: Package, label: 'Planos', href: '/admin/subscription-plans' },
    { icon: CreditCard, label: 'Assinantes', href: '/admin/subscribers' },
    { icon: Settings2, label: 'Parâmetros Assinantes', href: '/admin/subscriber-parameters' },
    { icon: Webhook, label: 'Webhooks Padrão', href: '/admin/subscriber-webhooks' },
    { icon: FileText, label: 'Audit Logs', href: '/admin/audit' },
    { icon: MessageSquare, label: 'Notificações', href: '/admin/notifications' },
    { icon: CreditCard, label: 'Mercado Pago', href: '/admin/mercadopago' },
    { icon: CreditCard, label: 'TransFi', href: '/admin/transfi' },
    { icon: Wrench, label: 'Debug Tools', href: '/admin/debug-tools' },
    { icon: BookOpen, label: 'API Docs', href: '/api-docs', external: true },
]

function AdminDropdown({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
    const [isOpen, setIsOpen] = useState(pathname.startsWith('/admin'))
    const isAdminActive = pathname.startsWith('/admin')

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger
                className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isAdminActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
            >
                <div className="flex items-center gap-3">
                    <ShieldAlert className={cn("h-5 w-5", isAdminActive ? "text-primary" : "text-muted-foreground")} />
                    <span>Admin</span>
                </div>
                {isOpen ? (
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 rotate-180" />
                ) : (
                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1 ml-4 pl-4 border-l border-border">
                {adminMenuItems.map((item) => {
                    const isActive = pathname === item.href || (item.href === '/admin' && pathname === '/admin')
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010'
                    const fullUrl = item.external ? `${apiUrl}${item.href}` : item.href

                    if (item.external) {
                        return (
                            <a
                                key={item.href}
                                href={fullUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                                onClick={onNavigate}
                            >
                                <item.icon className="h-4 w-4 text-muted-foreground" />
                                {item.label}
                            </a>
                        )
                    }

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
                            onClick={onNavigate}
                        >
                            <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                            {item.label}
                        </Link>
                    )
                })}
            </CollapsibleContent>
        </Collapsible>
    )
}

export function Sidebar() {
    const pathname = usePathname()
    const { logout, user } = useAuthStore()
    const [isOpen, setIsOpen] = useState(false)

    // Verificar se o usuário é admin
    // roles pode vir como array de strings ['admin'] ou array de objetos [{role: 'admin'}]
    const isAdmin = user?.roles?.some((role: any) => {
        // Se role é um objeto, acessar a propriedade 'role'
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue?.toLowerCase?.() === 'admin'
    })

    // Verificar se o usuário é assinante
    const isSubscriber = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'subscriber' || roleValue === 'SUBSCRIBER' || roleValue?.toLowerCase?.() === 'subscriber'
    })

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
                            <span>MvCash</span>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                        {menuItems.map((item) => {
                            // Ocultar itens apenas para admin
                            if (item.adminOnly && !isAdmin) return null
                            
                            // Ocultar itens bloqueados para assinantes
                            if (item.subscriberBlocked && isSubscriber && !isAdmin) return null

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

                        {/* Meu Plano - apenas para assinantes */}
                        {isSubscriber && (
                            <Link
                                href="/my-plan"
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                    pathname === '/my-plan'
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                                onClick={() => setIsOpen(false)}
                            >
                                <CreditCard className={cn("h-5 w-5", pathname === '/my-plan' ? "text-primary" : "text-muted-foreground")} />
                                Meu Plano
                            </Link>
                        )}

                        {/* Admin Dropdown */}
                        {isAdmin && (
                            <AdminDropdown 
                                pathname={pathname} 
                                onNavigate={() => setIsOpen(false)} 
                            />
                        )}
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
