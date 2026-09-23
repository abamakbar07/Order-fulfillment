import { Activity, AlertTriangle, Boxes, Check, ChevronDown, Clock3, Package, RefreshCw, Search, Truck, Warehouse } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RefreshButton } from '@/components/refresh-button'

export const dynamic = 'force-dynamic'

type Order = { order_number: string; customer: string; destination: string; item_count: number; status: string; priority: string }
type Item = { sku: string; product_name: string; location: string; on_hand: number; reorder_point: number; status: string }
type Event = { event_type: string; reference: string; description: string; operator_name: string; created_at: string }

const badge = (value: string) => <span className={`badge ${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>

export default async function Page() {
  const supabase = await createClient()
  const [{ data: orders }, { data: inventory }, { data: activity }] = await Promise.all([
    supabase.from('warehouse_orders').select('order_number,customer,destination,item_count,status,priority').order('due_at').limit(8),
    supabase.from('warehouse_inventory').select('sku,product_name,location,on_hand,reorder_point,status').order('status'),
    supabase.from('warehouse_activity').select('event_type,reference,description,operator_name,created_at').order('created_at', { ascending: false }).limit(5),
  ])
  const safeOrders = (orders ?? []) as Order[]
  const safeInventory = (inventory ?? []) as Item[]
  const safeActivity = (activity ?? []) as Event[]
  const lowStock = safeInventory.filter((item) => item.status !== 'In stock').length
  const healthy = safeInventory.filter((item) => item.status === 'In stock').length
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">N</div><div><strong>northstar</strong><span>warehouse ops</span></div></div><nav><a className="active" href="#overview"><Warehouse /> Overview</a><a href="#inventory"><Boxes /> Inventory</a><a href="#orders"><Truck /> Outbound orders</a><a href="#activity"><Activity /> Activity log</a></nav><div className="sidebar-bottom"><div className="warehouse-select"><span className="status-dot" /><div><small>ACTIVE WAREHOUSE</small><strong>Jakarta · WH-01</strong></div><ChevronDown /></div><div className="user"><div className="avatar">RK</div><div><strong>Rina K.</strong><span>Operations lead</span></div></div></div></aside>
    <main className="main-content" id="overview"><header className="topbar"><div><p className="eyebrow">MONDAY, 24 JUNE 2024 · SHIFT A</p><h1>Good morning, Rina.</h1></div><RefreshButton /></header>
      <section className="kpi-grid"><article><div className="kpi-label">Orders to fulfill <em>↗ 12.4%</em></div><strong>{String(safeOrders.filter((o) => o.status !== 'Shipped').length).padStart(2, '0')}</strong><p>vs. yesterday</p><div className="sparkline" /></article><article><div className="kpi-label">Items in stock <em>↗ 8.7%</em></div><strong>{safeInventory.reduce((sum, item) => sum + item.on_hand, 0).toLocaleString()}</strong><p>{safeInventory.length} tracked SKUs</p><div className="progress"><span style={{ width: `${Math.round((healthy / Math.max(safeInventory.length, 1)) * 100)}%` }} /></div></article><article><div className="kpi-label">Low stock items <em className="warning">↘ 3.1%</em></div><strong>{String(lowStock).padStart(2, '0')}</strong><p>need attention</p><div className="stock-bars" /></article><article><div className="kpi-label">On-time dispatch <em>↗ 1.8%</em></div><strong>96.2%</strong><p>last 30 days</p><div className="mini-line" /></article></section>
      <section className="content-grid"><article className="panel" id="orders"><div className="panel-heading"><div><p className="eyebrow">FULFILLMENT QUEUE</p><h2>Orders needing attention</h2></div><a href="#orders">View all ↗</a></div><div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DESTINATION</th><th>ITEMS</th><th>STATUS</th><th>PRIORITY</th></tr></thead><tbody>{safeOrders.map((order) => <tr key={order.order_number}><td>{order.order_number}</td><td>{order.customer}</td><td>{order.destination}</td><td>{order.item_count}</td><td>{badge(order.status)}</td><td>{badge(order.priority)}</td></tr>)}</tbody></table></div></article><article className="panel" id="activity"><div className="panel-heading"><div><p className="eyebrow">LIVE FEED</p><h2>Recent activity</h2></div><span className="live"><i /> Live</span></div><div className="activity-list">{safeActivity.map((event) => <div className="activity-item" key={event.reference}><div className="activity-icon"><Check /></div><div><p><strong>{event.event_type}</strong> · {event.description}</p><small>{event.reference} · {event.operator_name}</small></div><time>{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></article></section>
      <section className="panel inventory-panel" id="inventory"><div className="panel-heading"><div><p className="eyebrow">STOCK CONTROL</p><h2>Inventory health</h2></div><button className="button-light">All locations <ChevronDown /></button></div><div className="inventory-summary"><div><strong>{healthy}</strong><small>Healthy stock</small></div><div><strong>{safeInventory.filter((i) => i.status === 'Low stock').length}</strong><small>Below reorder point</small></div><div><strong>{safeInventory.filter((i) => i.status === 'Out of stock').length}</strong><small>Out of stock</small></div><div className="search"><Search /><input placeholder="Search SKU or product" /></div></div><div className="table-wrap"><table><thead><tr><th>SKU</th><th>PRODUCT</th><th>LOCATION</th><th>ON HAND</th><th>REORDER POINT</th><th>STATUS</th></tr></thead><tbody>{safeInventory.map((item) => <tr key={item.sku}><td>{item.sku}</td><td>{item.product_name}</td><td>{item.location}</td><td>{item.on_hand.toLocaleString()}</td><td>{item.reorder_point.toLocaleString()}</td><td>{badge(item.status)}</td></tr>)}</tbody></table></div></section><footer>Northstar Warehouse OS · Connected to Supabase <span>Server-rendered on Vercel</span></footer>
    </main></div>
}
