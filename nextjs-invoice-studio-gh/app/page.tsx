'use client'
import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Item = { description: string; qty: number; price: number }
type InvoiceForm = {
  seller: string; buyer: string; invoiceNo: string; date: string; currency: 'GHS'|'USD';
  items: Item[]; notes?: string
}

export default function Page(){
  const { register, control, handleSubmit } = useForm<InvoiceForm>({
    defaultValues: { currency: 'GHS', date: new Date().toISOString().slice(0,10), items: [{ description: 'Service', qty: 1, price: 100 }] }
  })
  const { fields, append, remove } = useFieldArray({ name: 'items', control })
  const [previewTotal, setPreviewTotal] = useState(100)

  const onSubmit = (data: InvoiceForm) => {
    const doc = new jsPDF()
    doc.setFontSize(16); doc.text('INVOICE', 14, 20)
    doc.setFontSize(10)
    doc.text(`From: ${data.seller}`, 14, 30)
    doc.text(`To: ${data.buyer}`, 14, 36)
    doc.text(`Invoice #: ${data.invoiceNo}`, 150, 30)
    doc.text(`Date: ${data.date}`, 150, 36)

    autoTable(doc, {
      startY: 50,
      head: [['Description','Qty','Price','Total']],
      body: data.items.map(i=>[i.description, String(i.qty), fmt(i.price, data.currency), fmt(i.qty*i.price, data.currency)])
    })
    const total = data.items.reduce((s,i)=> s + i.qty*i.price, 0)
    doc.text(`Total: ${fmt(total, data.currency)}`, 150, (doc as any).lastAutoTable.finalY + 10)
    if(data.notes) doc.text(`Notes: ${data.notes}`, 14, (doc as any).lastAutoTable.finalY + 20)
    doc.save(`invoice-${data.invoiceNo||'draft'}.pdf`)
  }

  function fmt(n:number, c:'GHS'|'USD'){ return `${c} ${n.toFixed(2)}` }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Invoice Studio (Ghana-ready)</h1>
      <form className="grid gap-3" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Seller (Your business)" className="border p-2 rounded" {...register('seller', {required:true})} />
          <input placeholder="Buyer (Client)" className="border p-2 rounded" {...register('buyer', {required:true})} />
          <input placeholder="Invoice #" className="border p-2 rounded" {...register('invoiceNo', {required:true})} />
          <input type="date" className="border p-2 rounded" {...register('date', {required:true})} />
          <select className="border p-2 rounded" {...register('currency')}>
            <option value="GHS">GHS</option><option value="USD">USD</option>
          </select>
        </div>

        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <b>Items</b>
            <button type="button" className="px-2 py-1 border rounded" onClick={()=> append({ description:'', qty:1, price:0 })}>+ Add</button>
          </div>
          <div className="grid gap-2">
            {fields.map((f, idx)=> (
              <div key={f.id} className="grid grid-cols-[1fr,120px,120px,36px] gap-2">
                <input placeholder="Description" className="border p-2 rounded" {...register(`items.${idx}.description` as const)} />
                <input type="number" step="1" min="1" className="border p-2 rounded" {...register(`items.${idx}.qty` as const, {valueAsNumber:true})} />
                <input type="number" step="0.01" className="border p-2 rounded" {...register(`items.${idx}.price` as const, {valueAsNumber:true})} />
                <button type="button" className="border rounded" onClick={()=> remove(idx)}>✕</button>
              </div>
            ))}
          </div>
        </div>

        <textarea placeholder="Notes" className="border p-2 rounded" {...register('notes')} />
        <button className="bg-black text-white px-4 py-2 rounded w-max">Download PDF</button>
      </form>
    </main>
  )
}