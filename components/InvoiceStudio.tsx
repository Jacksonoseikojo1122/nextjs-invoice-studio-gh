'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { calculateInvoice, CURRENCIES, formatMoney, formatRate } from '../lib/invoice'
import { invoiceSchema, toPreviewInput, type InvoiceFormValues } from '../lib/schema'
import {
  browserStorage,
  clearDraft,
  createSampleInvoice,
  GHANA_TAX_PRESET,
  loadDraft,
  saveDraft,
} from '../lib/draft'
import { Field, fieldA11y, inputClass } from './Field'

const sectionClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
const sectionTitle = 'mb-4 text-base font-semibold text-slate-900'
const secondaryButton =
  'inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ' +
  'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600'
const removeButton =
  'inline-flex h-9 items-center justify-center rounded-md border border-slate-300 px-2.5 text-sm text-slate-600 ' +
  'hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

export default function InvoiceStudio() {
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    // Dates are filled in on mount so server and client render identical HTML.
    defaultValues: createSampleInvoice(null),
    mode: 'onTouched',
  })
  const items = useFieldArray({ control, name: 'items' })
  const taxes = useFieldArray({ control, name: 'taxes' })
  const [status, setStatus] = useState<string | null>(null)

  // Restore the saved draft (or seed today's dates), then autosave every change.
  useEffect(() => {
    const storage = browserStorage()
    reset(loadDraft(storage) ?? createSampleInvoice())
    const subscription = watch((values) => saveDraft(storage, values))
    return () => subscription.unsubscribe()
  }, [reset, watch])

  const watched = useWatch({ control })
  const totals = useMemo(() => calculateInvoice(toPreviewInput(watched)), [watched])
  const currency = watched.currency ?? 'GHS'
  const discountType = watched.discountType ?? 'none'
  const fmt = (minor: number) => formatMoney(minor, currency)

  const onSubmit = async (values: InvoiceFormValues) => {
    setStatus(null)
    try {
      const { buildInvoicePdf, invoiceFileName } = await import('../lib/pdf')
      buildInvoicePdf(values).save(invoiceFileName(values))
      setStatus('PDF downloaded.')
    } catch (error) {
      console.error(error)
      setStatus('Could not generate the PDF. Please try again.')
    }
  }

  const onInvalid = () => setStatus('Please fix the highlighted fields.')

  const resetToSample = () => {
    if (!window.confirm('Discard this draft and start from the sample invoice?')) return
    clearDraft(browserStorage())
    reset(createSampleInvoice())
    setStatus(null)
  }

  const err = errors
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit, onInvalid)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2">
          <section className={sectionClass} aria-labelledby="from-heading">
            <h2 id="from-heading" className={sectionTitle}>
              From
            </h2>
            <div className="grid gap-4">
              <Field id="sellerName" label="Business name" error={err.sellerName?.message}>
                <input className={inputClass} autoComplete="organization" {...fieldA11y('sellerName', err.sellerName?.message)} {...register('sellerName')} />
              </Field>
              <Field id="sellerDetails" label="Address and contact details" error={err.sellerDetails?.message}>
                <textarea rows={3} className={inputClass} {...fieldA11y('sellerDetails', err.sellerDetails?.message)} {...register('sellerDetails')} />
              </Field>
            </div>
          </section>

          <section className={sectionClass} aria-labelledby="to-heading">
            <h2 id="to-heading" className={sectionTitle}>
              Bill to
            </h2>
            <div className="grid gap-4">
              <Field id="buyerName" label="Client name" error={err.buyerName?.message}>
                <input className={inputClass} {...fieldA11y('buyerName', err.buyerName?.message)} {...register('buyerName')} />
              </Field>
              <Field id="buyerDetails" label="Client address and details" error={err.buyerDetails?.message}>
                <textarea rows={3} className={inputClass} {...fieldA11y('buyerDetails', err.buyerDetails?.message)} {...register('buyerDetails')} />
              </Field>
            </div>
          </section>
        </div>

        <section className={sectionClass} aria-labelledby="details-heading">
          <h2 id="details-heading" className={sectionTitle}>
            Invoice details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field id="invoiceNumber" label="Invoice number" error={err.invoiceNumber?.message}>
              <input className={inputClass} {...fieldA11y('invoiceNumber', err.invoiceNumber?.message)} {...register('invoiceNumber')} />
            </Field>
            <Field id="issueDate" label="Issue date" error={err.issueDate?.message}>
              <input type="date" className={inputClass} {...fieldA11y('issueDate', err.issueDate?.message)} {...register('issueDate')} />
            </Field>
            <Field id="dueDate" label="Due date (optional)" error={err.dueDate?.message}>
              <input type="date" className={inputClass} {...fieldA11y('dueDate', err.dueDate?.message)} {...register('dueDate')} />
            </Field>
            <Field id="currency" label="Currency" error={err.currency?.message}>
              <select className={inputClass} {...fieldA11y('currency', err.currency?.message)} {...register('currency')}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c === 'GHS' ? 'GHS (Ghana cedi)' : 'USD (US dollar)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="items-heading">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id="items-heading" className="text-base font-semibold text-slate-900">
              Line items
            </h2>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => items.append({ description: '', quantity: 1, unitPrice: 0 }, { shouldFocus: true })}
            >
              Add item
            </button>
          </div>

          <div
            aria-hidden="true"
            className="mb-2 hidden grid-cols-[minmax(0,1fr)_90px_130px_120px_44px] gap-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid"
          >
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          <ul className="grid gap-4 md:gap-3">
            {items.fields.map((field, index) => {
              const e = err.items?.[index]
              const line = totals.lines[index]
              return (
                <li
                  key={field.id}
                  className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-4 last:border-0 md:grid-cols-[minmax(0,1fr)_90px_130px_120px_44px] md:items-start md:border-0 md:pb-0"
                >
                  <Field id={`item-${index}-description`} label={`Item ${index + 1} description`} error={e?.description?.message} className="col-span-2 md:col-span-1" hideLabel="md">
                    <input
                      className={inputClass}
                      {...fieldA11y(`item-${index}-description`, e?.description?.message)}
                      {...register(`items.${index}.description`)}
                    />
                  </Field>
                  <Field id={`item-${index}-quantity`} label="Quantity" error={e?.quantity?.message} hideLabel="md">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      className={inputClass}
                      {...fieldA11y(`item-${index}-quantity`, e?.quantity?.message)}
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                    />
                  </Field>
                  <Field id={`item-${index}-price`} label={`Unit price (${currency})`} error={e?.unitPrice?.message} hideLabel="md">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      className={inputClass}
                      {...fieldA11y(`item-${index}-price`, e?.unitPrice?.message)}
                      {...register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                    />
                  </Field>
                  <div className="flex items-center text-sm md:h-[38px] md:justify-end">
                    <span className="mr-2 text-slate-500 md:sr-only">Amount:</span>
                    <output className="font-medium tabular-nums text-slate-900" aria-label={`Item ${index + 1} amount`}>
                      {fmt(line?.totalMinor ?? 0)}
                    </output>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className={removeButton}
                      onClick={() => items.remove(index)}
                      disabled={items.fields.length === 1}
                      aria-label={`Remove item ${index + 1}`}
                      title="Remove item"
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {err.items?.root?.message && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {err.items.root.message}
            </p>
          )}
          {err.items?.message && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {err.items.message}
            </p>
          )}
        </section>

        <section className={sectionClass} aria-labelledby="adjust-heading">
          <h2 id="adjust-heading" className={sectionTitle}>
            Discount and taxes
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="discountType" label="Discount">
              <select className={inputClass} {...fieldA11y('discountType')} {...register('discountType')}>
                <option value="none">No discount</option>
                <option value="percent">Percentage of subtotal</option>
                <option value="amount">Fixed amount</option>
              </select>
            </Field>
            {discountType !== 'none' && (
              <Field
                id="discountValue"
                label={discountType === 'percent' ? 'Discount (%)' : `Discount (${currency})`}
                error={err.discountValue?.message}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={discountType === 'percent' ? 0.001 : 0.01}
                  className={inputClass}
                  {...fieldA11y('discountValue', err.discountValue?.message)}
                  {...register('discountValue', { valueAsNumber: true })}
                />
              </Field>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Tax lines</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => taxes.replace(GHANA_TAX_PRESET)}
                  aria-describedby="preset-note"
                >
                  Ghana preset
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => taxes.append({ name: '', rate: 0, compound: false }, { shouldFocus: true })}
                >
                  Add tax line
                </button>
              </div>
            </div>
            <p id="preset-note" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Tax lines are entirely user-configured. The Ghana preset fills in example levy and VAT lines as a
              starting point only: check current GRA rates and rules before issuing an invoice.
            </p>

            {taxes.fields.length === 0 ? (
              <p className="text-sm text-slate-500">No taxes applied.</p>
            ) : (
              <ul className="grid gap-3">
                {taxes.fields.map((field, index) => {
                  const e = err.taxes?.[index]
                  return (
                    <li key={field.id} className="grid grid-cols-[minmax(0,1fr)_110px_44px] items-start gap-3">
                      <Field id={`tax-${index}-name`} label={`Tax ${index + 1} name`} error={e?.name?.message}>
                        <input className={inputClass} {...fieldA11y(`tax-${index}-name`, e?.name?.message)} {...register(`taxes.${index}.name`)} />
                      </Field>
                      <Field id={`tax-${index}-rate`} label="Rate (%)" error={e?.rate?.message}>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step={0.001}
                          className={inputClass}
                          {...fieldA11y(`tax-${index}-rate`, e?.rate?.message)}
                          {...register(`taxes.${index}.rate`, { valueAsNumber: true })}
                        />
                      </Field>
                      <button
                        type="button"
                        className={`${removeButton} mt-6`}
                        onClick={() => taxes.remove(index)}
                        aria-label={`Remove tax line ${index + 1}`}
                        title="Remove tax line"
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                      <label className="col-span-3 -mt-1 flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register(`taxes.${index}.compound`)} />
                        Compound: charge on subtotal plus the tax lines above
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="notes-heading">
          <h2 id="notes-heading" className={sectionTitle}>
            Notes
          </h2>
          <Field id="notes" label="Notes or payment instructions" error={err.notes?.message} hideLabel>
            <textarea rows={4} className={inputClass} {...fieldA11y('notes', err.notes?.message)} {...register('notes')} />
          </Field>
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start" aria-labelledby="totals-heading">
        <div className={sectionClass}>
          <h2 id="totals-heading" className={sectionTitle}>
            Summary
          </h2>
          <dl className="grid gap-2 text-sm" aria-live="polite">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="tabular-nums text-slate-900">{fmt(totals.subtotalMinor)}</dd>
            </div>
            {totals.discountMinor > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Discount</dt>
                <dd className="tabular-nums text-slate-900">-{fmt(totals.discountMinor)}</dd>
              </div>
            )}
            {totals.taxes.map((tax, i) => (
              <div key={i} className="flex justify-between gap-4">
                <dt className="text-slate-600">
                  {tax.name || `Tax ${i + 1}`} ({formatRate(tax.rate)})
                </dt>
                <dd className="tabular-nums text-slate-900">{fmt(tax.amountMinor)}</dd>
              </div>
            ))}
            <div className="mt-2 flex justify-between gap-4 border-t border-slate-200 pt-3 text-base font-semibold">
              <dt>Total due</dt>
              <dd className="tabular-nums">{fmt(totals.totalMinor)}</dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-5 w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {isSubmitting ? 'Generating…' : 'Download PDF'}
          </button>
          <p role="status" className="mt-2 min-h-5 text-center text-xs text-slate-600">
            {status}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Draft autosaves in this browser.</span>
            <button type="button" onClick={resetToSample} className="font-medium text-slate-700 underline hover:text-slate-900">
              Reset
            </button>
          </div>
        </div>
      </aside>
    </form>
  )
}
