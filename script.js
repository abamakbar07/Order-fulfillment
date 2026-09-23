const SUPABASE_URL = 'https://dtrzkyjbdjngyuquajkk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zZJ7aREpv6jjemYmrrWtUw_ZgoMD2Us';
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (selector) => document.querySelector(selector);
const formatTime = (value) => { const date = new Date(value); if (Number.isNaN(date.getTime())) return '—'; const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000)); return minutes < 1 ? 'just now' : `${minutes}m ago`; };
const showFeedback = (message, error = false) => { const el = $('#feedback'); el.textContent = message; el.style.display = 'block'; el.style.background = error ? '#402523' : '#1b3829'; el.style.color = error ? '#f18d82' : '#a7e8bf'; setTimeout(() => { el.style.display = 'none'; }, 4500); };
const statusBadge = (status) => `<span class="badge badge-${status.toLowerCase()}">${status}</span>`;
const priority = (value) => `<span class="priority priority-${value.toLowerCase()}">${value}</span>`;

async function loadDashboard() {
  if (!db) return showFeedback('Supabase client is unavailable.', true);
  const [ordersResult, inventoryResult, activityResult] = await Promise.all([
    db.from('warehouse_orders').select('order_number,customer,destination,item_count,status,priority,due_at').order('due_at', { ascending: true }).limit(8),
    db.from('warehouse_inventory').select('sku,product_name,location,on_hand,reorder_point,status').order('status', { ascending: true }),
    db.from('warehouse_activity').select('event_type,reference,description,operator_name,created_at').order('created_at', { ascending: false }).limit(5)
  ]);
  const error = ordersResult.error || inventoryResult.error || activityResult.error;
  if (error) { console.error('[v0] Supabase load error:', error); return showFeedback('Could not sync warehouse data. Check your connection.', true); }
  renderOrders(ordersResult.data || []); renderInventory(inventoryResult.data || []); renderActivity(activityResult.data || []);
  $('#lastUpdated').textContent = `Last synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function renderOrders(orders) {
  $('#ordersMetric').textContent = orders.filter((order) => !['Shipped'].includes(order.status)).length.toString().padStart(2, '0');
  $('#ordersBody').innerHTML = orders.length ? orders.map((order) => `<tr><td>${order.order_number}</td><td>${order.customer}</td><td>${order.destination}</td><td>${order.item_count}</td><td>${statusBadge(order.status)}</td><td>${priority(order.priority)}</td></tr>`).join('') : '<tr><td colspan="6" class="loading">No orders in queue.</td></tr>';
}
function renderInventory(items) {
  const healthy = items.filter((item) => item.status === 'In stock').length; const warning = items.filter((item) => item.status === 'Low stock').length; const empty = items.filter((item) => item.status === 'Out of stock').length;
  $('#healthyCount').textContent = healthy; $('#warningCount').textContent = warning; $('#emptyCount').textContent = empty; $('#lowStockMetric').textContent = warning + empty;
  $('#pickedMetric').textContent = `${items.reduce((total, item) => total + item.on_hand, 0).toLocaleString()}`; $('#pickedMeta').textContent = `${items.length} tracked SKUs`; $('#pickedProgress').style.width = `${Math.min(100, Math.round((healthy / Math.max(items.length, 1)) * 100))}%`;
  const draw = (query = '') => { const needle = query.toLowerCase(); const filtered = items.filter((item) => `${item.sku} ${item.product_name} ${item.location}`.toLowerCase().includes(needle)); $('#inventoryBody').innerHTML = filtered.map((item) => `<tr><td>${item.sku}</td><td>${item.product_name}</td><td>${item.location}</td><td>${item.on_hand.toLocaleString()}</td><td>${item.reorder_point.toLocaleString()}</td><td>${statusBadge(item.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="loading">No matching inventory.</td></tr>'; };
  draw(); $('#inventorySearch').oninput = (event) => draw(event.target.value);
}
function renderActivity(events) {
  const icons = { Received: '↓', Picked: '✓', Packed: '□', Shipped: '↗', 'Cycle count': '◷' };
  $('#activityList').innerHTML = events.length ? events.map((event) => `<div class="activity-item"><div class="activity-icon">${icons[event.event_type] || '·'}</div><div><p><strong>${event.event_type}</strong> · ${event.description}</p><small>${event.reference} · ${event.operator_name}</small></div><span class="activity-time">${formatTime(event.created_at)}</span></div>`).join('') : '<div class="loading">No recent activity.</div>';
}
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
$('#refreshButton').addEventListener('click', () => { showFeedback('Syncing latest warehouse data…'); loadDashboard(); });
loadDashboard();
