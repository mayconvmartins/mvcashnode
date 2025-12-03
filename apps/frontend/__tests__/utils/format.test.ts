import { formatCurrency, formatPercentage, formatDateTime, formatDate } from '@/lib/utils/format'

describe('format utilities', () => {
  describe('formatCurrency', () => {
    it('formata valores positivos corretamente', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56')
      expect(formatCurrency(0.5)).toBe('$0.50')
      expect(formatCurrency(1000000)).toBe('$1,000,000.00')
    })

    it('formata valores negativos corretamente', () => {
      expect(formatCurrency(-1234.56)).toBe('-$1,234.56')
      expect(formatCurrency(-0.5)).toBe('-$0.50')
    })

    it('formata zero corretamente', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })
  })

  describe('formatPercentage', () => {
    it('formata porcentagens corretamente', () => {
      expect(formatPercentage(0.1234)).toBe('+0.12%')
      expect(formatPercentage(1.5)).toBe('+1.50%')
      expect(formatPercentage(0)).toBe('+0.00%')
    })

    it('formata porcentagens negativas', () => {
      expect(formatPercentage(-0.15)).toBe('-0.15%')
    })
  })

  describe('formatDateTime', () => {
    it('formata data e hora corretamente', () => {
      const date = '2025-12-02T15:30:00.000Z'
      const formatted = formatDateTime(date)
      expect(formatted).toContain('2025')
      expect(formatted).toContain('12')
      expect(formatted).toContain('02')
    })
  })

  describe('formatDate', () => {
    it('formata apenas a data', () => {
      const date = '2025-12-02T15:30:00.000Z'
      const formatted = formatDate(date)
      expect(formatted).toContain('2025')
      expect(formatted).toContain('12')
      expect(formatted).toContain('02')
    })
  })
})

