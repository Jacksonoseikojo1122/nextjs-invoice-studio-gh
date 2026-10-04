import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Invoice Studio',
  description:
    'Build GHS or USD invoices with live totals, configurable tax lines and exact integer money math, then download a clean PDF. Runs entirely in your browser.',
}

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
