// ====================================================================
// 4. script.js
// ====================================================================
const SUPABASE_URL = 'https://dtrzkyjbdjngyuquajkk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zZJ7aREpv6jjemYmrrWtUw_ZgoMD2Us';

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let activePO = null;
let activeWHID = null;
let poItems = [];
let allOrdersData = [];
let pendingScanData = null;
let isManualMode = false;
let skuMasterMap = new Map();

let parsedOrderData = [];
let parsedSkuData = [];

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
// ADMIN MODULE
// ==========================================
function initAdminPage() {
  const dropzoneSku = document.getElementById('dropzoneSku');
  const fileInputSku = document.getElementById('fileInputSku');
  const btnSaveSkuMaster = document.getElementById('btnSaveSkuMaster');
  const btnDownloadSkuTemplate = document.getElementById('btnDownloadSkuTemplate');

  const dropzoneOrder = document.getElementById('dropzoneOrder');
  const fileInputOrder = document.getElementById('fileInputOrder');
  const btnSaveToDb = document.getElementById('btnSaveToDb');
  const btnDownloadOrderTemplate = document.getElementById('btnDownloadOrderTemplate');

  const btnRefresh = document.getElementById('btnRefresh');
  const btnExportLogs = document.getElementById('btnExportLogs');
  const btnGeneratePdf = document.getElementById('btnGeneratePdf');

  if (btnDownloadSkuTemplate) btnDownloadSkuTemplate.addEventListener('click', downloadSkuTemplate);
  if (btnDownloadOrderTemplate) btnDownloadOrderTemplate.addEventListener('click', downloadOrderTemplate);

  if (dropzoneSku && fileInputSku) {
    dropzoneSku.addEventListener('click', () => fileInputSku.click());
    fileInputSku.addEventListener('change', (e) => {
      if (e.target.files.length) handleSkuFileSelect(e.target.files[0]);
    });
  }

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
  if (btnGeneratePdf) btnGeneratePdf.addEventListener('click', () => {
    const exportPoSelect = document.getElementById('exportPoSelect');
    const po = exportPoSelect ? exportPoSelect.value : 'ALL';
    generateOutboundPdfReport(po);
  });

  loadMasterData();
  populateExportPODropdown();
}

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

function downloadOrderTemplate() {
  const sampleOrderData = [
    { wh_id: 'WH01', po_number: '101412213', lot_code: 'LB8333', qty_usage_ct: 10, arrival_date: '2026-09-08', arrival_time: '06:00', blend_code: 'AA60R' },
    { wh_id: 'WH01', po_number: '101412213', lot_code: 'LG0778', qty_usage_ct: 5, arrival_date: '2026-09-08', arrival_time: '06:00', blend_code: 'AA60R' }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleOrderData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Order Import");
  XLSX.writeFile(workbook, "Template_Order_HMS.xlsx");
  showFeedback('📥 Template Order HMS berhasil di-download!', 'success');
}

function handleSkuFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

      if (rawRows.length === 0) return showFeedback('❌ File SKU Master kosong!', 'error');
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
      parsedSkuData.push({ lot_code: lotCode, std_net_weight_kg: netWeight });
    }
  });

  if (parsedSkuData.length === 0) return showFeedback('❌ Kolom SKU / Net Weight tidak terdeteksi!', 'error');

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

  try {
    const { error } = await supabaseClient.from('sku_master').upsert(parsedSkuData, { onConflict: 'lot_code' });
    if (error) throw error;

    showFeedback('🎉 SKU Master berhasil diperbarui!', 'success');
    await loadSkuMaster();
    document.getElementById('previewSkuArea').style.display = 'none';
    btnSaveSkuMaster.style.display = 'none';

    if (parsedOrderData.length > 0) renderPreviewOrderTable();
  } catch (err) {
    showFeedback(`❌ Gagal simpan SKU: ${err.message}`, 'error');
  } finally {
    btnSaveSkuMaster.disabled = false;
  }
}

function handleOrderFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

      if (rawRows.length === 0) return showFeedback('❌ File Order kosong!', 'error');
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

    const poNumber = String(getVal(['po_number', 'po number', 'po', 'no po'])).trim();
    const lotCode = String(getVal(['lot_code', 'lot code', 'sku', 'lot'])).trim();
    const qtyUsage = parseFloat(getVal(['qty_usage_ct', 'qty usage', 'qty ct', 'qty', 'carton'])) || 1.0;

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

  if (parsedOrderData.length === 0) return showFeedback('❌ Format tidak sesuai! Kolom PO & SKU/Lot wajib ada.', 'error');
  renderPreviewOrderTable();
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
    const isSkuValid = skuMasterMap.has(item.lot_code);
    if (!isSkuValid) missingSkus.add(item.lot_code);

    const tr = document.createElement('tr');
    if (!isSkuValid) tr.style.backgroundColor = '#fff5f5';

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

  if (missingSkus.size > 0) {
    const unregList = Array.from(missingSkus).join(', ');
    showFeedback(`❌ ORDER DITOLAK! ${missingSkus.size} SKU belum terdaftar: [${unregList}]. Harap upload SKU Master terlebih dahulu di Section 1!`, 'error');
    if (btnSaveToDb) btnSaveToDb.style.display = 'none';
  } else {
    showFeedback(`✅ ${parsedOrderData.length} item Order valid & seluruh SKU terdaftar. Siap disimpan!`, 'success');
    if (btnSaveToDb) btnSaveToDb.style.display = 'inline-block';
  }
}

