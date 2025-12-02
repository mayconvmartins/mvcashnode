"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.isValidIP = isValidIP;
exports.isValidCIDR = isValidCIDR;
exports.isIPInCIDR = isIPInCIDR;
exports.isIPInList = isIPInList;
exports.sanitizeString = sanitizeString;
exports.isValidSymbol = isValidSymbol;
exports.normalizeSymbol = normalizeSymbol;
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
function isValidPhone(phone) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}
function isValidIP(ip) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
function isValidCIDR(cidr) {
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrRegex.test(cidr))
        return false;
    const [ip, mask] = cidr.split('/');
    const maskNum = parseInt(mask, 10);
    return isValidIP(ip) && maskNum >= 0 && maskNum <= 32;
}
function isIPInCIDR(ip, cidr) {
    if (!isValidIP(ip) || !isValidCIDR(cidr))
        return false;
    const [cidrIP, maskStr] = cidr.split('/');
    const mask = parseInt(maskStr, 10);
    const ipParts = ip.split('.').map(Number);
    const cidrParts = cidrIP.split('.').map(Number);
    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const cidrNum = (cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3];
    const maskNum = ~(0xffffffff >>> mask);
    return (ipNum & maskNum) === (cidrNum & maskNum);
}
function isIPInList(ip, allowedIPs) {
    for (const allowed of allowedIPs) {
        if (allowed === ip)
            return true;
        if (isValidCIDR(allowed) && isIPInCIDR(ip, allowed))
            return true;
    }
    return false;
}
function sanitizeString(str) {
    return str.trim().replace(/\s+/g, ' ');
}
function isValidSymbol(symbol) {
    const symbolRegex = /^[A-Z0-9]+\/[A-Z0-9]+$/;
    return symbolRegex.test(symbol);
}
function normalizeSymbol(symbol) {
    return symbol.replace(/\.(P|F|PERP)$/i, '').toUpperCase();
}
//# sourceMappingURL=validation.js.map