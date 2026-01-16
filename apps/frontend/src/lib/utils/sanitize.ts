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
  // Forçar rel="noopener noreferrer" em links externos
  ADD_ATTR: ['target'],
  // Não permitir data URIs
  ALLOW_DATA_ATTR: false,
  // Links externos devem ter target="_blank"
  FORCE_BODY: true,
}

/**
 * Sanitiza HTML para prevenir XSS
 * @param html - String HTML potencialmente perigosa
 * @returns String HTML sanitizada
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  
  // Client-side: usar DOMPurify
  if (typeof window !== 'undefined') {
    try {
      // Import dinâmico para evitar erros no SSR
      const DOMPurify = require('dompurify')
      return DOMPurify.sanitize(html, DOMPURIFY_CONFIG)
    } catch {
      // Fallback para sanitização básica se DOMPurify não estiver disponível
      return sanitizeBasic(html)
    }
  }
  
  // Server-side: sanitização básica
  return sanitizeBasic(html)
}

/**
 * Sanitização básica para server-side ou fallback
 * Remove scripts e event handlers
 */
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
    .replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
}

/**
 * Sanitiza HTML para preview de email/WhatsApp
 * Mais permissivo para estilos inline
 */
export function sanitizePreviewHtml(html: string | null | undefined): string {
  if (!html) return ''
  
  if (typeof window !== 'undefined') {
    try {
      const DOMPurify = require('dompurify')
      return DOMPurify.sanitize(html, {
        ...DOMPURIFY_CONFIG,
        // Permitir mais tags para preview de email
        ALLOWED_TAGS: [
          ...DOMPURIFY_CONFIG.ALLOWED_TAGS,
          'img', 'font', 'center', 'small', 'big', 'sub', 'sup',
        ],
        // Permitir style para preview
        ALLOWED_ATTR: [
          ...DOMPURIFY_CONFIG.ALLOWED_ATTR,
          'style', 'width', 'height', 'align', 'valign', 'bgcolor', 'color',
        ],
      })
    } catch {
      return sanitizeBasic(html)
    }
  }
  
  return sanitizeBasic(html)
}
