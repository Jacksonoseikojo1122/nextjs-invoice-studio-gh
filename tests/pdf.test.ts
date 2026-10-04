import { describe, expect, it } from 'vitest'
import { buildInvoicePdf, invoiceFileName } from '../lib/pdf'
import { createSampleInvoice, GHANA_TAX_PRESET } from '../lib/draft'

const sample = () => ({
  ...createSampleInvoice(new Date(2026, 9, 4)),
  taxes: GHANA_TAX_PRESET,
  discountType: 'percent' as const,
  discountValue: 10,
})

describe('buildInvoicePdf', () => {
  it('renders totals from the shared calculation into a single page', () => {
    const doc = buildInvoicePdf(sample())
    const raw = doc.output()
    expect(doc.getNumberOfPages()).toBe(1)
    expect(raw).toContain('(GHS 2,120.50)') // subtotal
    expect(raw).toContain('(-GHS 212.05)') // 10% discount
    expect(raw).toContain('(GHS 2,290.14)') // total due
    expect(raw).toContain('(Page 1 of 1)')
  })

  it('paginates long invoices and numbers every page', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i + 1}`, quantity: 1, unitPrice: 1 }))
    const doc = buildInvoicePdf({ ...sample(), items })
    const pages = doc.getNumberOfPages()
    expect(pages).toBeGreaterThan(1)
    expect(doc.output()).toContain(`(Page ${pages} of ${pages})`)
  })
})

describe('invoiceFileName', () => {
  it('produces a filesystem-safe name', () => {
    expect(invoiceFileName({ invoiceNumber: 'INV/2026 #7' })).toBe('invoice-INV-2026-7.pdf')
    expect(invoiceFileName({ invoiceNumber: '  ' })).toBe('invoice-draft.pdf')
  })
})
