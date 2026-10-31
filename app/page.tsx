import { Activity, Check, ChevronDown, ClipboardList, PackageCheck, RefreshCw, Truck, Warehouse } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RefreshButton } from '@/components/refresh-button'

export const dynamic = 'force-dynamic'

type Order = { po_number: string; blend_code: string | null; arrival_date: string | null; arrival_time: string | null }
type OrderItem = { po_number: string; lot_code: string; qty_usage_ct: number; qty_spare_ct: number; uom: string }
type Scan = { po_number: string; serial_number: string; lot_code: string; pmi_run_no: string | null; scanned_by: string | null; scanned_at: string }

const badge = (value: string) => <span className={`badge ${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>

export default async function Page() {
  const supabase = await createClient()
  const [{ data: orders }, { data: items }, { data: scans }] = await Promise.all([
    supabase.from('orders').select('po_number,blend_code,arrival_date,arrival_time').order('arrival_date', { ascending: false }).limit(12),
    supabase.from('order_items').select('po_number,lot_code,qty_usage_ct,qty_spare_ct,uom').limit(100),
    supabase.from('scan_logs').select('po_number,serial_number,lot_code,pmi_run_no,scanned_by,scanned_at').order('scanned_at', { ascending: false }).limit(8),
  ])
  const safeOrders = (orders ?? []) as Order[]
  const safeItems = (items ?? []) as OrderItem[]
  const safeScans = (scans ?? []) as Scan[]
  const itemCount = safeItems.reduce((sum, item) => sum + Number(item.qty_usage_ct || 0) + Number(item.qty_spare_ct || 0), 0)
  const poSet = new Set(safeScans.map((scan) => scan.po_number))
  const completion = safeItems.length ? Math.round((poSet.size / Math.max(safeOrders.length, 1)) * 100) : 0

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">N</div><div><strong>northstar</strong><span>order fulfillment</span></div></div><nav><a className="active" href="#overview"><Warehouse /> Overview</a><a href="#orders"><ClipboardList /> Purchase orders</a><a href="#scans"><PackageCheck /> Scan activity</a><a href="/fulfillment"><Truck /> RF scanner</a></nav><div className="sidebar-bottom"><div className="warehouse-select"><span className="status-dot" /><div><small>CONNECTED DATABASE</small><strong>Supabase · Live</strong></div><ChevronDown /></div><div className="user"><div className="avatar">RK</div><div><strong>Rina K.</strong><span>Operations lead</span></div></div></div></aside>
    <main className="main-content" id="overview"><header className="topbar"><div><p className="eyebrow">ORDER FULFILLMENT · LIVE OPERATIONS</p><h1>Good morning, Rina.</h1></div><RefreshButton /></header>
      <section className="kpi-grid"><article><div className="kpi-label">Purchase orders</div><strong>{String(safeOrders.length).padStart(2, '0')}</strong><p>loaded from Supabase</p><div className="sparkline" /></article><article><div className="kpi-label">Planned cartons</div><strong>{itemCount.toLocaleString()}</strong><p>usage and spare quantities</p><div className="progress"><span style={{ width: `${Math.min(completion, 100)}%` }} /></div></article><article><div className="kpi-label">Scanned cartons</div><strong>{String(safeScans.length).padStart(2, '0')}</strong><p>latest scanner records</p><div className="stock-bars" /></article><article><div className="kpi-label">Fulfillment coverage</div><strong>{completion}%</strong><p>POs with scan activity</p><div className="mini-line" /></article></section>
      <section className="content-grid"><article className="panel" id="orders"><div className="panel-heading"><div><p className="eyebrow">FULFILLMENT QUEUE</p><h2>Purchase orders</h2></div><a href="/fulfillment/admin">Manage ↗</a></div><div className="table-wrap"><table><thead><tr><th>PO NUMBER</th><th>BLEND</th><th>ARRIVAL DATE</th><th>ARRIVAL TIME</th><th>SCAN STATUS</th></tr></thead><tbody>{safeOrders.map((order) => <tr key={order.po_number}><td>{order.po_number}</td><td>{order.blend_code || '—'}</td><td>{order.arrival_date || '—'}</td><td>{order.arrival_time || '—'}</td><td>{badge(poSet.has(order.po_number) ? 'In progress' : 'Pending')}</td></tr>)}</tbody></table></div></article><article className="panel" id="scans"><div className="panel-heading"><div><p className="eyebrow">LIVE FEED</p><h2>Recent scans</h2></div><span className="live"><i /> Live</span></div><div className="activity-list">{safeScans.map((scan) => <div className="activity-item" key={scan.serial_number}><div className="activity-icon"><Check /></div><div><p><strong>{scan.serial_number}</strong> · {scan.lot_code}</p><small>{scan.po_number} · {scan.scanned_by || 'Scanner operator'}</small></div><time>{new Date(scan.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></article></section>
      <section className="panel inventory-panel"><div className="panel-heading"><div><p className="eyebrow">ORDER CONTENTS</p><h2>Required lots and quantities</h2></div><button className="button-light"><RefreshCw /> Supabase data</button></div><div className="table-wrap"><table><thead><tr><th>PO NUMBER</th><th>LOT CODE</th><th>USAGE</th><th>SPARE</th><th>UOM</th></tr></thead><tbody>{safeItems.map((item, index) => <tr key={`${item.po_number}-${item.lot_code}-${index}`}><td>{item.po_number}</td><td>{item.lot_code}</td><td>{Number(item.qty_usage_ct || 0).toLocaleString()}</td><td>{Number(item.qty_spare_ct || 0).toLocaleString()}</td><td>{item.uom}</td></tr>)}</tbody></table></div></section><footer>Northstar Order Fulfillment · Connected to Supabase <span>Server-rendered on Vercel · <a href="/fulfillment">Open RF scanner</a></span></footer>
    </main></div>
}
