'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
    Flame,
    UserCheck,
    User,
    Key,
    TrendingUp,
    Settings,
    BarChart3,
    PanelLeftClose,
    PanelLeft,
    HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggleCompact } from '@/components/shared/ThemeToggle'
import { useAuthStore } from '@/lib/stores/authStore'
import { useState, useEffect } from 'react'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { MobileBottomNav } from './MobileBottomNav'

// ============================================
// MENU GROUPS
// ============================================

interface MenuItem {
    icon: React.ElementType
    label: string
    href: string
    adminOnly?: boolean
    subscriberBlocked?: boolean
    external?: boolean
}

interface MenuGroup {
    id: string
    icon: React.ElementType
    label: string
    items: MenuItem[]
    adminOnly?: boolean
}

// Grupos de menu organizados
const menuGroups: MenuGroup[] = [
    {
        id: 'trading',
        icon: TrendingUp,
        label: 'Trading',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
            { icon: LineChart, label: 'Posições', href: '/positions' },
            { icon: Package, label: 'Resíduos', href: '/positions/residue' },
            { icon: ArrowLeftRight, label: 'Ordens Limit', href: '/limit-orders' },
            { icon: Flame, label: 'Mapa de Calor', href: '/heatmap' },
            { icon: Target, label: 'Monitor TP/SL', href: '/monitoring-positionstp-sl' },
        ],
    },
    {
        id: 'config',
        icon: Settings,
        label: 'Configuração',
        items: [
            { icon: Wallet, label: 'Contas', href: '/accounts' },
            { icon: Vault, label: 'Cofres', href: '/vaults' },
            { icon: Settings2, label: 'Parâmetros', href: '/parameters' },
            { icon: Webhook, label: 'Webhooks', href: '/webhooks', subscriberBlocked: true },
            { icon: Activity, label: 'Monitor Webhook', href: '/webhooks/monitor', subscriberBlocked: true },
        ],
    },
    {
        id: 'reports',
        icon: BarChart3,
        label: 'Relatórios',
        items: [
            { icon: FileBarChart, label: 'Relatórios', href: '/reports' },
            { icon: History, label: 'Operações', href: '/operations', subscriberBlocked: true },
            { icon: Activity, label: 'Monitoramento', href: '/monitoring', adminOnly: true },
        ],
    },
]

// Menu de gerenciamento de assinantes
const subscriberAdminGroup: MenuGroup = {
    id: 'subscribers',
    icon: UserCheck,
    label: 'Assinantes',
    adminOnly: true,
    items: [
        { icon: CreditCard, label: 'Lista Assinantes', href: '/subscribers-admin/subscribers' },
        { icon: Settings2, label: 'Parâmetros Padrão', href: '/subscribers-admin/default-parameters' },
        { icon: Settings2, label: 'Parâmetros Assinantes', href: '/subscribers-admin/parameters' },
        { icon: Webhook, label: 'Webhooks Padrão', href: '/subscribers-admin/webhooks' },
        { icon: Receipt, label: 'Assinaturas', href: '/subscribers-admin/subscriptions' },
        { icon: LineChart, label: 'Posições', href: '/subscribers-admin/positions' },
        { icon: History, label: 'Operações', href: '/subscribers-admin/operations' },
        { icon: Flame, label: 'Mapa de Calor', href: '/subscribers-admin/heatmap' },
        { icon: Target, label: 'Monitor SL/TP', href: '/subscribers-admin/monitoring-tp-sl' },
        { icon: FileBarChart, label: 'Relatórios', href: '/subscribers-admin/reports' },
    ],
}

// Menu Admin
const adminGroup: MenuGroup = {
    id: 'admin',
    icon: ShieldAlert,
    label: 'Admin',
    adminOnly: true,
    items: [
        { icon: LayoutDashboard, label: 'Painel Admin', href: '/admin' },
        { icon: Users, label: 'Usuários', href: '/admin/users' },
        { icon: Package, label: 'Planos', href: '/admin/subscription-plans' },
        { icon: FileText, label: 'Audit Logs', href: '/admin/audit' },
    { icon: Activity, label: 'Logs CCXT', href: '/admin/ccxt-logs' },
        { icon: MessageSquare, label: 'Notificações', href: '/admin/notifications' },
        { icon: CreditCard, label: 'Mercado Pago', href: '/admin/mercadopago' },
        { icon: CreditCard, label: 'TransFi', href: '/admin/transfi' },
        { icon: Wrench, label: 'Debug Tools', href: '/admin/debug-tools' },
        { icon: BookOpen, label: 'API Docs', href: '/api-docs', external: true },
    ],
}

