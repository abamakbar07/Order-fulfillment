import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Northstar Warehouse Operations',
  description: 'Live warehouse inventory and fulfillment operations dashboard.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
