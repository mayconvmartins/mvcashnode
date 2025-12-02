"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validation_1 = require("../../utils/validation");
describe('Validation Utils', () => {
    describe('isValidEmail', () => {
        it('should validate correct emails', () => {
            expect((0, validation_1.isValidEmail)('test@example.com')).toBe(true);
            expect((0, validation_1.isValidEmail)('user.name@domain.co.uk')).toBe(true);
        });
        it('should reject invalid emails', () => {
            expect((0, validation_1.isValidEmail)('invalid')).toBe(false);
            expect((0, validation_1.isValidEmail)('@example.com')).toBe(false);
            expect((0, validation_1.isValidEmail)('test@')).toBe(false);
        });
    });
    describe('isValidPhone', () => {
        it('should validate correct phone numbers', () => {
            expect((0, validation_1.isValidPhone)('+5511999999999')).toBe(true);
            expect((0, validation_1.isValidPhone)('11999999999')).toBe(true);
        });
        it('should reject invalid phone numbers', () => {
            expect((0, validation_1.isValidPhone)('123')).toBe(false);
            expect((0, validation_1.isValidPhone)('abc')).toBe(false);
        });
    });
    describe('isValidIP', () => {
        it('should validate correct IPs', () => {
            expect((0, validation_1.isValidIP)('192.168.1.1')).toBe(true);
            expect((0, validation_1.isValidIP)('127.0.0.1')).toBe(true);
        });
        it('should reject invalid IPs', () => {
            expect((0, validation_1.isValidIP)('999.999.999.999')).toBe(false);
            expect((0, validation_1.isValidIP)('invalid')).toBe(false);
        });
    });
    describe('isValidCIDR', () => {
        it('should validate correct CIDR', () => {
            expect((0, validation_1.isValidCIDR)('192.168.1.0/24')).toBe(true);
            expect((0, validation_1.isValidCIDR)('10.0.0.0/8')).toBe(true);
        });
        it('should reject invalid CIDR', () => {
            expect((0, validation_1.isValidCIDR)('192.168.1.0')).toBe(false);
            expect((0, validation_1.isValidCIDR)('192.168.1.0/33')).toBe(false);
        });
    });
    describe('isIPInCIDR', () => {
        it('should check if IP is in CIDR range', () => {
            expect((0, validation_1.isIPInCIDR)('192.168.1.10', '192.168.1.0/24')).toBe(true);
            expect((0, validation_1.isIPInCIDR)('192.168.2.10', '192.168.1.0/24')).toBe(false);
        });
    });
    describe('isIPInList', () => {
        it('should check if IP is in allowed list', () => {
            const allowed = ['192.168.1.1', '10.0.0.0/8'];
            expect((0, validation_1.isIPInList)('192.168.1.1', allowed)).toBe(true);
            expect((0, validation_1.isIPInList)('10.0.0.5', allowed)).toBe(true);
            expect((0, validation_1.isIPInList)('172.16.0.1', allowed)).toBe(false);
        });
    });
    describe('normalizeSymbol', () => {
        it('should normalize symbol format', () => {
            expect((0, validation_1.normalizeSymbol)('SOLUSDT.P')).toBe('SOLUSDT');
            expect((0, validation_1.normalizeSymbol)('btc/usdt')).toBe('BTC/USDT');
        });
    });
    describe('isValidSymbol', () => {
        it('should validate symbol format', () => {
            expect((0, validation_1.isValidSymbol)('BTC/USDT')).toBe(true);
            expect((0, validation_1.isValidSymbol)('SOL/USDT')).toBe(true);
            expect((0, validation_1.isValidSymbol)('BTCUSDT')).toBe(false);
            expect((0, validation_1.isValidSymbol)('invalid')).toBe(false);
        });
    });
});
//# sourceMappingURL=validation.spec.js.map