// Menu específico para assinantes (simplificado)
const subscriberOnlyItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/subscriber-dashboard' },
    { icon: Wallet, label: 'Contas', href: '/accounts' },
    { icon: Flame, label: 'Mapa de Calor', href: '/heatmap' },
    { icon: FileBarChart, label: 'Relatórios', href: '/reports' },
    { icon: Settings2, label: 'Valor da Posição', href: '/settings/position-value' },
    { icon: CreditCard, label: 'Meu Plano', href: '/my-plan' },
]

// ============================================
// COMPONENTS
// ============================================

function MenuGroupCollapsible({ 
    group, 
    pathname, 
    isCollapsed,
    onNavigate 
}: { 
    group: MenuGroup
    pathname: string
    isCollapsed: boolean
    onNavigate: () => void 
}) {
    const isGroupActive = group.items.some(item => 
        pathname === item.href || pathname.startsWith(item.href + '/')
    )
    const [isOpen, setIsOpen] = useState(isGroupActive)

    // Abrir automaticamente quando uma rota do grupo está ativa
    useEffect(() => {
        if (isGroupActive && !isOpen) {
            setIsOpen(true)
        }
    }, [isGroupActive])

    if (isCollapsed) {
        return (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link
                            href={group.items[0].href}
                            className={cn(
                                "flex items-center justify-center h-10 w-10 rounded-lg mx-auto transition-colors",
                                isGroupActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                            onClick={onNavigate}
                        >
                            <group.icon className="h-5 w-5" />
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        {group.label}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger
                className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isGroupActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
            >
                <div className="flex items-center gap-3">
                    <group.icon className={cn("h-5 w-5", isGroupActive ? "text-primary" : "")} />
                    <span>{group.label}</span>
                </div>
                <ChevronDown className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isOpen ? "rotate-180" : ""
                )} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1 ml-4 pl-3 border-l-2 border-border/50">
                {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
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
                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                                onClick={onNavigate}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </a>
                        )
                    }

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                            onClick={onNavigate}
                        >
                            <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                            {item.label}
                        </Link>
                    )
                })}
            </CollapsibleContent>
        </Collapsible>
    )
}

