import type { NextConfig } from "next";
import path from "path";

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
  
  // Definir raiz do workspace para monorepo
  outputFileTracingRoot: path.join(__dirname, '../../'),
  
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

