/**
 * Utilitários de validação para formulários
 * Implementa validações de segurança e formatação
 */

// Validar email
export function isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email.trim())
}

// Validar senha forte
export function isStrongPassword(password: string): {
    valid: boolean
    errors: string[]
} {
    const errors: string[] = []
    
    if (!password || typeof password !== 'string') {
        return { valid: false, errors: ['Senha é obrigatória'] }
    }
    
    if (password.length < 8) {
        errors.push('Senha deve ter pelo menos 8 caracteres')
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Senha deve conter pelo menos uma letra maiúscula')
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Senha deve conter pelo menos uma letra minúscula')
    }
    
    if (!/[0-9]/.test(password)) {
        errors.push('Senha deve conter pelo menos um número')
    }
    
    return {
        valid: errors.length === 0,
        errors,
    }
}

// Validar telefone brasileiro
export function isValidPhoneBR(phone: string): boolean {
    if (!phone || typeof phone !== 'string') return true // Opcional
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '')
    // Aceita 10-11 dígitos (com DDD) ou 12-13 (com código do país)
    return cleaned.length >= 10 && cleaned.length <= 13
}

// Sanitizar string para exibição (prevenir XSS)
export function sanitizeForDisplay(str: string): string {
    if (!str || typeof str !== 'string') return ''
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
}

// Validar URL
export function isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false
    try {
        new URL(url)
        return true
    } catch {
        return false
    }
}

// Validar número positivo
export function isPositiveNumber(value: any): boolean {
    const num = Number(value)
    return !isNaN(num) && num > 0
}

// Validar porcentagem (0-100)
export function isValidPercentage(value: any): boolean {
    const num = Number(value)
    return !isNaN(num) && num >= 0 && num <= 100
}

// Limpar e validar símbolo de trading
export function sanitizeSymbol(symbol: string): string {
    if (!symbol || typeof symbol !== 'string') return ''
    // Remove caracteres especiais, mantém apenas letras, números e /
    return symbol.toUpperCase().replace(/[^A-Z0-9/]/g, '')
}

// Validar formato de símbolo (ex: BTC/USDT)
export function isValidSymbol(symbol: string): boolean {
    if (!symbol || typeof symbol !== 'string') return false
    const symbolRegex = /^[A-Z0-9]+\/[A-Z0-9]+$/
    return symbolRegex.test(symbol.toUpperCase())
}

// Formatar telefone para envio (apenas números com código do país)
export function formatPhoneForApi(phone: string): string {
    if (!phone) return ''
    // Remove tudo exceto números
    const cleaned = phone.replace(/\D/g, '')
    // Se não começar com código do país, adiciona 55 (Brasil)
    if (cleaned.length <= 11) {
        return '55' + cleaned
    }
    return cleaned
}

// Validar se é um JSON válido
export function isValidJson(str: string): boolean {
    if (!str || typeof str !== 'string') return false
    try {
        JSON.parse(str)
        return true
    } catch {
        return false
    }
}

// Truncar texto com segurança
export function truncateText(text: string, maxLength: number): string {
    if (!text || typeof text !== 'string') return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 3) + '...'
}

// Validar IP ou CIDR
export function isValidIpOrCidr(value: string): boolean {
    if (!value || typeof value !== 'string') return false
    // IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
    // IPv6 simplificado
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(\/\d{1,3})?$/
    return ipv4Regex.test(value) || ipv6Regex.test(value)
}

// Validar API key (formato básico)
export function isValidApiKey(key: string): boolean {
    if (!key || typeof key !== 'string') return false
    // Pelo menos 16 caracteres, apenas alfanuméricos e alguns especiais
    return key.length >= 16 && /^[A-Za-z0-9_-]+$/.test(key)
}

// Gerar senha aleatória segura
export function generateSecurePassword(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    let password = ''
    
    // Garantir pelo menos um de cada tipo
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
    password += '0123456789'[Math.floor(Math.random() * 10)]
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]
    
    // Preencher o resto
    for (let i = password.length; i < length; i++) {
        password += chars[Math.floor(Math.random() * chars.length)]
    }
    
    // Embaralhar
    return password.split('').sort(() => Math.random() - 0.5).join('')
}

