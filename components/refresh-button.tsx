'use client'

import { RefreshCw } from 'lucide-react'

export function RefreshButton() {
  return <button className="button-dark" onClick={() => window.location.reload()}><RefreshCw /> Refresh data</button>
}
