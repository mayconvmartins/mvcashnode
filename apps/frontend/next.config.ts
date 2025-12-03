import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compressão habilitada por padrão no Next.js
  compress: true,
  
  // Otimização de imports de pacotes
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  },
  
  // Headers de cache APENAS para assets estáticos
  headers: async () => [
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
      // Assets estáticos (JS, CSS) - cache longo
      source: '/_next/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
    {
      // Imagens - cache médio
      source: '/:path*\\.(jpg|jpeg|png|gif|webp|svg|ico)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=86400, must-revalidate',
        },
      ],
    },
    {
      // Fontes - cache longo
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
