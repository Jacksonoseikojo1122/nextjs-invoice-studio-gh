import InvoiceStudio from '../components/InvoiceStudio'

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Invoice Studio</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Create an invoice in Ghana cedis or US dollars, check the totals as you type, and download a PDF. Everything
          stays in your browser.
        </p>
      </header>
      <InvoiceStudio />
    </main>
  )
}
