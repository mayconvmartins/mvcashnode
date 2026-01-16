import type { NextConfig } from "next";
import path from "path";

/**
 * Next.js Configuration otimizado para produção
 * 
 * Otimizações de performance:
 * - output: 'standalone' - Reduz tamanho do bundle para deploy (apenas Linux/produção)
 * - compiler.removeConsole - Remove console.log em produção
 * - optimizePackageImports - Tree-shaking mais agressivo para pacotes grandes
 * - poweredByHeader: false - Remove header X-Powered-By (segurança e bytes)
 */
const nextConfig: NextConfig = {
  // Output standalone para produção (menor footprint, melhor para containers)
  // Desabilitado no Windows devido a problemas com symlinks (EPERM)
  // Habilitar apenas em Linux/produção via variável de ambiente
  ...(process.env.NEXT_OUTPUT_STANDALONE === 'true' && process.platform !== 'win32' 
    ? { output: 'standalone' as const }
    : {}),
  
  // Definir raiz do workspace para monorepo
  outputFileTracingRoot: path.join(__dirname, '../../'),
  
  // Compressão habilitada por padrão no Next.js
  compress: true,
  
  // Remover header X-Powered-By (segurança e performance)
  poweredByHeader: false,
  
  // React Strict Mode para detectar problemas
  reactStrictMode: true,
  
  // Otimizações do compilador SWC
  compiler: {
    // Remover console.log em produção (exceto console.error e console.warn)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Otimização de imports de pacotes (tree-shaking mais agressivo)
  experimental: {
    optimizePackageImports: [
      // UI Components
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-switch',
      '@radix-ui/react-label',
      '@radix-ui/react-avatar',
      '@radix-ui/react-separator',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-slot',
      '@radix-ui/react-toast',
      // Data handling
      'date-fns',
      'zod',
      // State management
      'zustand',
      // Charts
      'recharts',
      // Animation
      'framer-motion',
      // Form handling
      'react-hook-form',
      '@hookform/resolvers',
    ],
  },
  
  // Otimização de imagens
  images: {
    // Formatos modernos para melhor compressão
    formats: ['image/avif', 'image/webp'],
    // Desabilitar otimização remota se não usar imagens externas
    remotePatterns: [],
  },
  
  // Headers de segurança e cache
  headers: async () => [
    {
      // Headers de segurança para todas as rotas
      source: '/:path*',
      headers: [
        // Previne clickjacking
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        // Previne MIME sniffing
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Controle de referrer
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // HSTS (backup - Cloudflare gerencia)
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        // Permissions Policy
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // CSP - Content Security Policy
        { 
          key: 'Content-Security-Policy', 
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https: blob:",
            "font-src 'self' data:",
            "connect-src 'self' https://*.mvcash.com.br wss://*.mvcash.com.br https://cloudflareinsights.com",
            "frame-src 'self' https://challenges.cloudflare.com",
            "frame-ancestors 'self'",
            "form-action 'self'",
            "base-uri 'self'",
          ].join('; ')
        },
      ],
    },
    {
      // Manifest.json - CORS headers (restrito a *.mvcash.com.br)
      source: '/manifest.json',
      headers: [
        {
          key: 'Access-Control-Allow-Origin',
          value: 'https://mvcash.com.br',
        },
        {
          key: 'Access-Control-Allow-Methods',
          value: 'GET, OPTIONS',
        },
        {
          key: 'Access-Control-Allow-Headers',
          value: 'Content-Type',
        },
        {
          key: 'Cache-Control',
          value: 'public, max-age=86400, must-revalidate',
        },
      ],
    },
    {
      // Service Worker - sem cache
      source: '/sw.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
        {
          key: 'Service-Worker-Allowed',
          value: '/',
        },
      ],
    },
    {
      // Assets estáticos (JS, CSS) - cache longo (1 ano)
      source: '/_next/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      // Imagens - cache médio (1 dia)
      source: '/:path*\\.(jpg|jpeg|png|gif|webp|svg|ico)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=86400, must-revalidate',
        },
      ],
    },
    {
      // Fontes - cache longo (1 ano)
      source: '/:path*\\.(woff|woff2|ttf|otf|eot)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      // API routes - SEM cache (sempre dados frescos)
      source: '/api/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
        {
          key: 'Pragma',
          value: 'no-cache',
        },
        {
          key: 'Expires',
          value: '0',
        },
      ],
    },
  ],
};

export default nextConfig;
