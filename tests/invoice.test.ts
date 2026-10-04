import { describe, expect, it } from 'vitest'
import {
  applyTaxes,
  calculateInvoice,
  discountAmount,
  formatDate,
  formatMoney,
  formatRate,
  lineTotal,
  percentOf,
  toMinor,
  type InvoiceInput,
} from '../lib/invoice'

const item = (quantity: number, unitPrice: number) => ({ description: 'x', quantity, unitPrice })

describe('toMinor', () => {
  it('converts major units to integer minor units without float drift', () => {
    expect(toMinor(0.1)).toBe(10)
    expect(toMinor(19.99)).toBe(1999)
    expect(toMinor(1.15)).toBe(115) // 1.15 * 100 === 114.99999999999999 in IEEE 754
    expect(toMinor(0)).toBe(0)
  })

  it('rejects NaN, infinities and negatives', () => {
    expect(() => toMinor(Number.NaN)).toThrow(RangeError)
    expect(() => toMinor(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => toMinor(-1)).toThrow(RangeError)
  })
})

describe('lineTotal', () => {
  it('3 x 0.10 is exactly 30 minor units (naive float math gives 0.30000000000000004)', () => {
    expect(3 * 0.1).not.toBe(0.3)
    expect(lineTotal({ quantity: 3, unitPrice: 0.1 })).toBe(30)
  })

  it('multiplies whole quantities by the unit price', () => {
    expect(lineTotal({ quantity: 8, unitPrice: 250 })).toBe(200_000)
    expect(lineTotal({ quantity: 7, unitPrice: 1.15 })).toBe(805)
  })

  it('rejects fractional quantities', () => {
    expect(() => lineTotal({ quantity: 1.5, unitPrice: 10 })).toThrow(RangeError)
  })
})

describe('percentOf', () => {
  it('rounds half up to the nearest minor unit', () => {
    expect(percentOf(100, 33.333)).toBe(33) // 33.333
    expect(percentOf(1000, 33.333)).toBe(333) // 333.33
    expect(percentOf(150, 33.333)).toBe(50) // 49.9995 -> 50
    expect(percentOf(10, 25)).toBe(3) // 2.5 -> 3 (half up)
    expect(percentOf(30, 15)).toBe(5) // 4.5 -> 5
    expect(percentOf(29, 15)).toBe(4) // 4.35 -> 4
  })

  it('handles fractional percents exactly', () => {
    expect(percentOf(10_000, 2.5)).toBe(250)
    expect(percentOf(12_345, 12.5)).toBe(1543) // 1543.125
  })

  it('handles zero and 100%', () => {
    expect(percentOf(0, 15)).toBe(0)
    expect(percentOf(12_345, 0)).toBe(0)
    expect(percentOf(12_345, 100)).toBe(12_345)
  })

  it('stays exact for large amounts', () => {
    // 9,999,999,999.99 at 33.333% - the intermediate product exceeds 2^53 but BigInt keeps it exact.
    expect(percentOf(999_999_999_999, 33.333)).toBe(333_330_000_000) // 333,329,999,999.667
  })
})

describe('discountAmount', () => {
  it('supports none, percent and fixed amounts', () => {
    expect(discountAmount(10_000, { type: 'none' })).toBe(0)
    expect(discountAmount(10_000, { type: 'percent', value: 10 })).toBe(1000)
    expect(discountAmount(10_000, { type: 'amount', value: 25.5 })).toBe(2550)
  })

  it('never exceeds the subtotal', () => {
    expect(discountAmount(10_000, { type: 'amount', value: 500 })).toBe(10_000)
    expect(discountAmount(10_000, { type: 'percent', value: 150 })).toBe(10_000)
  })
})

describe('applyTaxes', () => {
  it('charges simple taxes on the taxable base', () => {
    const taxes = applyTaxes(10_000, [
      { name: 'Levy A', rate: 2.5, compound: false },
      { name: 'Levy B', rate: 2.5, compound: false },
      { name: 'VAT', rate: 15, compound: false },
    ])
    expect(taxes.map((t) => t.amountMinor)).toEqual([250, 250, 1500])
    expect(taxes.every((t) => t.baseMinor === 10_000)).toBe(true)
  })

  it('charges compound taxes on the base plus earlier tax lines', () => {
    const taxes = applyTaxes(10_000, [
      { name: 'Levy A', rate: 2.5, compound: false },
      { name: 'Levy B', rate: 2.5, compound: false },
      { name: 'VAT', rate: 15, compound: true },
    ])
    expect(taxes[2]).toMatchObject({ baseMinor: 10_500, amountMinor: 1575 })
  })

  it('returns an empty list when there are no taxes', () => {
    expect(applyTaxes(10_000, [])).toEqual([])
  })
})

describe('calculateInvoice', () => {
  it('computes subtotal, discount, taxes and total in minor units', () => {
    const input: InvoiceInput = {
      items: [item(3, 0.1), item(2, 49.99), item(1, 120.5)],
      discount: { type: 'percent', value: 10 },
      taxes: [
        { name: 'Levy', rate: 2.5, compound: false },
        { name: 'VAT', rate: 15, compound: true },
      ],
    }
    const totals = calculateInvoice(input)
    expect(totals.lines.map((l) => l.totalMinor)).toEqual([30, 9998, 12050])
    expect(totals.subtotalMinor).toBe(22_078)
    expect(totals.discountMinor).toBe(2208) // 2207.8
    expect(totals.taxableMinor).toBe(19_870)
    expect(totals.taxes.map((t) => t.amountMinor)).toEqual([497, 3055]) // 496.75; 15% of 20367 = 3055.05
    expect(totals.taxTotalMinor).toBe(3552)
    expect(totals.totalMinor).toBe(23_422)
  })

  it('total always equals taxable base plus the sum of tax lines', () => {
    const totals = calculateInvoice({
      items: [item(7, 3.33), item(13, 0.07)],
      discount: { type: 'amount', value: 1.01 },
      taxes: [{ name: 'T', rate: 33.333, compound: false }],
    })
    expect(totals.totalMinor).toBe(totals.taxableMinor + totals.taxTotalMinor)
    expect(Number.isInteger(totals.totalMinor)).toBe(true)
  })

  it('handles an invoice with no items', () => {
    const totals = calculateInvoice({ items: [], discount: { type: 'none' }, taxes: [] })
    expect(totals.totalMinor).toBe(0)
  })
})

describe('formatMoney', () => {
  it('formats GHS with the cedi symbol by default', () => {
    expect(formatMoney(123_450, 'GHS')).toBe('GH₵1,234.50')
  })

  it('formats USD', () => {
    expect(formatMoney(123_450, 'USD')).toBe('US$1,234.50')
  })

  it('can use the ISO code (for PDF fonts without the ₵ glyph) with a plain space', () => {
    expect(formatMoney(5, 'GHS', { display: 'code' })).toBe('GHS 0.05')
    expect(formatMoney(100_000_000, 'USD', { display: 'code' })).toBe('USD 1,000,000.00')
  })

  it('can omit the currency entirely', () => {
    expect(formatMoney(30, 'GHS', { display: 'none' })).toBe('0.30')
  })
})

describe('formatRate and formatDate', () => {
  it('formats percents compactly', () => {
    expect(formatRate(15)).toBe('15%')
    expect(formatRate(2.5)).toBe('2.5%')
    expect(formatRate(33.333)).toBe('33.333%')
  })

  it('formats ISO dates without time-zone drift', () => {
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})
