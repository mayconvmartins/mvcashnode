/**
 * Utilitário de sanitização HTML para prevenir XSS
 *
 * Usa DOMPurify quando disponível (client-side), ou faz sanitização básica (server-side)
 */

// Configuração padrão do DOMPurify
const DOMPURIFY_CONFIG = {
  // Permitir tags básicas de formatação
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'pre', 'code',
    'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
  ],
  // Permitir atributos seguros
  ALLOWED_ATTR: [
    'href', 'title', 'class', 'style', 'target', 'rel',
  ],
  // Não permitir data URIs
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
};

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';

  // Client-side: usar DOMPurify
  if (typeof window !== 'undefined') {
    try {
      // Import dinâmico para evitar erros no SSR
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const DOMPurify = require('dompurify');
      return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
    } catch {
      return sanitizeBasic(html);
    }
  }

  // Server-side: sanitização básica
  return sanitizeBasic(html);
}

function sanitizeBasic(html: string): string {
  return html
    // Remover tags script
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remover event handlers
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remover javascript: URLs
    .replace(/javascript:/gi, '')
    // Remover data: URLs em atributos src/href
    .replace(/(src|href)\s*=\s*["']data:[^"']*["']/gi, '')
    // Remover tags style
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remover iframes
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remover object/embed
    .replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');
}

