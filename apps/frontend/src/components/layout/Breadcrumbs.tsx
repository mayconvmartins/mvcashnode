'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

// Mapeamento de rotas para nomes legíveis
const routeNames: Record<string, string> = {
    '': 'Dashboard',
    'accounts': 'Contas',
    'vaults': 'Cofres',
    'parameters': 'Parâmetros',
    'new': 'Novo',
    'edit': 'Editar',
    'webhooks': 'Webhooks',
    'monitor': 'Monitor',
    'positions': 'Posições',
    'residue': 'Resíduos',
    'heatmap': 'Mapa de Calor',
    'limit-orders': 'Ordens Limit',
    'operations': 'Operações',
    'reports': 'Relatórios',
    'monitoring-positionstp-sl': 'Monitor TP/SL',
    'monitoring': 'Monitoramento',
    'admin': 'Admin',
    'users': 'Usuários',
    'subscription-plans': 'Planos',
    'audit': 'Audit Logs',
    'notifications': 'Notificações',
    'mercadopago': 'Mercado Pago',
    'transfi': 'TransFi',
    'debug-tools': 'Debug Tools',
    'subscribers-admin': 'Assinantes',
    'subscribers': 'Lista',
    'default-parameters': 'Parâmetros Padrão',
    'subscriptions': 'Assinaturas',
    'monitoring-tp-sl': 'Monitor SL/TP',
    'subscriber-dashboard': 'Dashboard',
    'settings': 'Configurações',
    'position-value': 'Valor da Posição',
    'my-plan': 'Meu Plano',
    'profile': 'Perfil',
    'setup-2fa': '2FA',
    'help': 'Ajuda',
}

interface BreadcrumbItem {
    label: string
    href: string
    isLast: boolean
}

export function Breadcrumbs() {
    const pathname = usePathname()
    
    // Não mostrar breadcrumbs na raiz
    if (pathname === '/') return null

    const segments = pathname.split('/').filter(Boolean)
    
    const breadcrumbs: BreadcrumbItem[] = segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/')
        const label = routeNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
        const isLast = index === segments.length - 1
        
        return { label, href, isLast }
    })

    // Adicionar Home no início
    breadcrumbs.unshift({
        label: 'Home',
        href: '/',
        isLast: false,
    })

    return (
        <nav className="hidden md:flex items-center space-x-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center">
                    {index > 0 && (
                        <ChevronRight className="h-4 w-4 mx-1" />
                    )}
                    {crumb.isLast ? (
                        <span className="font-medium text-foreground">
                            {crumb.label}
                        </span>
                    ) : (
                        <Link
                            href={crumb.href}
                            className={cn(
                                "hover:text-foreground transition-colors",
                                index === 0 && "flex items-center gap-1"
                            )}
                        >
                            {index === 0 && <Home className="h-4 w-4" />}
                            {index > 0 && crumb.label}
                        </Link>
                    )}
                </div>
            ))}
        </nav>
    )
}

