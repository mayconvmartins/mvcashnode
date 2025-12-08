import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    const siteMode = process.env.NEXT_PUBLIC_SITE_MODE || 'app'
    
    // Se for o site público (porta 6010), servir apenas landing page e help
    if (siteMode === 'public') {
        // Permitir apenas / e /help
        if (pathname === '/' || pathname.startsWith('/help')) {
            return NextResponse.next()
        }
        // Todas as outras rotas redirecionam para app.mvcash.com.br
        const appUrl = new URL(pathname, 'https://app.mvcash.com.br')
        return NextResponse.redirect(appUrl)
    }
    
    // Para a aplicação completa (porta 5010)
    // Na rota raiz, verificar se está autenticado
    if (pathname === '/') {
        const token = request.cookies.get('accessToken')?.value || 
                      request.headers.get('authorization')?.replace('Bearer ', '')
        
        // Se não estiver autenticado, redirecionar para site público
        if (!token) {
            const publicUrl = new URL('/', 'https://mvcash.com.br')
            return NextResponse.redirect(publicUrl)
        }
        
        // Se estiver autenticado, redirecionar para uma rota que não conflite
        // Como temos page.tsx na raiz (landing page), vamos usar uma rota interna
        // Mas na verdade, o Next.js vai servir page.tsx mesmo assim
        // A solução é não ter page.tsx na raiz quando for app mode
        // Por enquanto, vamos redirecionar para /positions que é uma rota do dashboard
        // Ou podemos simplesmente bloquear e forçar o usuário a usar o menu
        // Vamos redirecionar para uma rota do dashboard que sempre existe
        const dashboardUrl = new URL('/positions', request.url)
        return NextResponse.redirect(dashboardUrl)
    }
    
    // Redirecionar /help para site público
    if (pathname.startsWith('/help')) {
        const publicUrl = new URL(pathname, 'https://mvcash.com.br')
        return NextResponse.redirect(publicUrl)
    }
    
    // Rotas públicas que não precisam de autenticação (mas não são do site público)
    const publicRoutes = ['/login', '/setup-2fa', '/subscribe']
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))
    
    // Permitir rotas públicas de autenticação
    if (isPublicRoute) {
        return NextResponse.next()
    }

    // Para todas as outras rotas dentro de (dashboard), verificar token
    const token = request.cookies.get('accessToken')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '')

    // Se não tiver token, redirecionar para login
    if (!token) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}

