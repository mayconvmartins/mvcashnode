import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Rotas públicas que não precisam de autenticação
    const publicRoutes = ['/login', '/setup-2fa']
    const isPublicRoute = publicRoutes.some((route) => request.nextUrl.pathname.startsWith(route))

    // Rotas admin que precisam de permissão admin
    const adminRoutes = ['/admin']
    const isAdminRoute = adminRoutes.some((route) => request.nextUrl.pathname.startsWith(route))

    // Se for rota pública, permitir acesso
    if (isPublicRoute) {
        return NextResponse.next()
    }

    // Verificar token no cookie ou header (será verificado no cliente também)
    const token = request.cookies.get('accessToken')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '')

    // Se não tiver token e não for rota pública, redirecionar para login
    if (!token) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Para rotas admin, a verificação de permissão será feita no cliente
    // pois precisamos verificar os roles do usuário
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

