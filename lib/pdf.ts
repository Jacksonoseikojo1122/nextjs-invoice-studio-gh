import { jsPDF } from 'jspdf'
import { autoTable, type Table } from 'jspdf-autotable'
import { calculateInvoice, formatDate, formatMoney, formatRate } from './invoice'
import { toInvoiceInput, type InvoiceFormValues } from './schema'

// jspdf-autotable assigns the most recently drawn table to `doc.lastAutoTable`
// (initialised to `false`) but does not declare it on jsPDF's type.
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: Table | false
  }
}

const PAGE_MARGIN = 16
const INK: [number, number, number] = [17, 24, 39]
const MUTED: [number, number, number] = [107, 114, 128]
const RULE: [number, number, number] = [229, 231, 235]
const ACCENT: [number, number, number] = [30, 64, 175]

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Render a validated invoice to an A4 PDF. Totals come from the same `calculateInvoice`
 * used by the on-screen totals panel, so the document always matches the UI.
 */
export function buildInvoicePdf(values: InvoiceFormValues): jsPDF {
  const totals = calculateInvoice(toInvoiceInput(values))
  const money = (minor: number) => formatMoney(minor, values.currency, { display: 'code' })
  const amount = (minor: number) => formatMoney(minor, values.currency, { display: 'none' })

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Invoice ${values.invoiceNumber}`, subject: `Invoice for ${values.buyerName}` })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const right = pageWidth - PAGE_MARGIN
  const contentWidth = pageWidth - PAGE_MARGIN * 2

  // Header: title on the left, seller block on the right.
  doc.setTextColor(...ACCENT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.text('INVOICE', PAGE_MARGIN, 26)

  doc.setTextColor(...INK)
  doc.setFontSize(11)
  doc.text(values.sellerName, right, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const sellerLines = lines(values.sellerDetails).flatMap((l) => doc.splitTextToSize(l, 80) as string[])
  sellerLines.forEach((l, i) => doc.text(l, right, 25 + i * 4.5, { align: 'right' }))

  let y = Math.max(36, 25 + sellerLines.length * 4.5 + 4)
  doc.setDrawColor(...RULE)
  doc.line(PAGE_MARGIN, y, right, y)
  y += 8

  // Bill-to block (left) and invoice meta (right).
  const blockTop = y
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('BILL TO', PAGE_MARGIN, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.text(values.buyerName, PAGE_MARGIN, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const buyerLines = lines(values.buyerDetails).flatMap((l) => doc.splitTextToSize(l, 90) as string[])
  buyerLines.forEach((l, i) => doc.text(l, PAGE_MARGIN, y + 11 + i * 4.5))
  const buyerBottom = y + 11 + buyerLines.length * 4.5

  const meta: [string, string][] = [
    ['Invoice no.', values.invoiceNumber],
    ['Issue date', formatDate(values.issueDate)],
    ...(values.dueDate ? ([['Due date', formatDate(values.dueDate)]] as [string, string][]) : []),
    ['Currency', values.currency],
  ]
  meta.forEach(([label, value], i) => {
    const rowY = blockTop + i * 5.5
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(label, right - 45, rowY)
    doc.setTextColor(...INK)
    doc.text(value, right, rowY, { align: 'right' })
  })
  y = Math.max(buyerBottom, blockTop + meta.length * 5.5) + 6

  // Line items.
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 20 },
    head: [['#', 'Description', 'Qty', `Unit price (${values.currency})`, `Amount (${values.currency})`]],
    body: totals.lines.map((line, i) => [
      String(i + 1),
      line.description,
      String(line.quantity),
      amount(line.unitPriceMinor),
      amount(line.totalMinor),
    ]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 } },
    headStyles: { fillColor: [243, 244, 246], textColor: MUTED, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { lineColor: RULE, lineWidth: { bottom: 0.2 } },
    columnStyles: {
      0: { cellWidth: 10, textColor: MUTED },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 2) data.cell.styles.halign = 'right'
    },
  })
  y = (doc.lastAutoTable ? (doc.lastAutoTable.finalY ?? y) : y) + 8

  // Totals block, right-aligned.
  const totalRows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Subtotal', value: money(totals.subtotalMinor) },
  ]
  if (totals.discountMinor > 0) {
    const label = values.discountType === 'percent' ? `Discount (${formatRate(values.discountValue)})` : 'Discount'
    totalRows.push({ label, value: `-${money(totals.discountMinor)}` })
  }
  for (const tax of totals.taxes) {
    totalRows.push({ label: `${tax.name} (${formatRate(tax.rate)})`, value: money(tax.amountMinor) })
  }
  totalRows.push({ label: 'Total due', value: money(totals.totalMinor), strong: true })

  const totalsHeight = totalRows.length * 6 + 6
  if (y + totalsHeight > pageHeight - 24) {
    doc.addPage()
    y = PAGE_MARGIN + 8
  }
  const labelX = right - 80
  totalRows.forEach((row) => {
    if (row.strong) {
      doc.setDrawColor(...INK)
      doc.setLineWidth(0.4)
      doc.line(labelX, y - 4, right, y - 4)
      y += 1.5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...INK)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED)
    }
    doc.text(row.label, labelX, y)
    doc.setTextColor(...INK)
    doc.text(row.value, right, y, { align: 'right' })
    y += 6
  })

  // Notes.
  if (values.notes.trim()) {
    const noteLines = doc.splitTextToSize(values.notes.trim(), contentWidth) as string[]
    y += 6
    if (y + 6 + noteLines.length * 4.5 > pageHeight - 24) {
      doc.addPage()
      y = PAGE_MARGIN + 8
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text('NOTES', PAGE_MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    doc.text(noteLines, PAGE_MARGIN, y + 5.5, { lineHeightFactor: 1.4 })
  }

  // Footer with page numbers on every page.
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`${values.sellerName} · Invoice ${values.invoiceNumber}`, PAGE_MARGIN, pageHeight - 10)
    doc.text(`Page ${page} of ${pageCount}`, right, pageHeight - 10, { align: 'right' })
  }

  return doc
}

export function invoiceFileName(values: Pick<InvoiceFormValues, 'invoiceNumber'>): string {
  const safe = values.invoiceNumber.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'draft'
  return `invoice-${safe}.pdf`
}
