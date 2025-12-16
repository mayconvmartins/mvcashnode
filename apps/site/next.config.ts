import type { NextConfig } from "next";

/**
 * Next.js Configuration para Export Estático
 * 
 * O site é exportado como estático e servido pelo nginx.
 * Isso elimina a necessidade de um processo Node.js rodando,
 * reduzindo consumo de CPU e RAM.
 */
const nextConfig: NextConfig = {
  // Habilitar export estático - gera arquivos HTML/CSS/JS na pasta 'out'
  output: 'export',
  
  // Compressão será feita pelo nginx
  compress: true,
  
  // Desabilitar otimização de imagens (não suportada em export estático)
  images: {
    unoptimized: true,
  },
  
  // Trailing slash para melhor compatibilidade com nginx
  trailingSlash: true,
};

export default nextConfig;