async function saveToSupabase() {
  if (parsedOrderData.length === 0 || !supabaseClient) return;

  const btnSaveToDb = document.getElementById('btnSaveToDb');
  btnSaveToDb.disabled = true;

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

    const { error: errOrders } = await supabaseClient.from('orders').upsert(ordersHeaderList, { onConflict: 'po_number' });
    if (errOrders) throw errOrders;

    const { error: errDelItems } = await supabaseClient.from('order_items').delete().in('po_number', poNumberList);
    if (errDelItems) throw errDelItems;

    const orderItemsList = parsedOrderData.map(item => ({
      po_number: item.po_number,
      blend_code: item.blend_code,
      lot_code: item.lot_code,
      qty_usage_ct: item.qty_usage_ct,
      qty_spare_ct: item.qty_spare_ct,
      uom: item.uom
    }));

    const { error: errItems } = await supabaseClient.from('order_items').insert(orderItemsList);
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

  const { data: orders } = await supabaseClient.from('orders').select('po_number, wh_id').order('created_at', { ascending: false });
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
    if (selectedPO !== 'ALL') query = query.eq('po_number', selectedPO);

    const { data: logs, error } = await query;
    if (error) throw error;

    if (!logs || logs.length === 0) return showFeedback('⚠️ Tidak ada data scan untuk di-export.', 'warning');

    const formattedData = logs.map((item, index) => ({
      'No': index + 1,
      'PO Number': item.po_number,
      'Serial Number': item.serial_number,
      'LOT Code': item.lot_code,
      'Case Number': item.case_number || '-',
      'Gross Weight (kg)': item.gross_weight_kg,
      'Net Weight (kg)': item.net_weight_kg,
      'Is Bypassed': item.is_bypassed ? 'YES' : 'NO',
      'Scanned By': item.scanned_by || 'Operator',
      'Scanned Timestamp': new Date(item.scanned_at).toLocaleString('id-ID')
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Scan Details");
    XLSX.writeFile(workbook, `Scan_Report_${selectedPO}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showFeedback('✅ Report Excel berhasil di-download!', 'success');
  } catch (err) {
    showFeedback(`❌ Error Export: ${err.message}`, 'error');
  }
}

async function generateOutboundPdfReport(poTarget) {
  showFeedback('⏳ Generating PDF Report...', 'warning');
  try {
    let query = supabaseClient.from('orders').select('*, staging_monitoring_logs(*)');
    if (poTarget !== 'ALL') query = query.eq('po_number', poTarget);

    const { data: orders, error } = await query;
    if (error || !orders || orders.length === 0) throw new Error('Data PO / Staging Logs tidak ditemukan.');

    let rowsHtml = '';
    orders.forEach(po => {
      const log = po.staging_monitoring_logs && po.staging_monitoring_logs.length > 0 
        ? po.staging_monitoring_logs[po.staging_monitoring_logs.length - 1] 
        : {};

      rowsHtml += `
        <tr>
          <td><strong>${po.po_number}</strong><br><small>${po.blend_code || ''}</small></td>
          <td>${log.photo_mori_url ? `<img src="${log.photo_mori_url}" class="pdf-img"/>` : '-'}</td>
          <td>${log.photo_serrico_out_url ? `<img src="${log.photo_serrico_out_url}" class="pdf-img"/>` : '-'}</td>
          <td>${log.photo_serrico_in_url ? `<img src="${log.photo_serrico_in_url}" class="pdf-img"/>` : '-'}</td>
          <td>${log.nomor_kain_mori || '-'}</td>
          <td>${log.total_box || 0}</td>
          <td>${log.serrico_trap_qty || 0}</td>
          <td style="background-color: #fef08a; font-weight:bold;">PASSED</td>
          <td style="background-color: #fef08a;">COLD STORAGE</td>
          <td>${po.wh_id || 'WH01'}</td>
          <td>${log.inspection_date || ''}<br>${log.inspection_time || ''}</td>
        </tr>
      `;
    });

    const reportElement = document.createElement('div');
    reportElement.id = 'pdfReportTemplate';
    reportElement.innerHTML = `
      <style>
        #pdfReportTemplate { font-family: Arial, sans-serif; padding: 15px; color: #1e293b; font-size: 10px; }
        .report-header { border-bottom: 2px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 10px; }
        .report-title { font-size: 14px; font-weight: bold; color: #1e3a8a; }
        .report-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 4px; text-align: center; vertical-align: middle; }
        .report-table th { background-color: #f1f5f9; font-weight: bold; }
        .pdf-img { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc; }
      </style>
      <div class="report-header">
        <div class="report-title">Evidence Monitoring Outbound | ${new Date().toLocaleDateString('id-ID')}</div>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th colspan="11" style="background-color: #3b82f6; color: white;">MONITORING MATERIAL (STAGING)</th>
          </tr>
          <tr>
            <th>PO Number</th>
            <th>Kain Mori</th>
            <th>Serrico Luar</th>
            <th>Serrico Dalam</th>
            <th>No. Mori</th>
            <th>Total Box</th>
            <th>Serrico Qty</th>
            <th>Status</th>
            <th>Keterangan</th>
            <th>WHID</th>
            <th>Jam Mon.</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    document.body.appendChild(reportElement);
    const opt = {
      margin: 0.3,
      filename: `Evidence_Report_${poTarget}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };

    await html2pdf().set(opt).from(reportElement).save();
    document.body.removeChild(reportElement);
    showFeedback('🎉 PDF Evidence Report berhasil di-download!', 'success');
  } catch (err) {
    showFeedback(`❌ Gagal generate PDF: ${err.message}`, 'error');
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
// SCANNER MODULE
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

  const btnOpenMonitoring = document.getElementById('btnOpenMonitoring');
  const btnCloseMonitoring = document.getElementById('btnCloseMonitoring');
  const modalMonitoring = document.getElementById('modalMonitoring');
  const btnSubmitMonitoring = document.getElementById('btnSubmitMonitoring');

  const btnOpenDispatch = document.getElementById('btnOpenDispatch');
  const btnCloseDispatch = document.getElementById('btnCloseDispatch');
  const modalDispatch = document.getElementById('modalDispatch');
  const btnSubmitDispatch = document.getElementById('btnSubmitDispatch');

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
      const { data, error } = await supabaseClient.from('orders').select('*').order('arrival_date', { ascending: true });
      if (error) throw error;
      allOrdersData = data || [];
      populateWHIDDropdown();
    } catch (err) {
      showFeedback(`Gagal load PO: ${err.message}`, 'error');
    }
  }

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

  whSelect.addEventListener('change', () => {
    activeWHID = whSelect.value;
    weekSelect.innerHTML = '<option value="">- Week -</option>';
    dateSelect.innerHTML = '<option value="">- Date -</option>';
    poSelect.innerHTML = '<option value="">-- Pilih PO --</option>';

    weekSelect.disabled = !activeWHID;
    dateSelect.disabled = true;
    poSelect.disabled = !activeWHID;

    if (!activeWHID) return;

    const whFilteredOrders = allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID);
    const weeks = [...new Set(whFilteredOrders.map(item => getISOWeek(item.arrival_date)))];
    weeks.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.innerText = w;
      weekSelect.appendChild(opt);
    });

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

    if (!selectedWeek) return populatePOsForWH(allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID));

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
    populatePOsForWH(allOrdersData.filter(item => (item.wh_id || 'WH01') === activeWHID && item.arrival_date === selectedDate));
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
      const { data: items, error: errItems } = await supabaseClient.from('order_items').select('*').eq('po_number', poNumber);
      if (errItems) throw errItems;

      const { data: logs, error: errLogs } = await supabaseClient.from('scan_logs').select('lot_code, net_weight_kg').eq('po_number', poNumber);
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
      if (!activePO) return triggerFeedback('error'), showFeedback('⚠️ Tolong PILIH PO TARGET terlebih dahulu!', 'warning');
      if (rawBarcode) await processScan(rawBarcode);
    }
  });

  function parseHMSBarcode(snString) {
    if (!snString || snString.length !== 31) return { isValid: false, message: "Barcode harus 31 Karakter!" };
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
    if (!parsed.isValid) return triggerFeedback('error'), showFeedback(`❌ ${parsed.message}`, 'error');

    if (skuMasterMap.size > 0 && !skuMasterMap.has(parsed.lotCode)) {
      return triggerFeedback('error'), showFeedback(`⚠️ LOT [${parsed.lotCode}] BELUM TERDAFTAR di SKU Master! Contact Admin.`, 'error');
    }

    const stdNetWeight = skuMasterMap.get(parsed.lotCode) || 200.0;
    const matchedLot = poItems.find(i => i.lot_code === parsed.lotCode);
    if (!matchedLot) return triggerFeedback('error'), showFeedback(`❌ LOT ${parsed.lotCode} TIDAK ADA dalam PO ${activePO}!`, 'error');

    const scannedWeightCt = parsed.netWeight / stdNetWeight;
    const projectedCt = matchedLot.scanned_ct + scannedWeightCt;
    const maxAllowedCt = Number(matchedLot.qty_usage_ct);

    if (projectedCt > maxAllowedCt + 0.05) {
      return triggerFeedback('error'), showFeedback(`❌ OVER PICKING! LOT [${parsed.lotCode}] sudah FULFILLED (Target: ${maxAllowedCt} CT)`, 'error');
    }

    const { data: existingSNs } = await supabaseClient.from('scan_logs').select('po_number').eq('serial_number', parsed.serialNumber);

    if (existingSNs && existingSNs.length > 0) {
      const samePOScan = existingSNs.find(s => s.po_number === activePO);
      if (samePOScan) {
        return triggerFeedback('error'), showFeedback(`❌ DUPLICATE SN! Barcode [${parsed.serialNumber}] SUDAH PERNAH DI-SCAN pada PO ini (${activePO})!`, 'error');
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
      const { error } = await supabaseClient.from('scan_logs').insert([{
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

    const waMessage = 
      `${headerStatus}
      🏢 *WHID:* ${activeWHID || 'WH01'}
      📌 *PO NUMBER:* ${activePO}
      📦 *BLEND:* ${sampleItem.blend_code || '-'}

      📊 *PROGRESS OVERALL:* ${totalScannedCT.toFixed(1)} / ${totalTargetCT} CT (${pct}%)

      *BREAKDOWN LOT:*
      ${lotBreakdown}

      _Reported via RF Scanner App_`;

    navigator.clipboard.writeText(waMessage).then(() => {
      triggerFeedback('success');
      showFeedback('📋 Laporan WA berhasil di-copy ke clipboard!', 'success');
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
      const { data: logs, error } = await supabaseClient.from('scan_logs').select('id, serial_number, lot_code, net_weight_kg').eq('po_number', activePO).order('scanned_at', { ascending: false });
      if (error) throw error;
      if (logs.length === 0) return tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Belum ada item di-scan.</td></tr>';

      tbody.innerHTML = '';
      logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${log.lot_code}</strong></td>
          <td>...${log.serial_number.slice(-8)}</td>
          <td>${log.net_weight_kg} kg</td>
          <td><button class="btn btn-delete btn-sm" onclick="deleteScanLog(${log.id})">Hapus</button></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error: ${err.message}</td></tr>`;
    }
  }

  window.deleteScanLog = async function(logId) {
    if (!confirm("Yakin ingin menghapus scan item ini?")) return;
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
    if(poItems.length === 0) return tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#a0aec0;">Tidak ada LOT untuk PO ini.</td></tr>';

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

// IMAGE COMPRESSOR ENGINE (Mencegah upload lemot di gudang)
  async function compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const scaleFactor = MAX_WIDTH / img.width;
          canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
          canvas.height = img.width > MAX_WIDTH ? img.height * scaleFactor : img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.75); // Kompresi 75%
        };
      };
    });
  }

  // UPLOAD TO SUPABASE STORAGE BUCKET
  async function uploadPhotoToSupabase(file, prefix) {
    if (!file) return null;
    const compressedBlob = await compressImage(file);
    const fileName = `${prefix}_${Date.now()}.jpg`;
    const filePath = `${activePO}/${fileName}`;

    const { error } = await supabaseClient.storage.from('staging-evidence').upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
    if (error) throw error;
    
    const { data } = supabaseClient.storage.from('staging-evidence').getPublicUrl(filePath);
    return data.publicUrl;
  }

  // ---- LOGIC MONITORING STAGING ----
  btnOpenMonitoring.addEventListener('click', () => {
    if (!activePO) return;
    document.getElementById('monPoNum').innerText = activePO;
    
    // Auto-calculate Total Box & Serrico Target
    const totalTargetCT = poItems.reduce((s, i) => s + Number(i.qty_usage_ct), 0);
    document.getElementById('monTotalBox').value = totalTargetCT;
    document.getElementById('monSerricoQty').value = Math.ceil(totalTargetCT / 20); // 1 Trap per 20 Box
    
    modalMonitoring.style.display = 'flex';
  });

  btnCloseMonitoring.addEventListener('click', () => modalMonitoring.style.display = 'none');

  btnSubmitMonitoring.addEventListener('click', async () => {
    const kainMori = document.getElementById('monKainMori').value.trim();
    const photoMori = document.getElementById('photoMori').files[0];
    const photoOut = document.getElementById('photoSerricoOut').files[0];
    const photoIn = document.getElementById('photoSerricoIn').files[0];

    if (!kainMori || !photoMori || !photoOut || !photoIn) {
      return showFeedback('❌ Nomor Kain Mori dan ke-3 Foto Wajib Diisi!', 'error');
    }

    btnSubmitMonitoring.disabled = true;
    btnSubmitMonitoring.innerText = '⏳ Mengunggah Data & Foto...';

    try {
      // 1. Upload Photos
      const urlMori = await uploadPhotoToSupabase(photoMori, 'mori');
      const urlOut = await uploadPhotoToSupabase(photoOut, 'serrico_out');
      const urlIn = await uploadPhotoToSupabase(photoIn, 'serrico_in');

      // 2. Insert Database
      const { error } = await supabaseClient.from('staging_monitoring_logs').insert([{
        po_number: activePO,
        wh_id: activeWHID || 'WH01',
        nomor_kain_mori: kainMori,
        total_box: document.getElementById('monTotalBox').value,
        serrico_trap_qty: document.getElementById('monSerricoQty').value,
        photo_mori_url: urlMori,
        photo_serrico_out_url: urlOut,
        photo_serrico_in_url: urlIn,
        inspected_by: 'checker_rf1'
      }]);

      if (error) throw error;
      showFeedback('✅ Monitoring Staging Berhasil Disimpan!', 'success');
      modalMonitoring.style.display = 'none';
      
      // Reset Form
      document.getElementById('monKainMori').value = '';
      document.getElementById('photoMori').value = '';
      document.getElementById('photoSerricoOut').value = '';
      document.getElementById('photoSerricoIn').value = '';
    } catch (err) {
      showFeedback(`❌ Error Upload: ${err.message}`, 'error');
    } finally {
      btnSubmitMonitoring.disabled = false;
      btnSubmitMonitoring.innerText = '💾 Simpan Evidence Monitoring';
    }
  });

  // ---- LOGIC OUTBOUND DISPATCH ----
  btnOpenDispatch.addEventListener('click', () => {
    if (!activePO) return;
    modalDispatch.style.display = 'flex';
  });

  btnCloseDispatch.addEventListener('click', () => modalDispatch.style.display = 'none');

  btnSubmitDispatch.addEventListener('click', async () => {
    const ritNum = document.getElementById('dispRit').value.trim();
    const vehicle = document.getElementById('dispVehicle').value.trim();
    const photoBefore = document.getElementById('photoTrapBefore').files[0];
    const photoAfter = document.getElementById('photoTrapAfter').files[0];

    if (!ritNum || !vehicle || !photoBefore || !photoAfter) {
      return showFeedback('❌ Semua field RIT, Kendaraan, dan 2 Foto wajib diisi!', 'error');
    }

    btnSubmitDispatch.disabled = true;
    btnSubmitDispatch.innerText = '⏳ Memproses Loading...';

    try {
      const urlBefore = await uploadPhotoToSupabase(photoBefore, 'trap_before');
      const urlAfter = await uploadPhotoToSupabase(photoAfter, 'trap_after');
      const dispatchCode = `DISP-${Date.now()}-${ritNum.replace(/\s+/g, '')}`;

      // 1. Create Dispatch Session
      const { data: sessionData, error: errSession } = await supabaseClient
        .from('outbound_dispatch_sessions')
        .insert([{
          dispatch_code: dispatchCode,
          wh_id: activeWHID || 'WH01',
          rit_number: ritNum,
          vehicle_number: vehicle,
          eta_time: new Date().toLocaleTimeString('id-ID', { hour12: false, hour: "numeric", minute: "numeric" }),
          photo_mobile_trap_before_url: urlBefore,
          photo_mobile_trap_after_url: urlAfter
        }])
        .select()
        .single();

      if (errSession) throw errSession;

      // 2. Update Order PO menjadi Dispatched
      const { error: errOrder } = await supabaseClient
        .from('orders')
        .update({ dispatch_id: sessionData.id })
        .eq('po_number', activePO);

      if (errOrder) throw errOrder;

      showFeedback('🎉 Loading Berhasil! PO telah di-Dispatch.', 'success');
      modalDispatch.style.display = 'none';
      document.getElementById('dispRit').value = '';
      document.getElementById('dispVehicle').value = '';
    } catch (err) {
      showFeedback(`❌ Error Dispatch: ${err.message}`, 'error');
    } finally {
      btnSubmitDispatch.disabled = false;
      btnSubmitDispatch.innerText = '🚀 Selesaikan Loading & Generate Link';
    }
  });  

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

document.addEventListener('DOMContentLoaded', async () => {
  await loadSkuMaster();
  if (document.getElementById('barcodeInput')) initScannerPage();
  if (document.getElementById('dropzoneOrder') || document.getElementById('dropzoneSku')) initAdminPage();
});