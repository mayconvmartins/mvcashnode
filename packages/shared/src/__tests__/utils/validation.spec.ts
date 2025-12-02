import {
  isValidEmail,
  isValidPhone,
  isValidIP,
  isValidCIDR,
  isIPInCIDR,
  isIPInList,
  normalizeSymbol,
  isValidSymbol,
} from '../../utils/validation';

describe('Validation Utils', () => {
  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate correct phone numbers', () => {
      expect(isValidPhone('+5511999999999')).toBe(true);
      expect(isValidPhone('11999999999')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('abc')).toBe(false);
    });
  });

  describe('isValidIP', () => {
    it('should validate correct IPs', () => {
      expect(isValidIP('192.168.1.1')).toBe(true);
      expect(isValidIP('127.0.0.1')).toBe(true);
    });

    it('should reject invalid IPs', () => {
      expect(isValidIP('999.999.999.999')).toBe(false);
      expect(isValidIP('invalid')).toBe(false);
    });
  });

  describe('isValidCIDR', () => {
    it('should validate correct CIDR', () => {
      expect(isValidCIDR('192.168.1.0/24')).toBe(true);
      expect(isValidCIDR('10.0.0.0/8')).toBe(true);
    });

    it('should reject invalid CIDR', () => {
      expect(isValidCIDR('192.168.1.0')).toBe(false);
      expect(isValidCIDR('192.168.1.0/33')).toBe(false);
    });
  });

  describe('isIPInCIDR', () => {
    it('should check if IP is in CIDR range', () => {
      expect(isIPInCIDR('192.168.1.10', '192.168.1.0/24')).toBe(true);
      expect(isIPInCIDR('192.168.2.10', '192.168.1.0/24')).toBe(false);
    });
  });

  describe('isIPInList', () => {
    it('should check if IP is in allowed list', () => {
      const allowed = ['192.168.1.1', '10.0.0.0/8'];
      expect(isIPInList('192.168.1.1', allowed)).toBe(true);
      expect(isIPInList('10.0.0.5', allowed)).toBe(true);
      expect(isIPInList('172.16.0.1', allowed)).toBe(false);
    });
  });

  describe('normalizeSymbol', () => {
    it('should normalize symbol format', () => {
      expect(normalizeSymbol('SOLUSDT.P')).toBe('SOLUSDT');
      expect(normalizeSymbol('btc/usdt')).toBe('BTC/USDT');
    });
  });

  describe('isValidSymbol', () => {
    it('should validate symbol format', () => {
      expect(isValidSymbol('BTC/USDT')).toBe(true);
      expect(isValidSymbol('SOL/USDT')).toBe(true);
      expect(isValidSymbol('BTCUSDT')).toBe(false);
      expect(isValidSymbol('invalid')).toBe(false);
    });
  });
});

