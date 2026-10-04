import { describe, expect, it } from 'vitest'
import { calculateInvoice } from '../lib/invoice'
import { hasMaxDecimals, invoiceSchema, toInvoiceInput, toPreviewInput, type InvoiceFormValues } from '../lib/schema'
import { createSampleInvoice, DRAFT_STORAGE_KEY, GHANA_TAX_PRESET, loadDraft, saveDraft } from '../lib/draft'

const valid = (): InvoiceFormValues => createSampleInvoice(new Date(2026, 0, 15))

function errorPaths(values: unknown): string[] {
  const result = invoiceSchema.safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
}

function messageAt(values: unknown, path: string): string | undefined {
  const result = invoiceSchema.safeParse(values)
  return result.success ? undefined : result.error.issues.find((i) => i.path.join('.') === path)?.message
}

describe('hasMaxDecimals', () => {
  it('accepts values within the limit despite float representation', () => {
    expect(hasMaxDecimals(0.1, 2)).toBe(true)
    expect(hasMaxDecimals(1.15, 2)).toBe(true)
    expect(hasMaxDecimals(12, 2)).toBe(true)
    expect(hasMaxDecimals(33.333, 3)).toBe(true)
  })

  it('rejects extra decimals', () => {
    expect(hasMaxDecimals(1.005, 2)).toBe(false)
    expect(hasMaxDecimals(0.001, 2)).toBe(false)
  })
})

describe('invoiceSchema', () => {
  it('accepts the sample invoice', () => {
    expect(invoiceSchema.safeParse(valid()).success).toBe(true)
  })

  it('accepts the Ghana tax preset lines', () => {
    expect(invoiceSchema.safeParse({ ...valid(), taxes: GHANA_TAX_PRESET }).success).toBe(true)
  })

  it('requires seller, buyer and invoice number (whitespace does not count)', () => {
    const paths = errorPaths({ ...valid(), sellerName: '', buyerName: '   ', invoiceNumber: '' })
    expect(paths).toEqual(expect.arrayContaining(['sellerName', 'buyerName', 'invoiceNumber']))
  })

  it('requires an issue date and allows an empty due date', () => {
    expect(errorPaths({ ...valid(), issueDate: '' })).toContain('issueDate')
    expect(errorPaths({ ...valid(), dueDate: '' })).toEqual([])
  })

  it('rejects a due date before the issue date', () => {
    expect(messageAt({ ...valid(), issueDate: '2026-02-01', dueDate: '2026-01-31' }, 'dueDate')).toMatch(/before/)
  })

  it('requires at least one line item', () => {
    expect(messageAt({ ...valid(), items: [] }, 'items')).toBe('Add at least one line item')
  })

  it('requires quantity to be a whole number of at least 1', () => {
    const withQty = (quantity: number) => ({ ...valid(), items: [{ description: 'A', quantity, unitPrice: 1 }] })
    expect(messageAt(withQty(0), 'items.0.quantity')).toBe('Quantity must be at least 1')
    expect(messageAt(withQty(1.5), 'items.0.quantity')).toBe('Quantity must be a whole number')
    expect(messageAt(withQty(Number.NaN), 'items.0.quantity')).toBe('Quantity is required')
    expect(errorPaths(withQty(1))).toEqual([])
  })

  it('requires price to be >= 0 with at most 2 decimals', () => {
    const withPrice = (unitPrice: number) => ({ ...valid(), items: [{ description: 'A', quantity: 1, unitPrice }] })
    expect(errorPaths(withPrice(0))).toEqual([])
    expect(errorPaths(withPrice(0.1))).toEqual([])
    expect(messageAt(withPrice(-0.01), 'items.0.unitPrice')).toBe('Price cannot be negative')
    expect(messageAt(withPrice(1.005), 'items.0.unitPrice')).toBe('Price can have at most 2 decimal places')
    expect(messageAt(withPrice(Number.NaN), 'items.0.unitPrice')).toBe('Price is required')
  })

  it('requires an item description', () => {
    expect(errorPaths({ ...valid(), items: [{ description: '', quantity: 1, unitPrice: 1 }] })).toContain(
      'items.0.description',
    )
  })

  it('validates tax lines', () => {
    const withTax = (name: string, rate: number) => ({ ...valid(), taxes: [{ name, rate, compound: false }] })
    expect(errorPaths(withTax('VAT', 33.333))).toEqual([])
    expect(errorPaths(withTax('', 15))).toContain('taxes.0.name')
    expect(messageAt(withTax('VAT', 101), 'taxes.0.rate')).toBe('Rate cannot exceed 100%')
    expect(messageAt(withTax('VAT', 1.2345), 'taxes.0.rate')).toBe('Rate can have at most 3 decimal places')
  })

  it('validates discounts by type', () => {
    expect(errorPaths({ ...valid(), discountType: 'percent', discountValue: 101 })).toContain('discountValue')
    expect(errorPaths({ ...valid(), discountType: 'amount', discountValue: 10.005 })).toContain('discountValue')
    expect(errorPaths({ ...valid(), discountType: 'amount', discountValue: 500 })).toEqual([])
  })

  it('rejects unsupported currencies', () => {
    expect(errorPaths({ ...valid(), currency: 'EUR' })).toContain('currency')
  })
})

