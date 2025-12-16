export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

export function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

export function isValidCIDR(cidr: string): boolean {
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!cidrRegex.test(cidr)) return false;
  const [ip, mask] = cidr.split('/');
  const maskNum = parseInt(mask, 10);
  return isValidIP(ip) && maskNum >= 0 && maskNum <= 32;
}

export function isIPInCIDR(ip: string, cidr: string): boolean {
  if (!isValidIP(ip) || !isValidCIDR(cidr)) return false;

  const [cidrIP, maskStr] = cidr.split('/');
  const mask = parseInt(maskStr, 10);

  const ipParts = ip.split('.').map(Number);
  const cidrParts = cidrIP.split('.').map(Number);

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const cidrNum = (cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3];
  const maskNum = ~(0xffffffff >>> mask);

  return (ipNum & maskNum) === (cidrNum & maskNum);
}

export function isIPInList(ip: string, allowedIPs: string[]): boolean {
  // Se a lista contém "0.0.0.0/0", permite todos os IPs (útil para desenvolvimento)
  if (allowedIPs.includes('0.0.0.0/0')) {
    return true;
  }

  for (const allowed of allowedIPs) {
    if (allowed === ip) return true;
    if (isValidCIDR(allowed) && isIPInCIDR(ip, allowed)) return true;
  }
  return false;
}

export function sanitizeString(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

export function isValidSymbol(symbol: string): boolean {
  // Formato aceito: BASEQUOTE (ex: BTCUSDT, SOLUSDT) - sem barra
  // Deve ter pelo menos 4 caracteres (ex: BTCUSDT = 8, mínimo seria algo como ABTC = 4)
  const symbolRegex = /^[A-Z0-9]{4,}$/;
  return symbolRegex.test(symbol);
}

export function normalizeSymbol(symbol: string): string {
  // Remove sufixos como .P, .F, etc, remove barras "/" e normaliza uppercase
  return symbol.replace(/\.(P|F|PERP|FUTURES)$/i, '').replace(/\//g, '').replace(/\s/g, '').toUpperCase();
}

/**
 * Garante que o símbolo está no formato "BASE/QUOTE"
 * Se o símbolo já tem barra, normaliza e retorna
 * Se não tem barra, tenta detectar usando QUOTE assets comuns
 * @param symbol Símbolo a normalizar (ex: "BNBUSDT" ou "BNB/USDT")
 * @returns Símbolo no formato "BASE/QUOTE"
 * @throws Error se não conseguir determinar o formato
 */
export function ensureSymbolFormat(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error(`Símbolo inválido: ${symbol}`);
  }

  const normalized = normalizeSymbol(symbol.trim());

  // Se já tem barra, validar e retornar
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return `${parts[0]}/${parts[1]}`;
    }
    throw new Error(`Formato de símbolo inválido (múltiplas barras?): ${normalized}`);
  }

  // Lista de QUOTE assets comuns (em ordem de prioridade)
  const commonQuoteAssets = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC', 'DAI', 'TUSD', 'PAX'];

  // Tentar detectar QUOTE asset no final do símbolo
  for (const quoteAsset of commonQuoteAssets) {
    if (normalized.endsWith(quoteAsset)) {
      const baseAsset = normalized.slice(0, -quoteAsset.length);
      if (baseAsset && baseAsset.length > 0) {
        return `${baseAsset}/${quoteAsset}`;
      }
    }
  }

  // Se não encontrou, tentar padrões conhecidos
  // Ex: SOLUSDT -> SOL/USDT (se USDT não foi encontrado acima)
  // Mas isso é mais arriscado, então vamos lançar erro
  throw new Error(
    `Não foi possível determinar formato do símbolo "${symbol}". ` +
    `Formato esperado: "BASE/QUOTE" (ex: "BTC/USDT") ou símbolo sem barra com QUOTE asset conhecido (ex: "BNBUSDT"). ` +
    `QUOTE assets suportados: ${commonQuoteAssets.join(', ')}`
  );
}

/**
 * Extrai o ativo base de um símbolo
 * @param symbol Símbolo no formato "BASE/QUOTE" ou sem barra
 * @returns Ativo base (ex: "BTC" de "BTC/USDT")
 * @throws Error se não conseguir extrair
 */
export function getBaseAsset(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error(`Símbolo inválido para extrair base asset: ${symbol}`);
  }

  // Tentar split primeiro
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    if (parts[0] && parts[0].trim()) {
      return parts[0].trim().toUpperCase();
    }
  }

  // Se não tem barra, usar ensureSymbolFormat
  try {
    const formatted = ensureSymbolFormat(symbol);
    return formatted.split('/')[0];
  } catch (error: any) {
    throw new Error(
      `Não foi possível extrair base asset de "${symbol}": ${error.message}`
    );
  }
}

/**
 * Extrai o ativo quote de um símbolo
 * @param symbol Símbolo no formato "BASE/QUOTE" ou sem barra
 * @returns Ativo quote (ex: "USDT" de "BTC/USDT")
 * @throws Error se não conseguir extrair
 */
export function getQuoteAsset(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error(`Símbolo inválido para extrair quote asset: ${symbol}`);
  }

  // Tentar split primeiro
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    if (parts[1] && parts[1].trim()) {
      return parts[1].trim().toUpperCase();
    }
    // Se tem barra mas não tem quote, usar USDT como padrão
    return 'USDT';
  }

  // Se não tem barra, usar ensureSymbolFormat
  try {
    const formatted = ensureSymbolFormat(symbol);
    const parts = formatted.split('/');
    return parts[1] || 'USDT';
  } catch (error: any) {
    throw new Error(
      `Não foi possível extrair quote asset de "${symbol}": ${error.message}`
    );
  }
}

