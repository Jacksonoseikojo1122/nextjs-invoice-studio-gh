# Invoice Studio

[![CI](https://github.com/Jacksonoseikojo1122/nextjs-invoice-studio-gh/actions/workflows/ci.yml/badge.svg)](https://github.com/Jacksonoseikojo1122/nextjs-invoice-studio-gh/actions/workflows/ci.yml)

A small, client-side invoice builder for businesses that bill in **Ghana cedis (GHS)** or **US dollars (USD)**. Fill in seller and client details and line items, add an optional discount and your own tax lines, watch the totals update as you type, and download a clean A4 PDF.

There is no backend: the invoice never leaves the browser. The draft is kept in `localStorage` so a page refresh does not lose work.

## Why

Invoicing tools that use floating-point numbers for money produce totals that are off by a pesewa here and there (`3 × 0.10` is `0.30000000000000004` in JavaScript), and that drift ends up on documents customers pay against. This project keeps all arithmetic in integer minor units, isolates it in small pure functions, and tests it directly, so the totals on screen and in the PDF are exact and identical.

## Features

- Seller and client blocks, invoice number, issue date and optional due date (validated to be on or after the issue date)
- GHS or USD, formatted with `Intl.NumberFormat` using the `en-GH` locale
- Line items with whole-number quantities and prices up to 2 decimal places
- Optional discount, either a percentage of the subtotal or a fixed amount (capped at the subtotal)
- User-defined tax lines (name and percent), each optionally **compound** (charged on the subtotal plus the tax lines above it), plus a "Ghana preset" button that pre-fills example levy and VAT lines
- Live summary panel: subtotal, discount, each tax line and total due, recalculated on every keystroke; empty or half-typed numbers count as zero instead of showing `NaN`
- Schema validation (zod + react-hook-form) with inline, per-field error messages
- Draft autosave to `localStorage`, with a reset-to-sample option; storage failures (private mode, blocked site data) are handled silently
- PDF export: header with seller details, bill-to block, invoice metadata, item table that paginates with a repeated header, right-aligned totals block, notes, and "Page X of Y" footers
- Responsive layout and labelled form controls (no placeholder-only inputs)

## Tax configuration

Tax lines are **entirely user-configured**. The app does not encode any statutory rate as fact.

The "Ghana preset" fills in example lines (NHIL 2.5%, GETFund Levy 2.5%, VAT 15%, all non-compound) as a convenient starting point. Ghanaian tax rates and rules, including which levies are charged and whether they form part of the VAT base, have changed over time and may change again. **Check the current Ghana Revenue Authority (GRA) guidance and edit the lines before issuing an invoice.** Use the compound option where a tax must be charged on top of earlier lines.

## Quickstart

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run build      # production build
npm start          # serve the production build
```

## Design notes

**Integer minor units.** A user-entered amount such as `120.50` is converted once, at the boundary, to `12050` pesewas (or cents) with `toMinor`. Every line total, subtotal and sum after that is integer arithmetic, which is exact. Values are only converted back to decimals for display.

**One rounding step per derived amount.** Percentages (discounts and tax rates, up to 3 decimal places) are applied with `BigInt` and rounded half-up to the nearest minor unit. Each discount or tax amount is rounded exactly once, and the total is defined as `taxable base + sum of tax lines`, so the printed lines always add up to the printed total.

**Pure core, thin UI.** `lib/invoice.ts` has no React, DOM or PDF dependencies. The live summary panel and the PDF generator both call the same `calculateInvoice`, so they cannot disagree.

**Validation lives in one schema.** `lib/schema.ts` defines the zod schema used by the form resolver and by the tests. Fields are validated when first left, then on every change, and again on submit; the PDF is only generated from values that passed it.

**PDF.** Built with jsPDF and jspdf-autotable, which is loaded on demand when you click Download, so it is not part of the initial page bundle. The PDF prints amounts with ISO codes (`GHS 1,234.50`) because jsPDF's built-in Helvetica font has no `₵` glyph; for the same reason, characters outside the Latin-1 range may not render in the PDF.

## Testing

```bash
npm test
```

The suites in `tests/` cover:

- money conversion and rounding (`3 × 0.10`, `1.15`, 33.333% rates, half-up boundaries, very large amounts)
- discounts (percent, fixed, capping) and simple vs compound tax lines
- end-to-end invoice totals, including the invariant that total = taxable base + taxes
- currency formatting for GHS and USD (symbol, ISO code and plain)
- schema edge cases: required fields, quantity must be a whole number of at least 1, price must be non-negative with at most 2 decimals, at least one item, due date ordering, tax and discount limits
- the NaN-safe live preview mapping and draft save/load (including malformed data and throwing storage)
- PDF smoke tests: totals in the document, pagination and page numbering

CI runs type checking, tests and a production build on Node 20 and 22 for every push and pull request.

## Project layout

```
app/
  layout.tsx           metadata and root layout
  page.tsx             page shell
  globals.css          Tailwind CSS v4 entry
components/
  InvoiceStudio.tsx    form, line items, tax lines, live summary (client component)
  Field.tsx            labelled field with inline error and ARIA wiring
lib/
  invoice.ts           pure money maths and formatting (integer minor units)
  schema.ts            zod schema, form-to-calculation mapping, draft shape
  draft.ts             sample data, Ghana tax preset, localStorage helpers
  pdf.ts               jsPDF / autotable invoice rendering
tests/                 vitest suites
.github/workflows/     CI
```

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, react-hook-form, zod 4, jsPDF with jspdf-autotable, Vitest.

---

Built by Jackson Kojo Osei — [LinkedIn](https://www.linkedin.com/in/jackson-kojo-osei-740846189)
