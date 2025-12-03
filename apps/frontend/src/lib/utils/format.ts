export function formatCurrency(value: number, currency = 'USD'): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

export function formatNumber(value: number, decimals = 2): string {
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value)
}

export function formatPercentage(value: number | string | null | undefined, decimals = 2): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
    if (isNaN(numValue)) {
        return '0.00%'
    }
    return `${numValue >= 0 ? '+' : ''}${numValue.toFixed(decimals)}%`
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'time' = 'short'): string {
    const d = typeof date === 'string' ? new Date(date) : date

    if (format === 'short') {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }).format(d)
    }

    if (format === 'long') {
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d)
    }

    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(d)
}

export function formatDateTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d)
}

export function truncateAddress(address: string, start = 6, end = 4): string {
    if (address.length <= start + end) return address
    return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function formatSymbol(symbol: string): string {
    return symbol.replace('/', ' / ')
}

export function formatAssetAmount(amount: number, decimals = 8): string {
    // Formatar quantidade de ativo com decimais apropriados
    if (amount === 0) return '0'
    
    // Determinar decimais baseado no valor
    if (amount >= 1) {
        decimals = 2
    } else if (amount >= 0.01) {
        decimals = 4
    } else if (amount >= 0.0001) {
        decimals = 6
    } else {
        decimals = 8
    }
    
    return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(amount)
}

