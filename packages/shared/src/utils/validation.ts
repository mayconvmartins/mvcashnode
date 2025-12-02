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
  // Formato básico: BASE/QUOTE (ex: BTC/USDT, SOL/USDT)
  const symbolRegex = /^[A-Z0-9]+\/[A-Z0-9]+$/;
  return symbolRegex.test(symbol);
}

export function normalizeSymbol(symbol: string): string {
  // Remove sufixos como .P, .F, etc e normaliza para BASE/QUOTE
  return symbol.replace(/\.(P|F|PERP)$/i, '').toUpperCase();
}

