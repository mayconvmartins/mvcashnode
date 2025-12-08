import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    
    // Permitir arquivos estáticos e manifest.json sem processamento
    if (
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname === '/manifest.json' ||
        pathname === '/sw.js' ||
        pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|otf|eot)$/)
    ) {
        // Adicionar headers CORS para manifest.json
        if (pathname === '/manifest.json') {
            const response = NextResponse.next()
            response.headers.set('Access-Control-Allow-Origin', '*')
            response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
            return response
        }
        return NextResponse.next()
    }
    
    // Para a aplicação completa (porta 5010)
    // Redirecionar / para dashboard se autenticado, ou login se não autenticado
    if (pathname === '/') {
        const token = request.cookies.get('accessToken')?.value || 
                      request.headers.get('authorization')?.replace('Bearer ', '')
        
        // Se estiver autenticado, redirecionar para dashboard
        if (token) {
            const dashboardUrl = new URL('/positions', request.url)
            return NextResponse.redirect(dashboardUrl)
        }
        
        // Se não estiver autenticado, redirecionar para /login
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
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
         * - static files (images, fonts, etc)
         */
        {
            source: '/:path*',
            missing: [
                { type: 'header', key: 'next-router-prefetch' },
                { type: 'header', key: 'purpose', value: 'prefetch' },
            ],
        },
    ],
}

