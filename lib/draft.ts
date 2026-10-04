import { draftSchema, type InvoiceFormValues } from './schema'

export const DRAFT_STORAGE_KEY = 'invoice-studio:draft:v1'

/**
 * Example Ghana-style tax lines (levies plus VAT) used by the "Ghana preset" button.
 * These are starting values only, NOT authoritative rates: statutory rates and whether
 * levies form part of the VAT base change over time. Users must confirm current rates
 * with the Ghana Revenue Authority (GRA) and edit the lines accordingly.
 */
export const GHANA_TAX_PRESET: InvoiceFormValues['taxes'] = [
  { name: 'NHIL', rate: 2.5, compound: false },
  { name: 'GETFund Levy', rate: 2.5, compound: false },
  { name: 'VAT', rate: 15, compound: false },
]

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/** Neutral sample invoice shown on first visit. */
export function createSampleInvoice(today: Date | null = new Date()): InvoiceFormValues {
  return {
    sellerName: 'Your Company Ltd',
    sellerDetails: '12 Example Street\nAccra, Ghana\nbilling@example.com',
    buyerName: 'Client Company Ltd',
    buyerDetails: '45 Sample Road\nKumasi, Ghana',
    invoiceNumber: 'INV-0001',
    issueDate: today ? toISODate(today) : '',
    dueDate: today ? toISODate(addDays(today, 14)) : '',
    currency: 'GHS',
    items: [
      { description: 'Consulting services (hours)', quantity: 8, unitPrice: 250 },
      { description: 'Website hosting (monthly)', quantity: 1, unitPrice: 120.5 },
    ],
    discountType: 'none',
    discountValue: 0,
    taxes: [],
    notes: 'Payment due within 14 days. Thank you for your business.',
  }
}

/** `window.localStorage`, or undefined where access throws (e.g. blocked site data) or on the server. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/** Read a saved draft. Returns null if storage is unavailable, empty, or the draft is malformed. */
export function loadDraft(storage: Pick<Storage, 'getItem'> | undefined): InvoiceFormValues | null {
  try {
    const raw = storage?.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = draftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveDraft(storage: Pick<Storage, 'setItem'> | undefined, values: unknown): void {
  try {
    storage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values))
  } catch {
    // Storage full, disabled, or in private mode: drafts are a convenience, so ignore.
  }
}

export function clearDraft(storage: Pick<Storage, 'removeItem'> | undefined): void {
  try {
    storage?.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // ignore
  }
}
