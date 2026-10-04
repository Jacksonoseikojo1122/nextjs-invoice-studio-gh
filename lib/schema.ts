import { z } from 'zod'
import { CURRENCIES, type DiscountInput, type InvoiceInput } from './invoice'

/** True when `value` has at most `places` decimal places (tolerates binary float noise). */
export function hasMaxDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

const requiredText = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`)

const isoDate = /^\d{4}-\d{2}-\d{2}$/

const money = (label: string) =>
  z
    .number({ error: `${label} is required` })
    .min(0, `${label} cannot be negative`)
    .max(1_000_000_000, `${label} is too large`)
    .refine((v) => hasMaxDecimals(v, 2), `${label} can have at most 2 decimal places`)

const percent = (label: string) =>
  z
    .number({ error: `${label} is required` })
    .min(0, `${label} cannot be negative`)
    .max(100, `${label} cannot exceed 100%`)
    .refine((v) => hasMaxDecimals(v, 3), `${label} can have at most 3 decimal places`)

export const lineItemSchema = z.object({
  description: requiredText('Description', 200),
  quantity: z
    .number({ error: 'Quantity is required' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(1_000_000, 'Quantity is too large'),
  unitPrice: money('Price'),
})

export const taxLineSchema = z.object({
  name: requiredText('Tax name', 60),
  rate: percent('Rate'),
  compound: z.boolean(),
})

export const invoiceSchema = z
  .object({
    sellerName: requiredText('Your business name'),
    sellerDetails: z.string().max(500, 'Keep details under 500 characters'),
    buyerName: requiredText('Client name'),
    buyerDetails: z.string().max(500, 'Keep details under 500 characters'),
    invoiceNumber: requiredText('Invoice number', 40),
    issueDate: z.string().regex(isoDate, 'Issue date is required'),
    dueDate: z.union([z.literal(''), z.string().regex(isoDate, 'Enter a valid date')]),
    currency: z.enum(CURRENCIES),
    items: z.array(lineItemSchema).min(1, 'Add at least one line item').max(200, 'Too many line items'),
    discountType: z.enum(['none', 'percent', 'amount']),
    discountValue: z.number({ error: 'Discount is required' }).min(0, 'Discount cannot be negative'),
    taxes: z.array(taxLineSchema).max(10, 'Too many tax lines'),
    notes: z.string().max(2000, 'Keep notes under 2000 characters'),
  })
  .superRefine((data, ctx) => {
    if (data.dueDate && isoDate.test(data.issueDate) && data.dueDate < data.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date cannot be before the issue date' })
    }
    if (data.discountType === 'percent') {
      if (data.discountValue > 100) {
        ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Discount cannot exceed 100%' })
      } else if (!hasMaxDecimals(data.discountValue, 3)) {
        ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'At most 3 decimal places' })
      }
    }
    if (data.discountType === 'amount' && !hasMaxDecimals(data.discountValue, 2)) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'At most 2 decimal places' })
    }
  })

export type InvoiceFormValues = z.infer<typeof invoiceSchema>

export function toDiscountInput(values: Pick<InvoiceFormValues, 'discountType' | 'discountValue'>): DiscountInput {
  return values.discountType === 'none'
    ? { type: 'none' }
    : { type: values.discountType, value: values.discountValue }
}

/** Map validated form values to the pure calculation input. */
export function toInvoiceInput(values: InvoiceFormValues): InvoiceInput {
  return {
    items: values.items.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
    discount: toDiscountInput(values),
    taxes: values.taxes.map(({ name, rate, compound }) => ({ name, rate, compound })),
  }
}

type DeepPartialValues = {
  [K in keyof InvoiceFormValues]?: InvoiceFormValues[K] extends (infer U)[]
    ? (Partial<U> | undefined)[]
    : InvoiceFormValues[K]
}

/**
 * Best-effort calculation input for the live totals panel while the user is still typing.
 * Empty or invalid numbers (NaN, negatives, fractional quantities) count as 0 instead of
 * poisoning the totals with NaN; out-of-range percents are clamped to 0-100.
 */
export function toPreviewInput(values: DeepPartialValues): InvoiceInput {
  const nonNegative = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0)
  const pct = (n: unknown) => Math.min(100, nonNegative(n))
  const discountType = values.discountType ?? 'none'
  const discountValue = discountType === 'percent' ? pct(values.discountValue) : nonNegative(values.discountValue)
  return {
    items: (values.items ?? []).map((item) => ({
      description: item?.description ?? '',
      quantity: Number.isInteger(item?.quantity) ? nonNegative(item?.quantity) : 0,
      unitPrice: nonNegative(item?.unitPrice),
    })),
    discount: toDiscountInput({ discountType, discountValue }),
    taxes: (values.taxes ?? []).map((tax) => ({
      name: tax?.name ?? '',
      rate: pct(tax?.rate),
      compound: tax?.compound ?? false,
    })),
  }
}

/**
 * Shape-only schema for restoring a saved draft. Drafts may be incomplete, so field
 * contents are not validated here; numbers that were empty (NaN, serialised as null) come back as NaN.
 */
const draftNumber = z
  .number()
  .nullable()
  .transform((v) => v ?? Number.NaN)

export const draftSchema = z.object({
  sellerName: z.string(),
  sellerDetails: z.string(),
  buyerName: z.string(),
  buyerDetails: z.string(),
  invoiceNumber: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  currency: z.enum(CURRENCIES),
  items: z.array(z.object({ description: z.string(), quantity: draftNumber, unitPrice: draftNumber })),
  discountType: z.enum(['none', 'percent', 'amount']),
  discountValue: draftNumber,
  taxes: z.array(z.object({ name: z.string(), rate: draftNumber, compound: z.boolean() })),
  notes: z.string(),
})
