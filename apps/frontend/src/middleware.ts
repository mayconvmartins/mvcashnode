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
    // Redirecionar rotas públicas para o site público
    if (pathname === '/' || pathname.startsWith('/help')) {
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

