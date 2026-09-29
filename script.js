// ==========================================
// 1. SUPABASE CONFIGURATION & GLOBAL STATES
// ==========================================
const SUPABASE_URL = 'https://dtrzkyjbdjngyuquajkk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zZJ7aREpv6jjemYmrrWtUw_ZgoMD2Us';

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Scanner Global States
let activePO = null;
let activeWHID = null;
let poItems = [];
let allOrdersData = [];
let pendingScanData = null;
let isManualMode = false;
let skuMasterMap = new Map();

// Admin Global States
let parsedOrderData = [];
let parsedSkuData = [];

// Helper: Show Feedback Banner
function showFeedback(msg, type) {
  const banner = document.getElementById('feedbackBanner') || document.getElementById('statusBanner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.innerText = msg;
  banner.className = `banner banner-${type} feedback-banner`;

  setTimeout(() => {
    banner.style.display = 'none';
  }, 4500);
}

// Audio Synthesizer & Haptic Engine
function triggerFeedback(type) {
  playBoostedAudio(type);
  triggerHaptic(type);
  triggerScreenFlash(type);
}

function playBoostedAudio(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.1);
      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(800, now + 0.15);
      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.setValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  } catch (e) {
    console.log('Audio Context Error:', e);
  }
}

function triggerHaptic(type) {
  if (!navigator.vibrate) return;
  if (type === 'success') navigator.vibrate(150);
  else if (type === 'warning') navigator.vibrate([100, 50, 100]);
  else if (type === 'error') navigator.vibrate([200, 100, 200, 100, 300]);
}

function triggerScreenFlash(type) {
  const flashOverlay = document.getElementById('screenFlashOverlay');
  if (!flashOverlay) return;

  flashOverlay.className = `flash-overlay flash-${type}`;
  flashOverlay.style.display = 'block';

  setTimeout(() => {
    flashOverlay.style.display = 'none';
  }, type === 'error' ? 800 : 400);
}

// Load Master SKU Weights
async function loadSkuMaster() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient
    .from('sku_master')
    .select('lot_code, std_net_weight_kg');

  if (!error && data) {
    skuMasterMap.clear();
    data.forEach(item => skuMasterMap.set(item.lot_code, Number(item.std_net_weight_kg)));
  }
}

