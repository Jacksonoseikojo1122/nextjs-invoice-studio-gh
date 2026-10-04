/**
 * Pure invoice arithmetic and formatting.
 *
 * All money is handled as integer minor units (pesewas for GHS, cents for USD).
 * Amounts entered by the user in major units are converted once, at the edge,
 * via `toMinor`; every sum after that is exact integer arithmetic. Percentages
 * (discounts, tax rates) are applied with BigInt and rounded half-up, so each
 * computed amount is rounded exactly once.
 */

export const CURRENCIES = ['GHS', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]

/** Both supported currencies use 2 fraction digits (100 minor units per major unit). */
const MINOR_PER_MAJOR = 100
/** Percent rates are supported to 3 decimal places (e.g. 12.5%, 33.333%). */
const RATE_SCALE = 1000

export interface LineItemInput {
  description: string
  /** Whole units, >= 1. */
  quantity: number
  /** Price per unit in major units (e.g. 12.50), max 2 decimals. */
  unitPrice: number
}

export interface TaxLineInput {
  name: string
  /** Percent, e.g. 15 for 15%. Up to 3 decimals. */
  rate: number
  /** When true, the tax base includes all tax lines listed before this one. */
  compound: boolean
}

export type DiscountInput =
  | { type: 'none' }
  | { type: 'percent'; value: number }
  | { type: 'amount'; value: number }

export interface InvoiceInput {
  items: LineItemInput[]
  discount: DiscountInput
  taxes: TaxLineInput[]
}

export interface LineTotal {
  description: string
  quantity: number
  unitPriceMinor: number
  totalMinor: number
}

export interface TaxAmount {
  name: string
  rate: number
  compound: boolean
  baseMinor: number
  amountMinor: number
}

export interface InvoiceTotals {
  lines: LineTotal[]
  subtotalMinor: number
  discountMinor: number
  /** Subtotal minus discount; the base for non-compound taxes. */
  taxableMinor: number
  taxes: TaxAmount[]
  taxTotalMinor: number
  totalMinor: number
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number (got ${value})`)
  }
}

/**
 * Convert a major-unit amount (e.g. 19.99) to integer minor units (1999).
 * `Math.round` absorbs binary representation error such as 0.1 * 100 = 10.000000000000002.
 */
export function toMinor(amount: number): number {
  assertNonNegativeFinite(amount, 'Amount')
  const minor = Math.round(amount * MINOR_PER_MAJOR)
  if (!Number.isSafeInteger(minor)) throw new RangeError(`Amount out of range: ${amount}`)
  return minor
}

/** Convert integer minor units back to a major-unit number (for display only). */
export function fromMinor(minor: number): number {
  return minor / MINOR_PER_MAJOR
}

/** Convert a percent (e.g. 12.5) to an integer number of thousandths of a percent (12500). */
function toRateUnits(percent: number): bigint {
  assertNonNegativeFinite(percent, 'Rate')
  return BigInt(Math.round(percent * RATE_SCALE))
}

/** Integer division of non-negative BigInts, rounding half up. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  return remainder * 2n >= denominator ? quotient + 1n : quotient
}

/** `percent`% of an integer minor-unit amount, rounded half-up to the nearest minor unit. */
export function percentOf(minor: number, percent: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new RangeError(`Minor amount must be a non-negative safe integer (got ${minor})`)
  }
  const result = divRoundHalfUp(BigInt(minor) * toRateUnits(percent), BigInt(100 * RATE_SCALE))
  return Number(result)
}

/** Total for one line, in minor units. Quantity must be a whole number. */
export function lineTotal(item: Pick<LineItemInput, 'quantity' | 'unitPrice'>): number {
  if (!Number.isInteger(item.quantity) || item.quantity < 0) {
    throw new RangeError(`Quantity must be a whole number (got ${item.quantity})`)
  }
  const total = item.quantity * toMinor(item.unitPrice)
  if (!Number.isSafeInteger(total)) throw new RangeError('Line total out of range')
  return total
}

/** Discount in minor units, capped at the subtotal so totals never go negative. */
export function discountAmount(subtotalMinor: number, discount: DiscountInput): number {
  switch (discount.type) {
    case 'none':
      return 0
    case 'percent':
      return Math.min(subtotalMinor, percentOf(subtotalMinor, Math.min(discount.value, 100)))
    case 'amount':
      return Math.min(subtotalMinor, toMinor(discount.value))
  }
}

/**
 * Apply tax lines in order. A non-compound line is charged on the taxable base;
 * a compound line is charged on the taxable base plus every tax line before it.
 */
export function applyTaxes(taxableMinor: number, taxes: TaxLineInput[]): TaxAmount[] {
  const result: TaxAmount[] = []
  let runningTax = 0
  for (const tax of taxes) {
    const baseMinor = tax.compound ? taxableMinor + runningTax : taxableMinor
    const amountMinor = percentOf(baseMinor, tax.rate)
    runningTax += amountMinor
    result.push({ name: tax.name, rate: tax.rate, compound: tax.compound, baseMinor, amountMinor })
  }
  return result
}

export function calculateInvoice(input: InvoiceInput): InvoiceTotals {
  const lines: LineTotal[] = input.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceMinor: toMinor(item.unitPrice),
    totalMinor: lineTotal(item),
  }))
  const subtotalMinor = lines.reduce((sum, line) => sum + line.totalMinor, 0)
  const discountMinor = discountAmount(subtotalMinor, input.discount)
  const taxableMinor = subtotalMinor - discountMinor
  const taxes = applyTaxes(taxableMinor, input.taxes)
  const taxTotalMinor = taxes.reduce((sum, tax) => sum + tax.amountMinor, 0)
  return {
    lines,
    subtotalMinor,
    discountMinor,
    taxableMinor,
    taxes,
    taxTotalMinor,
    totalMinor: taxableMinor + taxTotalMinor,
  }
}

export type MoneyDisplay = 'symbol' | 'code' | 'none'

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: Currency, display: MoneyDisplay): Intl.NumberFormat {
  const key = `${currency}:${display}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter =
      display === 'none'
        ? new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : new Intl.NumberFormat('en-GH', { style: 'currency', currency, currencyDisplay: display })
    formatterCache.set(key, formatter)
  }
  return formatter
}

/**
 * Format integer minor units for display, e.g. 123450 GHS -> "GH₵1,234.50".
 * `display: 'code'` gives "GHS 1,234.50" (useful where the ₵ glyph is unavailable, such as
 * jsPDF's built-in fonts); `display: 'none'` gives "1,234.50". Non-breaking spaces emitted by
 * Intl are normalised to plain spaces.
 */
export function formatMoney(
  minor: number,
  currency: Currency,
  options: { display?: MoneyDisplay } = {},
): string {
  return getFormatter(currency, options.display ?? 'symbol')
    .format(fromMinor(minor))
    .replace(/ /g, ' ')
}

/** Format a percent rate for labels, e.g. 2.5 -> "2.5%", 15 -> "15%". */
export function formatRate(percent: number): string {
  return `${new Intl.NumberFormat('en-GH', { maximumFractionDigits: 3 }).format(percent)}%`
}

/** Format an ISO calendar date (YYYY-MM-DD) as e.g. "4 Oct 2026", independent of local time zone. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