function SingleMenuItem({ 
    item, 
    pathname, 
    isCollapsed,
    onNavigate 
}: { 
    item: MenuItem
    pathname: string
    isCollapsed: boolean
    onNavigate: () => void 
}) {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    if (isCollapsed) {
        return (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link
                            href={item.href}
                            className={cn(
                                "flex items-center justify-center h-10 w-10 rounded-lg mx-auto transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                            onClick={onNavigate}
                        >
                            <item.icon className="h-5 w-5" />
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        {item.label}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    }

    return (
        <Link
            href={item.href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={onNavigate}
        >
            <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "")} />
            {item.label}
        </Link>
    )
}

// Mobile Top Bar
function MobileTopBar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
    const { logout, user } = useAuthStore()
    const router = useRouter()

    return (
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
            {/* Menu Button */}
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <span className="gradient-text">MVCash</span>
            </Link>

            {/* Theme Toggle + Profile */}
            <div className="flex items-center gap-1">
                <ThemeToggleCompact />
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                            {user?.email?.charAt(0).toUpperCase() || 'U'}
                        </div>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium">{user?.profile?.full_name || 'Usuário'}</p>
                            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/profile')}>
                        <User className="mr-2 h-4 w-4" />
                        Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/setup-2fa')}>
                        <Key className="mr-2 h-4 w-4" />
                        Configurar 2FA
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/help')}>
                        <HelpCircle className="mr-2 h-4 w-4" />
                        Ajuda
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                    </DropdownMenuItem>
                </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

// ============================================
// MAIN SIDEBAR
// ============================================

export function Sidebar() {
    const pathname = usePathname()
    const { logout, user } = useAuthStore()
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)

    // Verificar roles
    const isAdmin = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'admin' || roleValue === 'ADMIN' || roleValue?.toLowerCase?.() === 'admin'
    })

    const isSubscriber = user?.roles?.some((role: any) => {
        const roleValue = typeof role === 'object' && role !== null ? role.role : role
        return roleValue === 'subscriber' || roleValue === 'SUBSCRIBER'
    })

    const closeMobileMenu = () => setIsOpen(false)

    return (
        <>
            {/* Mobile Top Bar */}
            <MobileTopBar isOpen={isOpen} setIsOpen={setIsOpen} />

            {/* Spacer for mobile top bar */}
            <div className="lg:hidden h-14" />

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 bg-card border-r border-border transition-all duration-300 ease-in-out",
                    "lg:translate-x-0 lg:static lg:inset-auto",
                    "lg:top-0 top-14",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    isCollapsed ? "lg:w-[72px]" : "w-64"
                )}
            >
                <div className="flex h-full flex-col">
                    {/* Logo - Desktop */}
                    <div className={cn(
                        "hidden lg:flex h-16 items-center border-b border-border px-4",
                        isCollapsed ? "justify-center" : "justify-between"
                    )}>
                        {!isCollapsed && (
                            <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                                    <TrendingUp className="h-5 w-5 text-white" />
                                </div>
                                <span className="gradient-text">MVCash</span>
                            </Link>
                        )}
                        {isCollapsed && (
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-white" />
                            </div>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", isCollapsed && "hidden")}
                            onClick={() => setIsCollapsed(!isCollapsed)}
                        >
                            <PanelLeftClose className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Expand button when collapsed */}
                    {isCollapsed && (
                        <div className="hidden lg:flex justify-center py-2 border-b border-border">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setIsCollapsed(false)}
                            >
                                <PanelLeft className="h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Navigation */}
                    <nav className={cn(
                        "flex-1 overflow-y-auto py-4 space-y-2",
                        isCollapsed ? "px-2" : "px-3"
                    )}>
                        {/* Menu para assinantes (não-admin) */}
                        {isSubscriber && !isAdmin ? (
                            <div className="space-y-1">
                                {subscriberOnlyItems.map((item) => (
                                    <SingleMenuItem
                                        key={item.href}
                                        item={item}
                                        pathname={pathname}
                                        isCollapsed={isCollapsed}
                                        onNavigate={closeMobileMenu}
                                    />
                                ))}
                            </div>
                        ) : (
                            <>
                                {/* Menu Groups */}
                                {menuGroups.map((group) => (
                                    <MenuGroupCollapsible
                                        key={group.id}
                                        group={group}
                                        pathname={pathname}
                                        isCollapsed={isCollapsed}
                                        onNavigate={closeMobileMenu}
                                    />
                                ))}

                                {/* Subscriber Admin (apenas admin) */}
                                {isAdmin && (
                                    <MenuGroupCollapsible
                                        group={subscriberAdminGroup}
                                        pathname={pathname}
                                        isCollapsed={isCollapsed}
                                        onNavigate={closeMobileMenu}
                                    />
                                )}

                                {/* Admin Menu (apenas admin) */}
                                {isAdmin && (
                                    <MenuGroupCollapsible
                                        group={adminGroup}
                                        pathname={pathname}
                                        isCollapsed={isCollapsed}
                                        onNavigate={closeMobileMenu}
                                    />
                                )}
                            </>
                        )}
                    </nav>

                    {/* User Section - Desktop */}
                    <div className={cn(
                        "hidden lg:block border-t border-border p-4",
                        isCollapsed && "px-2"
                    )}>
                        {!isCollapsed ? (
                            <>
                                <div className="mb-3 flex items-center gap-3 px-2">
                                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                        {user?.email?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="truncate text-sm font-medium">{user?.profile?.full_name || 'Usuário'}</p>
                                        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start text-sm h-9"
                                        onClick={() => router.push('/profile')}
                                    >
                                        <User className="mr-2 h-4 w-4" />
                                        Perfil
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 text-sm h-9"
                                        onClick={logout}
                                    >
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Sair
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <TooltipProvider delayDuration={0}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10"
                                                onClick={() => router.push('/profile')}
                                            >
                                                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                                                    {user?.email?.charAt(0).toUpperCase()}
                                                </div>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            Perfil
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider delayDuration={0}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={logout}
                                            >
                                                <LogOut className="h-5 w-5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            Sair
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden top-14"
                    onClick={closeMobileMenu}
                />
            )}

            {/* Mobile Bottom Navigation */}
            <MobileBottomNav onMenuClick={() => setIsOpen(!isOpen)} />

            {/* Spacer for mobile bottom nav */}
            <div className="lg:hidden h-16" />
        </>
    )
}