describe('form -> calculation mapping', () => {
  it('maps validated values to calculation input', () => {
    const values = { ...valid(), discountType: 'percent' as const, discountValue: 10, taxes: GHANA_TAX_PRESET }
    const totals = calculateInvoice(toInvoiceInput(values))
    // Sample: 8 x 250.00 + 1 x 120.50 = 2,120.50; 10% off = 1,908.45; levies 2.5% x 2 + VAT 15% = 20%.
    expect(totals.subtotalMinor).toBe(212_050)
    expect(totals.taxableMinor).toBe(190_845)
    expect(totals.taxes.map((t) => t.amountMinor)).toEqual([4771, 4771, 28_627])
    expect(totals.totalMinor).toBe(229_014)
  })

  it('treats empty or invalid numbers as zero in the live preview instead of producing NaN', () => {
    const input = toPreviewInput({
      items: [
        { description: 'a', quantity: Number.NaN, unitPrice: 10 },
        { description: 'b', quantity: 2, unitPrice: Number.NaN },
        { description: 'c', quantity: 1.5, unitPrice: 10 },
        { description: 'd', quantity: 2, unitPrice: 3.5 },
        undefined,
      ],
      discountType: 'percent',
      discountValue: 250,
      taxes: [{ name: 'T', rate: Number.NaN, compound: false }],
    })
    const totals = calculateInvoice(input)
    expect(totals.subtotalMinor).toBe(700)
    expect(totals.discountMinor).toBe(700) // percent clamped to 100
    expect(totals.totalMinor).toBe(0)
    expect(Number.isNaN(totals.totalMinor)).toBe(false)
  })
})

describe('draft persistence', () => {
  function memoryStorage() {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it('round-trips a draft, restoring empty numbers as NaN', () => {
    const storage = memoryStorage()
    const draft = { ...valid(), items: [{ description: 'Draft', quantity: Number.NaN, unitPrice: 5 }] }
    saveDraft(storage, draft)
    const loaded = loadDraft(storage)
    expect(loaded?.items[0]?.description).toBe('Draft')
    expect(Number.isNaN(loaded?.items[0]?.quantity)).toBe(true)
  })

  it('ignores malformed or missing drafts', () => {
    const storage = memoryStorage()
    expect(loadDraft(storage)).toBeNull()
    storage.data.set(DRAFT_STORAGE_KEY, '{not json')
    expect(loadDraft(storage)).toBeNull()
    storage.data.set(DRAFT_STORAGE_KEY, JSON.stringify({ sellerName: 1 }))
    expect(loadDraft(storage)).toBeNull()
  })

  it('swallows storage errors', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadDraft(throwing)).toBeNull()
    expect(() => saveDraft(throwing, valid())).not.toThrow()
    expect(loadDraft(undefined)).toBeNull()
  })
})