function parseExcelDate(val) {
  if (!val && val !== 0) return new Date().toISOString().split('T')[0];
  if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) return val.replace(/\//g, '-');
  const num = parseFloat(val);
  if (!isNaN(num) && num > 10000) {
    const utcDays = num - 25569;
    const date = new Date(utcDays * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  return String(val);
}

function parseExcelTime(val) {
  if (!val && val !== 0) return '06:00:00';
  if (typeof val === 'string' && val.includes(':')) return val.length === 5 ? `${val}:00` : val;
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalSeconds = Math.round(num * 86400);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  return String(val);
}

// ==========================================
// 2. ADMIN PAGE MODULE (admin.html)
// ==========================================
function initAdminPage() {
  // Elements SKU Master
  const dropzoneSku = document.getElementById('dropzoneSku');
  const fileInputSku = document.getElementById('fileInputSku');
  const btnSaveSkuMaster = document.getElementById('btnSaveSkuMaster');
  const btnDownloadSkuTemplate = document.getElementById('btnDownloadSkuTemplate');

  // Elements Order Import
  const dropzoneOrder = document.getElementById('dropzoneOrder');
  const fileInputOrder = document.getElementById('fileInputOrder');
  const btnSaveToDb = document.getElementById('btnSaveToDb');
  const btnDownloadOrderTemplate = document.getElementById('btnDownloadOrderTemplate');

  const btnRefresh = document.getElementById('btnRefresh');
  const btnExportLogs = document.getElementById('btnExportLogs');

  // Download Template Listeners
  if (btnDownloadSkuTemplate) btnDownloadSkuTemplate.addEventListener('click', downloadSkuTemplate);
  if (btnDownloadOrderTemplate) btnDownloadOrderTemplate.addEventListener('click', downloadOrderTemplate);

  // Listeners SKU Master Upload
  if (dropzoneSku && fileInputSku) {
    dropzoneSku.addEventListener('click', () => fileInputSku.click());
    fileInputSku.addEventListener('change', (e) => {
      if (e.target.files.length) handleSkuFileSelect(e.target.files[0]);
    });
  }

  // Listeners Order Upload
  if (dropzoneOrder && fileInputOrder) {
    dropzoneOrder.addEventListener('click', () => fileInputOrder.click());
    fileInputOrder.addEventListener('change', (e) => {
      if (e.target.files.length) handleOrderFileSelect(e.target.files[0]);
    });
  }

  if (btnSaveSkuMaster) btnSaveSkuMaster.addEventListener('click', saveSkuMasterToDb);
  if (btnSaveToDb) btnSaveToDb.addEventListener('click', saveToSupabase);
  if (btnRefresh) btnRefresh.addEventListener('click', loadMasterData);
  if (btnExportLogs) btnExportLogs.addEventListener('click', exportScanLogsToExcel);

  loadMasterData();
  populateExportPODropdown();
}

// FUNCTION: GENERATE & DOWNLOAD SKU MASTER TEMPLATE
function downloadSkuTemplate() {
  const sampleSkuData = [
    { lot_code: 'LB2370', std_net_weight_kg: 180 },
    { lot_code: 'LB2625', std_net_weight_kg: 200 },
    { lot_code: 'LG0770', std_net_weight_kg: 140 },
    { lot_code: 'LT2224', std_net_weight_kg: 210 }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleSkuData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SKU Master");
  XLSX.writeFile(workbook, "Template_SKU_Master.xlsx");
  showFeedback('📥 Template SKU Master berhasil di-download!', 'success');
}

// FUNCTION: GENERATE & DOWNLOAD ORDER HMS TEMPLATE
function downloadOrderTemplate() {
  const sampleOrderData = [
    { 
      wh_id: 'WH01', 
      po_number: '101412213', 
      lot_code: 'LB8333', 
      qty_usage_ct: 10, 
      arrival_date: '2026-09-08', 
      arrival_time: '06:00', 
      blend_code: 'AA60R' 
    },
    { 
      wh_id: 'WH01', 
      po_number: '101412213', 
      lot_code: 'LG0778', 
      qty_usage_ct: 5, 
      arrival_date: '2026-09-08', 
      arrival_time: '06:00', 
      blend_code: 'AA60R' 
    },
    { 
      wh_id: 'WH02', 
      po_number: '101412214', 
      lot_code: 'LB2370', 
      qty_usage_ct: 8, 
      arrival_date: '2026-09-09', 
      arrival_time: '08:00', 
      blend_code: 'AA60T' 
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleOrderData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Order Import");
  XLSX.writeFile(workbook, "Template_Order_HMS.xlsx");
  showFeedback('📥 Template Order HMS berhasil di-download!', 'success');
}

// PARSE SKU MASTER FILE
function handleSkuFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

      if (rawRows.length === 0) {
        showFeedback('❌ File SKU Master kosong!', 'error');
        return;
      }
      processSkuMasterRows(rawRows);
    } catch (err) {
      showFeedback(`❌ Gagal membaca file SKU: ${err.message}`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function processSkuMasterRows(rawRows) {
  parsedSkuData = [];
  rawRows.forEach(row => {
    const getVal = (keys) => {
      for (let k of keys) {
        const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
      }
      return '';
    };

    const lotCode = String(getVal(['lot_code', 'lot', 'sku', 'item'])).trim();
    const netWeight = parseFloat(getVal(['std_net_weight_kg', 'net_weight', 'net', 'weight', 'berat'])) || 200.0;

    if (lotCode) {
      parsedSkuData.push({
        lot_code: lotCode,
        std_net_weight_kg: netWeight
      });
    }
  });

  if (parsedSkuData.length === 0) {
    showFeedback('❌ Kolom SKU / Net Weight tidak terdeteksi!', 'error');
    return;
  }

  // Render Preview SKU
  const previewSkuTbody = document.getElementById('previewSkuTbody');
  previewSkuTbody.innerHTML = '';
  parsedSkuData.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${item.lot_code}</strong></td><td>${item.std_net_weight_kg} kg</td>`;
    previewSkuTbody.appendChild(tr);
  });

  document.getElementById('draftSkuCount').innerText = parsedSkuData.length;
  document.getElementById('previewSkuArea').style.display = 'block';
  document.getElementById('btnSaveSkuMaster').style.display = 'inline-block';
  showFeedback(`✅ ${parsedSkuData.length} SKU Master siap disimpan.`, 'success');
}

async function saveSkuMasterToDb() {
  if (parsedSkuData.length === 0 || !supabaseClient) return;

  const btnSaveSkuMaster = document.getElementById('btnSaveSkuMaster');
  btnSaveSkuMaster.disabled = true;
  btnSaveSkuMaster.innerText = '⏳ Saving...';

  try {
    const { error } = await supabaseClient
      .from('sku_master')
      .upsert(parsedSkuData, { onConflict: 'lot_code' });

    if (error) throw error;

    showFeedback('🎉 SKU Master berhasil diperbarui!', 'success');
    
    // Reload local cache map SKU
    await loadSkuMaster();
    
    document.getElementById('previewSkuArea').style.display = 'none';
    btnSaveSkuMaster.style.display = 'none';

    // Auto-revalidate Order Preview jika sedang ada draft yang pending
    if (parsedOrderData.length > 0) {
      renderPreviewOrderTable();
    }
  } catch (err) {
    showFeedback(`❌ Gagal simpan SKU: ${err.message}`, 'error');
  } finally {
    btnSaveSkuMaster.disabled = false;
    btnSaveSkuMaster.innerText = '💾 Simpan Master SKU';
  }
}

// PARSE ORDER FILE (Mandatory: PO, SKU, Qty | Optional: WHID, Date, Time, Blend)
function handleOrderFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

      if (rawRows.length === 0) {
        showFeedback('❌ File Order kosong!', 'error');
        return;
      }
      processExcelRows(rawRows);
    } catch (err) {
      showFeedback(`❌ Gagal membaca file Order: ${err.message}`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function processExcelRows(rawRows) {
  const aggregatedMap = new Map();

  rawRows.forEach(row => {
    const getVal = (keys) => {
      for (let k of keys) {
        const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
      }
      return '';
    };

    // Mandatory
    const poNumber = String(getVal(['po_number', 'po number', 'po', 'no po'])).trim();
    const lotCode = String(getVal(['lot_code', 'lot code', 'sku', 'lot'])).trim();
    const qtyUsage = parseFloat(getVal(['qty_usage_ct', 'qty usage', 'qty ct', 'qty', 'carton'])) || 1.0;

    // Optional
    const whId = String(getVal(['wh_id', 'whid', 'warehouse', 'wh'])).trim() || 'WH01';
    const blendCode = String(getVal(['blend_code', 'blend code', 'blend'])).trim() || '-';
    const rawDate = getVal(['arrival_date', 'arrival date', 'date', 'tanggal']);
    const rawTime = getVal(['arrival_time', 'arrival time', 'time', 'jam', 'rit']);

    const arrivalDate = parseExcelDate(rawDate);
    const arrivalTime = parseExcelTime(rawTime);

    if (poNumber && lotCode) {
      const compositeKey = `${poNumber}___${lotCode}`;

      if (aggregatedMap.has(compositeKey)) {
        const existing = aggregatedMap.get(compositeKey);
        existing.qty_usage_ct += qtyUsage;
        existing.qty_spare_ct += qtyUsage;
      } else {
        aggregatedMap.set(compositeKey, {
          wh_id: whId,
          po_number: poNumber,
          blend_code: blendCode,
          lot_code: lotCode,
          qty_usage_ct: qtyUsage,
          qty_spare_ct: qtyUsage,
          uom: 'CT',
          arrival_date: arrivalDate,
          arrival_time: arrivalTime
        });
      }
    }
  });

  parsedOrderData = Array.from(aggregatedMap.values());

  if (parsedOrderData.length === 0) {
    showFeedback('❌ Format tidak sesuai. Pastikan ada kolom "PO" dan "SKU / Lot Code"', 'error');
    return;
  }

  renderPreviewOrderTable();
  showFeedback(`✅ ${parsedOrderData.length} item Order unik siap disimpan.`, 'success');
}

function renderPreviewOrderTable() {
  const previewTbody = document.getElementById('previewTbody');
  const draftCount = document.getElementById('draftCount');
  const previewArea = document.getElementById('previewArea');
  const btnSaveToDb = document.getElementById('btnSaveToDb');

  if (!previewTbody) return;
  previewTbody.innerHTML = '';

  let missingSkus = new Set();

  parsedOrderData.forEach(item => {
    // Cek ketersediaan LOT di SKU Master Map
    const isSkuValid = skuMasterMap.has(item.lot_code);
    if (!isSkuValid) {
      missingSkus.add(item.lot_code);
    }

    const tr = document.createElement('tr');
    if (!isSkuValid) {
      tr.style.backgroundColor = '#fff5f5'; // Red tint for unregistered SKU
    }

    tr.innerHTML = `
      <td><strong>${item.wh_id}</strong></td>
      <td><strong>${item.po_number}</strong></td>
      <td>
        <strong style="${!isSkuValid ? 'color: #e53e3e;' : ''}">${item.lot_code}</strong>
        ${!isSkuValid ? '<span class="status-badge" style="background:#fed7d7; color:#742a2a; margin-left:6px;">⚠️ SKU UNREGISTERED</span>' : ''}
      </td>
      <td>${item.qty_usage_ct} CT</td>
      <td>${item.arrival_date}</td>
      <td>${item.arrival_time}</td>
      <td>${item.blend_code}</td>
    `;
    previewTbody.appendChild(tr);
  });

  if (draftCount) draftCount.innerText = parsedOrderData.length;
  if (previewArea) previewArea.style.display = 'block';

  // VALIDASI SKU BLOCKER
  if (missingSkus.size > 0) {
    const unregList = Array.from(missingSkus).join(', ');
    showFeedback(`❌ ORDER DITOLAK! Terdeteksi ${missingSkus.size} SKU belum terdaftar di Master: [${unregList}]. Harap upload SKU Master terlebih dahulu di Section 1!`, 'error');
    if (btnSaveToDb) btnSaveToDb.style.display = 'none'; // Lock Save Button
  } else {
    showFeedback(`✅ ${parsedOrderData.length} item Order valid & seluruh SKU terdaftar di Master. Siap disimpan!`, 'success');
    if (btnSaveToDb) btnSaveToDb.style.display = 'inline-block'; // Unlock Save Button
  }
}

async function saveToSupabase() {
  if (parsedOrderData.length === 0 || !supabaseClient) return;

  // Double Guard Check
  const unregItems = parsedOrderData.filter(item => !skuMasterMap.has(item.lot_code));
  if (unregItems.length > 0) {
    const unregList = [...new Set(unregItems.map(i => i.lot_code))].join(', ');
    showFeedback(`❌ GAGAL SIMPAN! SKU berikut belum terdaftar di SKU Master: [${unregList}]`, 'error');
    return;
  }

  const btnSaveToDb = document.getElementById('btnSaveToDb');
  btnSaveToDb.disabled = true;
  btnSaveToDb.innerText = '⏳ Saving...';

  try {
    const uniqueOrdersMap = new Map();
    parsedOrderData.forEach(item => {
      if (!uniqueOrdersMap.has(item.po_number)) {
        uniqueOrdersMap.set(item.po_number, {
          po_number: item.po_number,
          wh_id: item.wh_id,
          blend_code: item.blend_code,
          arrival_date: item.arrival_date,
          arrival_time: item.arrival_time
        });
      }
    });

    const ordersHeaderList = Array.from(uniqueOrdersMap.values());
    const poNumberList = ordersHeaderList.map(o => o.po_number);

    // 1. Upsert Header Orders
    const { error: errOrders } = await supabaseClient
      .from('orders')
      .upsert(ordersHeaderList, { onConflict: 'po_number' });
    if (errOrders) throw errOrders;

    // 2. Delete Items Lama untuk PO ini (Revision Strategy)
    const { error: errDelItems } = await supabaseClient
      .from('order_items')
      .delete()
      .in('po_number', poNumberList);
    if (errDelItems) throw errDelItems;

    // 3. Insert Items Baru
    const orderItemsList = parsedOrderData.map(item => ({
      po_number: item.po_number,
      blend_code: item.blend_code,
      lot_code: item.lot_code,
      qty_usage_ct: item.qty_usage_ct,
      qty_spare_ct: item.qty_spare_ct,
      uom: item.uom
    }));

    const { error: errItems } = await supabaseClient
      .from('order_items')
      .insert(orderItemsList);

    if (errItems) throw errItems;

    showFeedback('🎉 ORDER BERHASIL DISIMPAN KE DATABASE!', 'success');
    parsedOrderData = [];
    document.getElementById('previewArea').style.display = 'none';
    btnSaveToDb.style.display = 'none';

    await loadMasterData();
    await populateExportPODropdown();
  } catch (err) {
    showFeedback(`❌ Gagal menyimpan Order: ${err.message}`, 'error');
  } finally {
    btnSaveToDb.disabled = false;
    btnSaveToDb.innerText = '💾 Simpan Order ke Database';
  }
}

async function loadMasterData() {
  const masterPoTbody = document.getElementById('masterPoTbody');
  if (!masterPoTbody || !supabaseClient) return;

  masterPoTbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading data master...</td></tr>';
  try {
    const { data: orders, error: errOrders } = await supabaseClient.from('orders').select('*').order('arrival_date', { ascending: false });
    if (errOrders) throw errOrders;

    const { data: items, error: errItems } = await supabaseClient.from('order_items').select('po_number');
    if (errItems) throw errItems;

    if (!orders || orders.length === 0) {
      masterPoTbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Belum ada PO tersimpan.</td></tr>';
      return;
    }

    masterPoTbody.innerHTML = '';
    orders.forEach(po => {
      const lotCount = items.filter(i => i.po_number === po.po_number).length;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${po.wh_id || 'WH01'}</strong></td>
        <td><strong>${po.po_number}</strong></td>
        <td>${po.blend_code || '-'}</td>
        <td>${po.arrival_date || '-'}</td>
        <td>${po.arrival_time ? po.arrival_time.substring(0, 5) : '-'}</td>
        <td><strong>${lotCount} LOT</strong></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deletePO('${po.po_number}')">Hapus</button>
        </td>
      `;
      masterPoTbody.appendChild(tr);
    });
  } catch (err) {
    masterPoTbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
  }
}

async function populateExportPODropdown() {
  const exportPoSelect = document.getElementById('exportPoSelect');
  if (!exportPoSelect || !supabaseClient) return;

  const { data: orders } = await supabaseClient.from('orders').select('po_number, wh_id, blend_code').order('created_at', { ascending: false });
  exportPoSelect.innerHTML = '<option value="ALL">-- SEMUA PO / DATA --</option>';

  if (orders) {
    orders.forEach(po => {
      const opt = document.createElement('option');
      opt.value = po.po_number;
      opt.innerText = `[${po.wh_id || 'WH01'}] PO: ${po.po_number}`;
      exportPoSelect.appendChild(opt);
    });
  }
}

async function exportScanLogsToExcel() {
  if (!supabaseClient) return;

  const exportPoSelect = document.getElementById('exportPoSelect');
  const selectedPO = exportPoSelect ? exportPoSelect.value : 'ALL';

  showFeedback('⏳ Mengambil data scan log...', 'warning');

  try {
    let query = supabaseClient.from('scan_logs').select('*').order('scanned_at', { ascending: false });
    if (selectedPO !== 'ALL') {
      query = query.eq('po_number', selectedPO);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    if (!logs || logs.length === 0) {
      showFeedback('⚠️ Tidak ada data scan untuk di-export.', 'warning');
      return;
    }

    const formattedData = logs.map((item, index) => ({
      'No': index + 1,
      'PO Number': item.po_number,
      'Serial Number': item.serial_number,
      'LOT Code': item.lot_code,
      'Case Number': item.case_number || '-',
      'Gross Weight (kg)': item.gross_weight_kg,
      'Net Weight (kg)': item.net_weight_kg,
      'Moisture (%)': item.moisture,
      'Is Bypassed': item.is_bypassed ? 'YES' : 'NO',
      'Scanned By': item.scanned_by || 'Operator',
      'Scanned Timestamp': new Date(item.scanned_at).toLocaleString('id-ID')
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Scan Details");

    const filename = selectedPO === 'ALL' 
      ? `Scan_Detail_Report_All_${new Date().toISOString().split('T')[0]}.xlsx`
      : `Scan_Detail_Report_PO_${selectedPO}.xlsx`;

    XLSX.writeFile(workbook, filename);
    showFeedback('✅ Report Excel berhasil di-download!', 'success');

  } catch (err) {
    showFeedback(`❌ Error Export: ${err.message}`, 'error');
  }
}

window.deletePO = async function(poNumber) {
  if (!confirm(`Yakin ingin menghapus PO [${poNumber}] beserta seluruh LOT terkait?`) || !supabaseClient) return;

  try {
    const { error } = await supabaseClient.from('orders').delete().eq('po_number', poNumber);
    if (error) throw error;
    showFeedback(`🗑️ PO [${poNumber}] berhasil dihapus!`, 'success');
    await loadMasterData();
    await populateExportPODropdown();
  } catch (err) {
    showFeedback(`❌ Delete error: ${err.message}`, 'error');
  }
};

// ==========================================
// 3. SCANNER PAGE MODULE (index.html)
// ==========================================
function initScannerPage() {
  const whSelect = document.getElementById('whSelect');
  const weekSelect = document.getElementById('weekSelect');
  const dateSelect = document.getElementById('dateSelect');
  const poSelect = document.getElementById('poSelect');
  const manualPoInput = document.getElementById('manualPoInput');
  const btnToggleManual = document.getElementById('btnToggleManual');
  const barcodeInput = document.getElementById('barcodeInput');
  const btnOpenLogs = document.getElementById('btnOpenLogs');
  const btnCopyWA = document.getElementById('btnCopyWA');
  const modalBypass = document.getElementById('modalBypass');
  const modalLogs = document.getElementById('modalLogs');

  fetchAllOrders();
  keepInputFocused();

  function keepInputFocused() {
    document.body.addEventListener('click', (e) => {
      if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        barcodeInput.focus();
      }
    });
  }

  function getISOWeek(dateString) {
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `Week ${weekNo} (${d.getFullYear()})`;
  }

  async function fetchAllOrders() {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('arrival_date', { ascending: true });

      if (error) throw error;
      allOrdersData = data || [];
      populateWHIDDropdown();
    } catch (err) {
      showFeedback(`Gagal load PO: ${err.message}`, 'error');
    }
  }

  // STEP 1: POPULATE WHID
  function populateWHIDDropdown() {
    const whList = [...new Set(allOrdersData.map(item => item.wh_id || 'WH01'))];
    whSelect.innerHTML = '<option value="">-- Pilih WHID --</option>';
    whList.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.innerText = `Warehouse: ${w}`;
      whSelect.appendChild(opt);
    });
  }

  // EVENT WHID CHANGED -> FILTER WEEKS & POS
  whSelect.addEventListener('change', () => {
    activeWHID = whSelect.value;
    weekSelect.innerHTML = '<option value="">- Week -</option>';
    dateSelect.innerHTML = '<option value="">- Date -</option>';
    poSelect.innerHTML = '<option value="">-- Pilih PO --</option>';

    weekSelect.disabled = !activeWHID;
    dateSelect.disabled = true;
    poSelect.disabled = !activeWHID;

    if (!activeWHID) return;

    // Populate Weeks for selected WHID
    const whFilteredOrders = allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID);
    const weeks = [...new Set(whFilteredOrders.map(item => getISOWeek(item.arrival_date)))];
    
    weeks.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.innerText = w;
      weekSelect.appendChild(opt);
    });

    // Directly populate POs for this WHID
    populatePOsForWH(whFilteredOrders);
  });

  function populatePOsForWH(ordersList) {
    poSelect.innerHTML = '<option value="">-- Pilih Target PO --</option>';
    ordersList.forEach(po => {
      const opt = document.createElement('option');
      opt.value = po.po_number;
      opt.innerText = `PO: ${po.po_number} (${po.blend_code || '-'})`;
      poSelect.appendChild(opt);
    });
  }

  weekSelect.addEventListener('change', () => {
    const selectedWeek = weekSelect.value;
    dateSelect.innerHTML = '<option value="">- Date -</option>';
    dateSelect.disabled = !selectedWeek;

    if (!selectedWeek) {
      const whFilteredOrders = allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID);
      populatePOsForWH(whFilteredOrders);
      return;
    }

    const filteredDates = [...new Set(
      allOrdersData
        .filter(item => (item.wh_id || 'WH01') === activeWHID && getISOWeek(item.arrival_date) === selectedWeek)
        .map(item => item.arrival_date)
    )];

    filteredDates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.innerText = d;
      dateSelect.appendChild(opt);
    });
  });

  dateSelect.addEventListener('change', () => {
    const selectedDate = dateSelect.value;
    if (!selectedDate) return;

    const matchedPOs = allOrdersData.filter(
      item => (item.wh_id || 'WH01') === activeWHID && item.arrival_date === selectedDate
    );
    populatePOsForWH(matchedPOs);
  });

  poSelect.addEventListener('change', async (e) => {
    activePO = e.target.value;
    await handlePOSelected(activePO);
  });

  btnToggleManual.addEventListener('click', () => {
    isManualMode = !isManualMode;
    if (isManualMode) {
      poSelect.style.display = 'none';
      manualPoInput.style.display = 'block';
      btnToggleManual.innerText = 'Gunakan Dropdown';
      manualPoInput.focus();
    } else {
      poSelect.style.display = 'block';
      manualPoInput.style.display = 'none';
      btnToggleManual.innerText = 'Input Manual PO?';
    }
  });

  manualPoInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const val = manualPoInput.value.trim();
      if (val) {
        activePO = val;
        await handlePOSelected(activePO);
        barcodeInput.focus();
      }
    }
  });

  async function handlePOSelected(poNumber) {
    if (!poNumber) {
      document.getElementById('poSummary').style.display = 'none';
      btnOpenLogs.style.display = 'none';
      btnCopyWA.style.display = 'none';
      document.getElementById('lotTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;">Pilih PO untuk menampilkan LOT</td></tr>';
      return;
    }
    btnOpenLogs.style.display = 'inline-block';
    btnCopyWA.style.display = 'inline-block';
    await fetchPODetails(poNumber);
    barcodeInput.focus();
  }

  async function fetchPODetails(poNumber) {
    try {
      const { data: items, error: errItems } = await supabaseClient
        .from('order_items')
        .select('*')
        .eq('po_number', poNumber);

      if (errItems) throw errItems;

      const { data: logs, error: errLogs } = await supabaseClient
        .from('scan_logs')
        .select('lot_code, net_weight_kg')
        .eq('po_number', poNumber);

      if (errLogs) throw errLogs;

      const poHeader = allOrdersData.find(o => o.po_number === poNumber);

      poItems = items.map(item => {
        const lotLogs = logs.filter(l => l.lot_code === item.lot_code);
        const totalWeightScanned = lotLogs.reduce((sum, l) => sum + Number(l.net_weight_kg), 0);
        const stdWeight = skuMasterMap.get(item.lot_code) || 200.0;
        const scannedCt = parseFloat((totalWeightScanned / stdWeight).toFixed(2));
        return { ...item, scanned_ct: scannedCt };
      });

      renderPOSummary(poHeader, poItems[0]);
      renderLotTable();
    } catch (err) {
      showFeedback(`Error fetching PO details: ${err.message}`, 'error');
    }
  }

  barcodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const rawBarcode = barcodeInput.value.trim();
      barcodeInput.value = '';

      if (!activePO) {
        triggerFeedback('error');
        showFeedback('⚠️ Tolong PILIH PO TARGET terlebih dahulu!', 'warning');
        return;
      }

      if (rawBarcode) {
        await processScan(rawBarcode);
      }
    }
  });

  function parseHMSBarcode(snString) {
    if (!snString || snString.length !== 31) {
      return { isValid: false, message: "Barcode harus 31 Karakter!" };
    }
    return {
      isValid: true,
      serialNumber: snString,
      lotCode: snString.substring(0, 6),
      pmiRunNo: snString.substring(6, 9),
      caseNo: snString.substring(9, 14),
      grossWeight: parseFloat(snString.substring(14, 18)) / 10,
      netWeight: parseFloat(snString.substring(18, 22)) / 10,
      moisture: parseFloat(snString.substring(22, 26)) / 100,
      gradeCode: snString.substring(26, 31)
    };
  }

  async function processScan(rawBarcode) {
    const parsed = parseHMSBarcode(rawBarcode);

    if (!parsed.isValid) {
      triggerFeedback('error');
      showFeedback(`❌ ${parsed.message}`, 'error');
      return;
    }

    if (skuMasterMap.size > 0 && !skuMasterMap.has(parsed.lotCode)) {
      triggerFeedback('error');
      showFeedback(`⚠️ LOT [${parsed.lotCode}] BELUM TERDAFTAR di SKU Master! Contact Admin.`, 'error');
      return;
    }

    const stdNetWeight = skuMasterMap.get(parsed.lotCode) || 200.0;
    const matchedLot = poItems.find(i => i.lot_code === parsed.lotCode);

    if (!matchedLot) {
      triggerFeedback('error');
      showFeedback(`❌ LOT ${parsed.lotCode} TIDAK ADA dalam PO ${activePO}!`, 'error');
      return;
    }

    const scannedWeightCt = parsed.netWeight / stdNetWeight;
    const projectedCt = matchedLot.scanned_ct + scannedWeightCt;
    const maxAllowedCt = Number(matchedLot.qty_usage_ct);

    if (projectedCt > maxAllowedCt + 0.05) {
      triggerFeedback('error');
      showFeedback(`❌ OVER PICKING! LOT [${parsed.lotCode}] sudah FULFILLED (Target: ${maxAllowedCt} CT)`, 'error');
      return;
    }

    // CHECK DUPLICATE SN
    const { data: existingSNs } = await supabaseClient
      .from('scan_logs')
      .select('po_number')
      .eq('serial_number', parsed.serialNumber);

    if (existingSNs && existingSNs.length > 0) {
      const samePOScan = existingSNs.find(s => s.po_number === activePO);
      if (samePOScan) {
        triggerFeedback('error');
        showFeedback(`❌ DUPLICATE SN! Barcode [${parsed.serialNumber}] SUDAH PERNAH DI-SCAN pada PO ini (${activePO})!`, 'error');
        return;
      } else {
        const otherPO = existingSNs[0].po_number;
        pendingScanData = { parsed, isBypassed: true };
        triggerFeedback('warning');
        openBypassModal(`SN [${parsed.serialNumber}] SUDAH PERNAH DI-SCAN di PO [${otherPO}]. Tetap masukkan ke PO ${activePO}?`);
        return;
      }
    }

    await executeSaveScan(parsed, false);
  }

  async function executeSaveScan(parsedData, isBypassed) {
    try {
      const { error } = await supabaseClient
        .from('scan_logs')
        .insert([{
          po_number: activePO,
          serial_number: parsedData.serialNumber,
          lot_code: parsedData.lotCode,
          pmi_run_no: parsedData.pmiRunNo,
          case_number: parsedData.caseNo,
          gross_weight_kg: parsedData.grossWeight,
          net_weight_kg: parsedData.netWeight,
          moisture: parsedData.moisture,
          grade_code: parsedData.gradeCode,
          is_bypassed: isBypassed,
          scanned_by: 'operator_rf1'
        }]);

      if (error) throw error;

      triggerFeedback('success');
      showFeedback(`✅ [${parsedData.lotCode}] SN OK! (+${parsedData.netWeight} KG)`, 'success');
      await fetchPODetails(activePO);
    } catch (err) {
      triggerFeedback('error');
      showFeedback(`❌ DB Save Error: ${err.message}`, 'error');
    }
  }

  btnCopyWA.addEventListener('click', () => {
    if (!activePO || poItems.length === 0) return;

    const sampleItem = poItems[0];
    const totalTargetCT = poItems.reduce((s, i) => s + Number(i.qty_usage_ct), 0);
    const totalScannedCT = poItems.reduce((s, i) => s + Number(i.scanned_ct), 0);
    const pct = totalTargetCT > 0 ? Math.round((totalScannedCT / totalTargetCT) * 100) : 0;
    const isFulfilled = totalScannedCT >= totalTargetCT;
    const headerStatus = isFulfilled ? "✅ *PO FULFILLED*" : "⏳ *PO IN-PROGRESS*";

    let lotBreakdown = poItems.map(item => {
      const statusIcon = item.scanned_ct >= item.qty_usage_ct ? "✅" : (item.scanned_ct > 0 ? "⚠️" : "⬜");
      return `  ${statusIcon} *${item.lot_code}*: ${item.scanned_ct}/${item.qty_usage_ct} CT`;
    }).join("\n");

    const todayStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

    const waMessage = 
`${headerStatus}
🏢 *WHID:* ${activeWHID || 'WH01'}
📌 *PO NUMBER:* ${activePO}
📦 *BLEND:* ${sampleItem.blend_code || '-'}
⏰ *RIT/TIME:* ${sampleItem.arrival_time ? sampleItem.arrival_time.substring(0, 5) : '-'}
📅 *DATE:* ${todayStr}

📊 *PROGRESS OVERALL:* ${totalScannedCT.toFixed(1)} / ${totalTargetCT} CT (${pct}%)

*BREAKDOWN LOT:*
${lotBreakdown}

_Reported via RF Scanner App_`;

    navigator.clipboard.writeText(waMessage).then(() => {
      triggerFeedback('success');
      showFeedback('📋 Laporan WA berhasil di-copy ke clipboard!', 'success');
    }).catch(err => {
      showFeedback('Gagal copy text: ' + err, 'error');
    });
  });

  btnOpenLogs.addEventListener('click', async () => {
    if (!activePO) return;
    document.getElementById('modalPoNum').innerText = activePO;
    modalLogs.style.display = 'flex';
    await loadLogsTable();
  });

  document.getElementById('btnCloseLogs').addEventListener('click', () => {
    modalLogs.style.display = 'none';
    barcodeInput.focus();
  });

  async function loadLogsTable() {
    const tbody = document.getElementById('logTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading logs...</td></tr>';

    try {
      const { data: logs, error } = await supabaseClient
        .from('scan_logs')
        .select('id, serial_number, lot_code, net_weight_kg, scanned_at')
        .eq('po_number', activePO)
        .order('scanned_at', { ascending: false });

      if (error) throw error;

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Belum ada item di-scan.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      logs.forEach(log => {
        const tr = document.createElement('tr');
        const shortSN = '...' + log.serial_number.slice(-8);
        tr.innerHTML = `
          <td><strong>${log.lot_code}</strong></td>
          <td>${shortSN}</td>
          <td>${log.net_weight_kg} kg</td>
          <td>
            <button class="btn btn-delete btn-sm" onclick="deleteScanLog(${log.id})">Hapus</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error: ${err.message}</td></tr>`;
    }
  }

  window.deleteScanLog = async function(logId) {
    if (!confirm("Yakin ingin menghapus scan item ini? Progress LOT akan berkurang.")) return;
    try {
      const { error } = await supabaseClient.from('scan_logs').delete().eq('id', logId);
      if (error) throw error;
      triggerFeedback('success');
      showFeedback('🗑️ Scan item berhasil dihapus!', 'success');
      await loadLogsTable();
      await fetchPODetails(activePO);
    } catch (err) {
      showFeedback(`❌ Delete error: ${err.message}`, 'error');
    }
  };

  function renderPOSummary(poHeader, sampleItem) {
    if(!sampleItem) return;
    document.getElementById('poSummary').style.display = 'block';
    document.getElementById('lblWhId').innerText = (poHeader && poHeader.wh_id) ? poHeader.wh_id : 'WH01';
    document.getElementById('lblBlend').innerText = sampleItem.blend_code || '-';
    document.getElementById('lblTime').innerText = (poHeader && poHeader.arrival_time) ? poHeader.arrival_time.substring(0, 5) : '-';

    const totalTargetCT = poItems.reduce((s, i) => s + Number(i.qty_usage_ct), 0);
    const totalScannedCT = poItems.reduce((s, i) => s + Number(i.scanned_ct), 0);
    const pct = totalTargetCT > 0 ? Math.min(100, Math.round((totalScannedCT / totalTargetCT) * 100)) : 0;

    document.getElementById('lblProgressText').innerText = `${totalScannedCT.toFixed(1)} / ${totalTargetCT} CT (${pct}%)`;
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('progressBar').style.backgroundColor = pct >= 100 ? '#38a169' : '#3182ce';
  }

  function renderLotTable() {
    const tbody = document.getElementById('lotTableBody');
    tbody.innerHTML = '';

    if(poItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#a0aec0;">Tidak ada LOT untuk PO ini.</td></tr>';
      return;
    }

    poItems.forEach(item => {
      const tr = document.createElement('tr');
      let badgeClass = 'badge-open';
      let statusText = 'OPEN';
      
      if (item.scanned_ct >= item.qty_usage_ct) {
        badgeClass = 'badge-done';
        statusText = 'DONE';
      } else if (item.scanned_ct > 0) {
        badgeClass = 'badge-partial';
        statusText = 'PARTIAL';
      }

      tr.innerHTML = `
        <td><strong>${item.lot_code}</strong></td>
        <td>${item.qty_usage_ct} CT</td>
        <td>${item.scanned_ct} CT</td>
        <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function openBypassModal(message) {
    document.getElementById('modalBodyText').innerText = message;
    modalBypass.style.display = 'flex';
  }

  function closeBypassModal() {
    modalBypass.style.display = 'none';
    pendingScanData = null;
    barcodeInput.focus();
  }

  document.getElementById('btnCancelScan').addEventListener('click', closeBypassModal);
  document.getElementById('btnBypassScan').addEventListener('click', async () => {
    if (pendingScanData) {
      const dataToSave = pendingScanData.parsed;
      closeBypassModal();
      await executeSaveScan(dataToSave, true);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (modalBypass.style.display === 'flex') {
      if (e.key === 'Enter') document.getElementById('btnBypassScan').click();
      else if (e.key === 'Escape') document.getElementById('btnCancelScan').click();
    }
  });
}

// ==========================================
// 4. ROUTER INITIALIZER
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSkuMaster();
  if (document.getElementById('barcodeInput')) {
    initScannerPage();
  }
  if (document.getElementById('dropzoneOrder') || document.getElementById('dropzoneSku')) {
    initAdminPage();
  }
});