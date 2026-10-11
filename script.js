// ====================================================================
// VCP-OP SCRIPT ENGINE
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
  setTimeout(() => { banner.style.display = 'none'; }, 4500);
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
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(1000, now); osc.frequency.exponentialRampToValueAtTime(1400, now + 0.1);
      gain.gain.setValueAtTime(1.0, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    } else if (type === 'warning') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(800, now + 0.15);
      gain.gain.setValueAtTime(1.0, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'error') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(140, now); osc.frequency.setValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(1.0, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.start(now); osc.stop(now + 0.6);
    }
  } catch (e) { console.log('Audio Context Error:', e); }
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
  setTimeout(() => { flashOverlay.style.display = 'none'; }, type === 'error' ? 800 : 400);
}

async function loadSkuMaster() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('vcp-op-sku_master').select('lot_code, std_net_weight_kg');
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

  async function populatePdfRitDropdown() {
    const exportRitSelect = document.getElementById('exportRitSelect');
    if (!exportRitSelect || !supabaseClient) return;

    const { data: sessions } = await supabaseClient.from('vcp-op-outbound_dispatch_sessions')
      .select('*').order('created_at', { ascending: false }).limit(30);
      
    exportRitSelect.innerHTML = '<option value="">-- PILIH SESI LOADING TRUK / RIT --</option>';
    if (sessions) {
      sessions.forEach(sess => {
        const opt = document.createElement('option');
        opt.value = sess.id;
        opt.innerText = `${sess.dispatch_date} | ${sess.rit_number} (${sess.vehicle_number})`;
        exportRitSelect.appendChild(opt);
      });
    }
  }

  if (btnDownloadSkuTemplate) btnDownloadSkuTemplate.addEventListener('click', downloadSkuTemplate);
  if (btnDownloadOrderTemplate) btnDownloadOrderTemplate.addEventListener('click', downloadOrderTemplate);

  if (dropzoneSku && fileInputSku) {
    dropzoneSku.addEventListener('click', () => fileInputSku.click());
    fileInputSku.addEventListener('change', (e) => { if (e.target.files.length) handleSkuFileSelect(e.target.files[0]); });
  }

  if (dropzoneOrder && fileInputOrder) {
    dropzoneOrder.addEventListener('click', () => fileInputOrder.click());
    fileInputOrder.addEventListener('change', (e) => { if (e.target.files.length) handleOrderFileSelect(e.target.files[0]); });
  }

  if (btnSaveSkuMaster) btnSaveSkuMaster.addEventListener('click', saveSkuMasterToDb);
  if (btnSaveToDb) btnSaveToDb.addEventListener('click', saveToSupabase);
  if (btnRefresh) btnRefresh.addEventListener('click', loadMasterData);
  if (btnExportLogs) btnExportLogs.addEventListener('click', exportScanLogsToExcel);
  if (btnGeneratePdf) btnGeneratePdf.addEventListener('click', () => {
    const exportRitSelect = document.getElementById('exportRitSelect');
    if (!exportRitSelect || !exportRitSelect.value) return showFeedback('❌ Pilih Sesi RIT Outbound terlebih dahulu!', 'warning');
    generateOutboundPdfReport(exportRitSelect.value);
  });

  // Toggle Manual Input PO Admin
  const btnToggleManualAdmin = document.getElementById('btnToggleManualAdmin');
  const exportPoSelect = document.getElementById('exportPoSelect');
  const manualPoInputAdmin = document.getElementById('manualPoInputAdmin');
  let isManualAdminMode = false;

  if (btnToggleManualAdmin) {
    btnToggleManualAdmin.addEventListener('click', () => {
      isManualAdminMode = !isManualAdminMode;
      if (isManualAdminMode) {
        exportPoSelect.style.display = 'none'; 
        manualPoInputAdmin.style.display = 'block';
        btnToggleManualAdmin.innerText = 'Gunakan Dropdown'; 
        manualPoInputAdmin.focus();
      } else {
        exportPoSelect.style.display = 'block'; 
        manualPoInputAdmin.style.display = 'none';
        btnToggleManualAdmin.innerText = 'Input Manual PO?';
      }
    });
  }

  initExportPicker();
  loadMasterData();
  populateExportPODropdown();
  populatePdfRitDropdown();
}

function downloadSkuTemplate() {
  const sampleSkuData = [ { lot_code: 'LB2370', std_net_weight_kg: 180 }, { lot_code: 'LB2625', std_net_weight_kg: 200 } ];
  const worksheet = XLSX.utils.json_to_sheet(sampleSkuData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SKU Master");
  XLSX.writeFile(workbook, "Template_SKU_Master.xlsx");
}

function downloadOrderTemplate() {
  const sampleOrderData = [
    { wh_id: 'WH01', po_number: '101412213', lot_code: 'LB8333', qty_usage_ct: 10, arrival_date: '2026-09-08', arrival_time: '06:00', blend_code: 'AA60R' }
  ];
  const worksheet = XLSX.utils.json_to_sheet(sampleOrderData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Order Import");
  XLSX.writeFile(workbook, "Template_Order_HMS.xlsx");
}

function handleSkuFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      if (rawRows.length === 0) return showFeedback('❌ File SKU Master kosong!', 'error');
      processSkuMasterRows(rawRows);
    } catch (err) { showFeedback(`❌ Gagal membaca file SKU: ${err.message}`, 'error'); }
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
    if (lotCode) parsedSkuData.push({ lot_code: lotCode, std_net_weight_kg: netWeight });
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
}

async function saveSkuMasterToDb() {
  if (parsedSkuData.length === 0 || !supabaseClient) return;
  const btnSaveSkuMaster = document.getElementById('btnSaveSkuMaster');
  btnSaveSkuMaster.disabled = true;
  try {
    const { error } = await supabaseClient.from('vcp-op-sku_master').upsert(parsedSkuData, { onConflict: 'lot_code' });
    if (error) throw error;
    showFeedback('🎉 SKU Master berhasil diperbarui!', 'success');
    await loadSkuMaster();
    document.getElementById('previewSkuArea').style.display = 'none';
    btnSaveSkuMaster.style.display = 'none';
    if (parsedOrderData.length > 0) renderPreviewOrderTable();
  } catch (err) { showFeedback(`❌ Gagal simpan SKU: ${err.message}`, 'error');
  } finally { btnSaveSkuMaster.disabled = false; }
}

function handleOrderFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      if (rawRows.length === 0) return showFeedback('❌ File Order kosong!', 'error');
      processExcelRows(rawRows);
    } catch (err) { showFeedback(`❌ Gagal membaca file Order: ${err.message}`, 'error'); }
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
    const rawTime = getVal(['arrival_time', 'time', 'jam', 'rit', 'ritase']);
    
    const arrivalDate = parseExcelDate(rawDate);
    const arrivalTime = parseExcelTime(rawTime) || '06:00';

    if (poNumber && lotCode) {
      const compositeKey = `${poNumber}___${arrivalTime}___${lotCode}`;
      if (aggregatedMap.has(compositeKey)) {
        const existing = aggregatedMap.get(compositeKey);
        existing.qty_usage_ct += qtyUsage;
        existing.qty_spare_ct += qtyUsage;
      } else {
        aggregatedMap.set(compositeKey, {
          wh_id: whId, po_number: poNumber, blend_code: blendCode, lot_code: lotCode, 
          qty_usage_ct: qtyUsage, qty_spare_ct: qtyUsage, uom: 'CT',
          arrival_date: arrivalDate, arrival_time: arrivalTime
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

  document.getElementById('draftCount').innerText = parsedOrderData.length;
  document.getElementById('previewArea').style.display = 'block';

  const btnSaveToDb = document.getElementById('btnSaveToDb');
  if (missingSkus.size > 0) {
    const unregList = Array.from(missingSkus).join(', ');
    showFeedback(`❌ ORDER DITOLAK! ${missingSkus.size} SKU belum terdaftar: [${unregList}]. Harap upload SKU Master terlebih dahulu!`, 'error');
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
      const key = `${item.po_number}___${item.arrival_time}`;
      if (!uniqueOrdersMap.has(key)) {
        uniqueOrdersMap.set(key, {
          po_number: item.po_number,
          arrival_time: item.arrival_time,
          wh_id: item.wh_id,
          blend_code: item.blend_code,
          arrival_date: item.arrival_date
        });
      }
    });

    const ordersHeaderList = Array.from(uniqueOrdersMap.values());
    const { error: errOrders } = await supabaseClient.from('vcp-op-orders').upsert(ordersHeaderList, { onConflict: 'po_number, arrival_time' });
    if (errOrders) throw errOrders;

    // Delete existing items for the specific PO + Arrival Time being re-uploaded
    for (let header of ordersHeaderList) {
      await supabaseClient.from('vcp-op-order_items')
        .delete()
        .eq('po_number', header.po_number)
        .eq('arrival_time', header.arrival_time);
    }

    const orderItemsList = parsedOrderData.map(item => ({
      po_number: item.po_number,
      arrival_time: item.arrival_time,
      blend_code: item.blend_code,
      lot_code: item.lot_code,
      qty_usage_ct: item.qty_usage_ct,
      qty_spare_ct: item.qty_spare_ct,
      uom: item.uom
    }));

    const { error: errItems } = await supabaseClient.from('vcp-op-order_items').insert(orderItemsList);
    if (errItems) throw errItems;

    showFeedback('🎉 ORDER BERHASIL DISIMPAN KE DATABASE!', 'success');
    parsedOrderData = [];
    document.getElementById('previewArea').style.display = 'none';
    btnSaveToDb.style.display = 'none';

    await loadMasterData();
    await populateExportPODropdown();
  } catch (err) {
    showFeedback(`❌ Gagal menyimpan Order: ${err.message}`, 'error');
  } finally { btnSaveToDb.disabled = false; }
}

// --- STATE & ELEMEN FILTER ADMIN ---
  let adminMasterOrders = [];
  let adminItemsData = [];
  const adminWhSelect = document.getElementById('adminWhSelect');
  const adminDateSelect = document.getElementById('adminDateSelect');
  const adminRitSelect = document.getElementById('adminRitSelect');
  const btnBulkDelete = document.getElementById('btnBulkDelete');

  async function loadMasterData() {
    const masterPoTbody = document.getElementById('masterPoTbody');
    if (!masterPoTbody || !supabaseClient) return;
    masterPoTbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading data master...</td></tr>';
    
    try {
      const { data: orders, error: errOrders } = await supabaseClient.from('vcp-op-orders').select('*').order('arrival_date', { ascending: false });
      if (errOrders) throw errOrders;

      const { data: items, error: errItems } = await supabaseClient.from('vcp-op-order_items').select('po_number, arrival_time');
      if (errItems) throw errItems;

      adminMasterOrders = orders || [];
      adminItemsData = items || [];
      
      populateAdminFilters();
      renderMasterTable();
    } catch (err) { masterPoTbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`; }
  }

  function populateAdminFilters() {
    if (!adminWhSelect) return;
    const whids = [...new Set(adminMasterOrders.map(o => o.wh_id || 'WH01'))];
    const dates = [...new Set(adminMasterOrders.map(o => o.arrival_date))];
    const rits = [...new Set(adminMasterOrders.map(o => o.arrival_time))];

    adminWhSelect.innerHTML = '<option value="ALL">-- SEMUA WHID --</option>';
    whids.forEach(w => adminWhSelect.innerHTML += `<option value="${w}">${w}</option>`);

    adminDateSelect.innerHTML = '<option value="ALL">-- SEMUA TGL --</option>';
    dates.forEach(d => adminDateSelect.innerHTML += `<option value="${d}">${d}</option>`);

    adminRitSelect.innerHTML = '<option value="ALL">-- SEMUA RIT --</option>';
    rits.forEach(r => adminRitSelect.innerHTML += `<option value="${r}">${r}</option>`);
  }

  // Event Listener Filter Admin
  if(adminWhSelect) adminWhSelect.addEventListener('change', renderMasterTable);
  if(adminDateSelect) adminDateSelect.addEventListener('change', renderMasterTable);
  if(adminRitSelect) adminRitSelect.addEventListener('change', renderMasterTable);

  function renderMasterTable() {
    const masterPoTbody = document.getElementById('masterPoTbody');
    if (!masterPoTbody) return;

    let filtered = adminMasterOrders;
    if (adminWhSelect.value !== 'ALL') filtered = filtered.filter(o => o.wh_id === adminWhSelect.value);
    if (adminDateSelect.value !== 'ALL') filtered = filtered.filter(o => o.arrival_date === adminDateSelect.value);
    if (adminRitSelect.value !== 'ALL') filtered = filtered.filter(o => o.arrival_time === adminRitSelect.value);

    if (filtered.length === 0) return masterPoTbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Tidak ada data sesuai filter.</td></tr>';
    
    masterPoTbody.innerHTML = '';
    filtered.forEach(po => {
      const lotCount = adminItemsData.filter(i => i.po_number === po.po_number && i.arrival_time === po.arrival_time).length;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${po.wh_id || 'WH01'}</strong></td>
        <td><strong>${po.po_number}</strong></td>
        <td>${po.blend_code || '-'}</td>
        <td>${po.arrival_date || '-'}</td>
        <td>${po.arrival_time || '-'}</td>
        <td><strong>${lotCount} LOT</strong></td>
        <td><button class="btn btn-danger btn-sm" onclick="deletePO('${po.po_number}', '${po.arrival_time}')">Hapus 1 PO</button></td>
      `;
      masterPoTbody.appendChild(tr);
    });
  }

  // LOGIKA HAPUS 1 PO (Bersih Sampai ke Akar)
  window.deletePO = async function(poNumber, arrivalTime) {
    if (!confirm(`Yakin ingin menghapus PO [${poNumber}] (RIT: ${arrivalTime}) beserta seluruh LOT terkait?`)) return;
    try {
      await supabaseClient.from('vcp-op-scan_logs').delete().eq('po_number', poNumber).eq('arrival_time', arrivalTime);
      await supabaseClient.from('vcp-op-staging_monitoring_logs').delete().eq('po_number', poNumber).eq('arrival_time', arrivalTime);
      await supabaseClient.from('vcp-op-order_items').delete().eq('po_number', poNumber).eq('arrival_time', arrivalTime);
      const { error } = await supabaseClient.from('vcp-op-orders').delete().eq('po_number', poNumber).eq('arrival_time', arrivalTime);
      
      if (error) throw error;
      showFeedback(`🗑️ PO [${poNumber}] berhasil dihapus utuh!`, 'success');
      await loadMasterData();
      await populateExportPODropdown();
    } catch (err) { showFeedback(`❌ Delete error: ${err.message}`, 'error'); }
  };

  // LOGIKA HAPUS MASSAL (BULK DELETE) BERDASARKAN FILTER
  if(btnBulkDelete) {
    btnBulkDelete.addEventListener('click', async () => {
      let toDelete = adminMasterOrders;
      if (adminWhSelect.value !== 'ALL') toDelete = toDelete.filter(o => o.wh_id === adminWhSelect.value);
      if (adminDateSelect.value !== 'ALL') toDelete = toDelete.filter(o => o.arrival_date === adminDateSelect.value);
      if (adminRitSelect.value !== 'ALL') toDelete = toDelete.filter(o => o.arrival_time === adminRitSelect.value);

      if(toDelete.length === 0) return showFeedback('⚠️ Tidak ada data untuk dihapus dengan filter ini.', 'warning');
      if(adminWhSelect.value === 'ALL' && adminDateSelect.value === 'ALL' && adminRitSelect.value === 'ALL') {
        if(!confirm('PERINGATAN! Anda akan menghapus SELURUH DATABASE. Lanjutkan?')) return;
      } else {
        if(!confirm(`Yakin ingin menghapus ${toDelete.length} PO secara massal beserta semua logs/fotonya?`)) return;
      }

      showFeedback('⏳ Sedang menghapus data secara massal...', 'warning');
      try {
        const poList = toDelete.map(o => o.po_number);
        // Hapus paksa semuanya dari child ke parent
        await supabaseClient.from('vcp-op-scan_logs').delete().in('po_number', poList);
        await supabaseClient.from('vcp-op-staging_monitoring_logs').delete().in('po_number', poList);
        await supabaseClient.from('vcp-op-order_items').delete().in('po_number', poList);
        const { error } = await supabaseClient.from('vcp-op-orders').delete().in('po_number', poList);

        if (error) throw error;
        showFeedback(`🗑️ ${toDelete.length} Data PO berhasil dihapus massal!`, 'success');
        await loadMasterData();
        await populateExportPODropdown();
      } catch(err) { showFeedback(`❌ Error Hapus Massal: ${err.message}`, 'error'); }
    });
  }

// ---------- Export picker: pilih banyak PO, filter per tanggal / RIT ----------
let exportOrders = [];
let exportSelected = new Set();
const exportKey = o => `${o.po_number}___${o.arrival_time}`;

function exportVisibleOrders() {
  const d = document.getElementById('exportDateSelect').value;
  const r = document.getElementById('exportRitFilter').value;
  return exportOrders.filter(o => (!d || o.arrival_date === d) && (!r || o.arrival_time === r));
}

function refreshExportRitOptions() {
  const d = document.getElementById('exportDateSelect').value;
  const times = [...new Set(exportOrders.filter(o => !d || o.arrival_date === d).map(o => o.arrival_time))].sort();
  document.getElementById('exportRitFilter').innerHTML =
    '<option value="">Semua RIT</option>' + times.map(t => `<option value="${t}">${t}</option>`).join('');
}

function updateExportCount(visible = exportVisibleOrders()) {
  document.getElementById('exportPoAll').checked = visible.length > 0 && visible.every(o => exportSelected.has(exportKey(o)));
  document.getElementById('exportPoCount').innerText = `${exportSelected.size} dari ${exportOrders.length} dipilih`;
}

function renderExportPoList() {
  const list = document.getElementById('exportPoList');
  const visible = exportVisibleOrders();
  list.innerHTML = visible.length
    ? visible.map(o => `<label class="po-item"><input type="checkbox" data-key="${exportKey(o)}" ${exportSelected.has(exportKey(o)) ? 'checked' : ''}><span class="po-main">${o.po_number}</span><span class="po-meta">${o.arrival_date} &middot; ${o.arrival_time} &middot; ${o.blend_code || '-'}</span></label>`).join('')
    : '<div class="po-empty">Tidak ada PO untuk filter ini.</div>';
  updateExportCount(visible);
}

// Saat filter tanggal/RIT berubah: otomatis centang semua PO yang tampil
function selectVisibleExport() {
  exportSelected = new Set(exportVisibleOrders().map(exportKey));
  renderExportPoList();
}

async function populateExportPODropdown() {
  if (!document.getElementById('exportPoList') || !supabaseClient) return;
  const { data } = await supabaseClient.from('vcp-op-orders')
    .select('po_number, wh_id, blend_code, arrival_date, arrival_time')
    .order('arrival_date', { ascending: false }).order('arrival_time', { ascending: true });
  exportOrders = data || [];
  const dates = [...new Set(exportOrders.map(o => o.arrival_date))];
  document.getElementById('exportDateSelect').innerHTML =
    '<option value="">Semua tanggal</option>' + dates.map(d => `<option value="${d}">${d}</option>`).join('');
  refreshExportRitOptions();
  selectVisibleExport();
}

function initExportPicker() {
  const dateSel = document.getElementById('exportDateSelect');
  const ritSel = document.getElementById('exportRitFilter');
  const allBox = document.getElementById('exportPoAll');
  const list = document.getElementById('exportPoList');
  if (!dateSel || !ritSel || !allBox || !list) return;

  dateSel.addEventListener('change', () => { refreshExportRitOptions(); selectVisibleExport(); });
  ritSel.addEventListener('change', selectVisibleExport);
  allBox.addEventListener('change', () => {
    exportVisibleOrders().forEach(o => allBox.checked ? exportSelected.add(exportKey(o)) : exportSelected.delete(exportKey(o)));
    renderExportPoList();
  });
  list.addEventListener('change', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    e.target.checked ? exportSelected.add(k) : exportSelected.delete(k);
    updateExportCount();
  });
}

async function exportScanLogsToExcel() {
  if (!supabaseClient) return;
  
  const manualInput = document.getElementById('manualPoInputAdmin');
  const isManual = manualInput && manualInput.style.display === 'block';
  let selectedPO = 'ALL';
  let poList = null;

  // Cek apakah Admin menggunakan Input Manual atau Dropdown
  if (isManual) {
    selectedPO = manualInput.value.trim();
    if (!selectedPO) return showFeedback('⚠️ Ketik atau Scan Nomor PO terlebih dahulu!', 'warning');
  } else {
    if (exportSelected.size === 0) return showFeedback('⚠️ Pilih minimal 1 PO untuk di-export.', 'warning');
    const keys = [...exportSelected];
    poList = [...new Set(keys.map(k => k.split('___')[0]))];
    selectedPO = keys.length === exportOrders.length ? 'ALL' : (poList.length === 1 ? poList[0] : `Multi_${keys.length}PO`);
  }

  showFeedback('⏳ Mengambil data scan log...', 'warning');

  try {
    let query = supabaseClient.from('vcp-op-scan_logs').select('*').order('scanned_at', { ascending: false });
    if (isManual) query = query.eq('po_number', selectedPO);
    else if (selectedPO !== 'ALL') query = query.in('po_number', poList);
    const { data: rawLogs, error } = await query;
    if (error) throw error;
    // Saring per pasangan PO + RIT sesuai centang (PO yang sama bisa punya RIT berbeda)
    const logs = (isManual || selectedPO === 'ALL') ? rawLogs : (rawLogs || []).filter(l => exportSelected.has(`${l.po_number}___${l.arrival_time}`));
    if (!logs || logs.length === 0) return showFeedback('⚠️ Tidak ada data scan untuk di-export.', 'warning');

    const formattedData = logs.map((item, index) => ({
      'No': index + 1,
      'PO Number': item.po_number,
      'Arrival Date': (exportOrders.find(o => o.po_number === item.po_number && o.arrival_time === item.arrival_time) || {}).arrival_date || '-',
      'Arrival Time (RIT)': item.arrival_time,
      'Serial Number': item.serial_number,
      'LOT Code': item.lot_code,
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
  } catch (err) { showFeedback(`❌ Error Export: ${err.message}`, 'error'); }
}

async function generateOutboundPdfReport(dispatchId) {
  showFeedback('⏳ Generating PDF Report...', 'warning');
  try {
    const { data: session, error: errSession } = await supabaseClient
      .from('vcp-op-outbound_dispatch_sessions').select('*').eq('id', dispatchId).single();
    if (errSession || !session) throw new Error('Data sesi Loading Truk tidak ditemukan.');

    const { data: orders, error: errOrders } = await supabaseClient
      .from('vcp-op-orders')
      .select('*, "vcp-op-staging_monitoring_logs"(*)')
      .eq('dispatch_id', dispatchId);
      
    if (errOrders || !orders || orders.length === 0) throw new Error('Tidak ada PO di dalam RIT ini.');

    let rowsHtml = '';
    orders.forEach(po => {
      const logsArray = po["vcp-op-staging_monitoring_logs"];
      const log = logsArray && logsArray.length > 0 ? logsArray[logsArray.length - 1] : {};
      
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
          <td style="background-color: #fef08a;">-</td>
          <td>${po.wh_id || 'WH01'}</td>
          <td>${log.inspection_date || ''}<br>${log.inspection_time || ''}</td>
        </tr>`;
    });

    const reportElement = document.createElement('div');
    reportElement.id = 'pdfReportTemplate';
    reportElement.innerHTML = `
      <style>
        #pdfReportTemplate { font-family: Arial, sans-serif; padding: 15px; color: #1e293b; font-size: 10px; }
        .report-header { border-bottom: 2px solid #1e3a8a; padding-bottom: 6px; margin-bottom: 10px; }
        .report-title { font-size: 14px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; }
        .report-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 4px; text-align: center; vertical-align: middle; }
        .report-table th { background-color: #f1f5f9; font-weight: bold; }
        .pdf-img { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc; }
      </style>
      
      <div class="report-header">
        <div class="report-title">Evidence Monitoring Outbound | ${session.dispatch_date} | ${session.rit_number}</div>
        <div style="background-color: #fef08a; padding: 6px; margin-top:6px; font-weight:bold; display:inline-block; border-radius:4px;">
           Berikut Evidence Monitoring untuk pengiriman RRP pada ${session.dispatch_date} ${session.rit_number} ETA ${session.eta_time || '06:00'}
        </div>
      </div>
      
      <table class="report-table">
        <thead>
          <tr><th colspan="11" style="background-color: #3b82f6; color: white;">MONITORING MATERIAL (STAGING)</th></tr>
          <tr><th>PO Number</th><th>Kain Mori</th><th>Serrico Luar</th><th>Serrico Dalam</th><th>No. Mori</th><th>Total Box</th><th>Serrico Qty</th><th>Status</th><th>Keterangan</th><th>WHID</th><th>Jam Mon.</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div style="margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 10px;">
        <strong style="font-size: 11px;">FOTO EVIDENCE MOBILE TRAP DALAM UNIT (${session.rit_number} - ${session.vehicle_number || 'Truk'}):</strong>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 8px;">
          <div style="text-align:center;">
            <img src="${session.photo_trap_out_before_url || ''}" style="width: 160px; height: 120px; object-fit: cover; border-radius:6px; border:1px solid #999;" onerror="this.style.display='none'"/><br>
            <small><b>Luar (Before Loading)</b></small>
          </div>
          <div style="text-align:center;">
            <img src="${session.photo_trap_in_before_url || ''}" style="width: 160px; height: 120px; object-fit: cover; border-radius:6px; border:1px solid #999;" onerror="this.style.display='none'"/><br>
            <small><b>Dalam (Before Loading)</b></small>
          </div>
          <div style="text-align:center;">
            <img src="${session.photo_trap_out_after_url || ''}" style="width: 160px; height: 120px; object-fit: cover; border-radius:6px; border:1px solid #999;" onerror="this.style.display='none'"/><br>
            <small><b>Luar (After Loading)</b></small>
          </div>
          <div style="text-align:center;">
            <img src="${session.photo_trap_in_after_url || ''}" style="width: 160px; height: 120px; object-fit: cover; border-radius:6px; border:1px solid #999;" onerror="this.style.display='none'"/><br>
            <small><b>Dalam (After Loading)</b></small>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(reportElement);
    const opt = {
      margin: 0.3,
      filename: `Evidence_Report_${session.rit_number.replace(/\s+/g, '_')}_${session.dispatch_date}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    await html2pdf().set(opt).from(reportElement).save();
    document.body.removeChild(reportElement);
    showFeedback('🎉 PDF Evidence Report berhasil di-download!', 'success');
  } catch (err) { showFeedback(`❌ Gagal generate PDF: ${err.message}`, 'error'); }
}

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

  const tabPicking = document.getElementById('tabPicking');
  const tabLoading = document.getElementById('tabLoading');
  const viewPicking = document.getElementById('viewPicking');
  const viewLoading = document.getElementById('viewLoading');
  
  const loadDateSelect = document.getElementById('loadDateSelect');
  const loadRitSelect = document.getElementById('loadRitSelect');
  const barcodeInputLoad = document.getElementById('barcodeInputLoad');
  const btnOpenDispatchNew = document.getElementById('btnOpenDispatchNew');
  
  let activeLoadDate = null;
  let activeLoadRIT = null;
  let currentLoadLogs = []; // Data scan logs untuk divalidasi

  fetchAllOrders();
  keepInputFocused();

  tabPicking.addEventListener('click', () => {
    tabPicking.classList.add('active'); tabLoading.classList.remove('active');
    viewPicking.style.display = 'block'; viewLoading.style.display = 'none';
    barcodeInput.focus();
  });

  tabLoading.addEventListener('click', () => {
    tabLoading.classList.add('active'); tabPicking.classList.remove('active');
    viewLoading.style.display = 'block'; viewPicking.style.display = 'none';
    populateLoadDates();
  });

  function populateLoadDates() {
    loadDateSelect.innerHTML = '<option value="">- Date -</option>';
    const dates = [...new Set(allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID).map(i => i.arrival_date))];
    dates.forEach(d => {
      const opt = document.createElement('option'); opt.value = d; opt.innerText = d;
      loadDateSelect.appendChild(opt);
    });
  }

  loadDateSelect.addEventListener('change', () => {
    activeLoadDate = loadDateSelect.value;
    loadRitSelect.innerHTML = '<option value="">- RIT -</option>';
    loadRitSelect.disabled = !activeLoadDate;
    document.getElementById('loadingPanel').style.display = 'none';
    
    if (!activeLoadDate) return;
    const rits = [...new Set(allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID && i.arrival_date === activeLoadDate).map(i => i.arrival_time))];
    rits.forEach(r => {
      const opt = document.createElement('option'); opt.value = r; opt.innerText = r;
      loadRitSelect.appendChild(opt);
    });
  });

  loadRitSelect.addEventListener('change', async () => {
    activeLoadRIT = loadRitSelect.value;
    if (!activeLoadRIT) {
      document.getElementById('loadingPanel').style.display = 'none';
      return;
    }
    await fetchLoadingData();
  });

  async function fetchLoadingData() {
    showFeedback('⏳ Memuat data staging RIT...', 'warning');
    document.getElementById('loadingPanel').style.display = 'block';
    barcodeInputLoad.focus();
    
    try {
      // Ambil seluruh box yang pernah di-scan di PO pada Tanggal & RIT ini
      const poList = allOrdersData.filter(i => i.arrival_date === activeLoadDate && i.arrival_time === activeLoadRIT).map(i => i.po_number);
      
      const { data, error } = await supabaseClient.from('vcp-op-scan_logs')
        .select('id, serial_number, is_loaded, net_weight_kg')
        .eq('arrival_time', activeLoadRIT)
        .in('po_number', poList);
        
      if (error) throw error;
      currentLoadLogs = data || [];
      renderLoadingProgress();
    } catch (err) {
      showFeedback(`❌ Error loading data: ${err.message}`, 'error');
    }
  }

  function renderLoadingProgress() {
    const totalBox = currentLoadLogs.length;
    const loadedBox = currentLoadLogs.filter(b => b.is_loaded).length;
    
    document.getElementById('lblTotalToLoad').innerText = `${totalBox} Box`;
    document.getElementById('lblTotalLoaded').innerText = `${loadedBox} Box`;
    
    const pct = totalBox > 0 ? Math.round((loadedBox / totalBox) * 100) : 0;
    document.getElementById('loadProgressBar').style.width = `${pct}%`;
    document.getElementById('loadProgressBar').style.backgroundColor = pct >= 100 ? '#38a169' : '#dd6b20';
    
    // Syarat Validasi: Jika semua box sudah is_loaded = TRUE, tombol 4 Foto TRUK akan menyala
    btnOpenDispatchNew.disabled = (totalBox === 0 || loadedBox < totalBox);
  }

  // --- SCAN-TO-LOAD VALIDATOR ---
  barcodeInputLoad.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const rawBarcode = barcodeInputLoad.value.trim();
      barcodeInputLoad.value = '';
      if (!rawBarcode) return;

      const parsed = parseHMSBarcode(rawBarcode);
      if (!parsed.isValid) return triggerFeedback('error'), showFeedback(`❌ ${parsed.message}`, 'error');

      // Cek apakah Serial Number ini masuk dalam daftar Staging RIT ini
      const matchedBox = currentLoadLogs.find(b => b.serial_number === parsed.serialNumber);
      
      if (!matchedBox) {
        triggerFeedback('error');
        return showFeedback(`❌ SALAH BARANG! Box ${parsed.serialNumber} BUKAN milik RIT ini / Belum di-Picking!`, 'error');
      }

      if (matchedBox.is_loaded) {
        triggerFeedback('warning');
        return showFeedback(`⚠️ DUPLIKAT! Box ini SUDAH tervalidasi masuk truk.`, 'warning');
      }

      // Jika cocok dan belum di-load -> Update DB
      try {
        const checkerName = checkerNameInput ? checkerNameInput.value.trim() || 'anon' : 'anon';
        const { error } = await supabaseClient.from('vcp-op-scan_logs')
          .update({ is_loaded: true, loaded_at: new Date().toISOString(), loaded_by: checkerName })
          .eq('id', matchedBox.id);

        if (error) throw error;
        
        matchedBox.is_loaded = true; // Update state lokal
        triggerFeedback('success');
        showFeedback(`✅ VALID! Box Masuk Truk.`, 'success');
        renderLoadingProgress();
      } catch (err) {
        showFeedback(`❌ Gagal update status: ${err.message}`, 'error');
      }
    }
  });

  // Keyboard virtual disembunyikan default (scanner hardware); tombol ini untuk ketik manual
  const btnKeyboard = document.getElementById('btnKeyboard');
  if (btnKeyboard) btnKeyboard.addEventListener('click', () => {
    const hidden = barcodeInput.getAttribute('inputmode') === 'none';
    barcodeInput.setAttribute('inputmode', hidden ? 'text' : 'none');
    btnKeyboard.classList.toggle('is-on', hidden);
    barcodeInput.blur(); barcodeInput.focus();
  });

  function keepInputFocused() {
    document.body.addEventListener('click', (e) => {
      if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') barcodeInput.focus();
    });
  }

  function getISOWeek(dateString) {
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return `Week ${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)} (${d.getFullYear()})`;
  }

  async function fetchAllOrders() {
    try {
      const { data, error } = await supabaseClient.from('vcp-op-orders').select('*').order('arrival_date', { ascending: true });
      if (error) throw error;
      allOrdersData = data || [];
      populateWHIDDropdown();
    } catch (err) { showFeedback(`Gagal load PO: ${err.message}`, 'error'); }
  }

  function populateWHIDDropdown() {
    const whList = [...new Set(allOrdersData.map(item => item.wh_id || 'WH01'))];
    whSelect.innerHTML = '<option value="">-- Pilih WHID --</option>';
    whList.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w; opt.innerText = `Warehouse: ${w}`;
      whSelect.appendChild(opt);
    });
  }

  const ritSelect = document.getElementById('ritSelect');
  const checkerNameInput = document.getElementById('checkerNameInput');
  let activeRIT = null;
  let activeDate = null;
  
  if(checkerNameInput) {
    checkerNameInput.value = localStorage.getItem('hms_checker_name') || '';
    checkerNameInput.addEventListener('change', (e) => localStorage.setItem('hms_checker_name', e.target.value.trim()) );
  }

  whSelect.addEventListener('change', () => {
    activeWHID = whSelect.value;
    weekSelect.innerHTML = '<option value="">- Week -</option>';
    dateSelect.innerHTML = '<option value="">- Date -</option>';
    ritSelect.innerHTML = '<option value="">- Pilih Jam / RIT -</option>';
    poSelect.innerHTML = '<option value="">-- Pilih PO --</option>';

    weekSelect.disabled = !activeWHID;
    dateSelect.disabled = true; ritSelect.disabled = true; poSelect.disabled = true;
    if (!activeWHID) return;

    const whFilteredOrders = allOrdersData.filter(i => (i.wh_id || 'WH01') === activeWHID);
    const weeks = [...new Set(whFilteredOrders.map(item => getISOWeek(item.arrival_date)))];
    weeks.forEach(w => {
      const opt = document.createElement('option'); opt.value = w; opt.innerText = w;
      weekSelect.appendChild(opt);
    });
  });

  weekSelect.addEventListener('change', () => {
    const selectedWeek = weekSelect.value;
    dateSelect.innerHTML = '<option value="">- Date -</option>';
    dateSelect.disabled = !selectedWeek;
    if (!selectedWeek) return;

    const filteredDates = [...new Set(allOrdersData.filter(item => (item.wh_id || 'WH01') === activeWHID && getISOWeek(item.arrival_date) === selectedWeek).map(item => item.arrival_date))];
    filteredDates.forEach(d => {
      const opt = document.createElement('option'); opt.value = d; opt.innerText = d;
      dateSelect.appendChild(opt);
    });
  });

  dateSelect.addEventListener('change', () => {
    activeDate = dateSelect.value;
    ritSelect.innerHTML = '<option value="">- Pilih Jam / RIT -</option>';
    poSelect.innerHTML = '<option value="">-- Pilih Arrival Time Dahulu --</option>';
    ritSelect.disabled = !activeDate;
    poSelect.disabled = true;
    if (!activeDate) return;

    const matchedItems = allOrdersData.filter(item => (item.wh_id || 'WH01') === activeWHID && item.arrival_date === activeDate);
    const arrivalTimes = [...new Set(matchedItems.map(i => i.arrival_time || '-'))];
    arrivalTimes.forEach(time => {
      const opt = document.createElement('option'); opt.value = time; opt.innerText = time;
      ritSelect.appendChild(opt);
    });
  });

  ritSelect.addEventListener('change', () => {
    activeRIT = ritSelect.value;
    poSelect.innerHTML = '<option value="">-- Pilih Target PO --</option>';
    poSelect.disabled = !activeRIT;
    if (!activeRIT) return;

    const matchedPOs = allOrdersData.filter(item => (item.wh_id || 'WH01') === activeWHID && item.arrival_date === activeDate && (item.arrival_time || '-') === activeRIT);
    matchedPOs.forEach(po => {
      const opt = document.createElement('option');
      opt.value = po.po_number; opt.innerText = `PO: ${po.po_number} (${po.blend_code || '-'})`;
      poSelect.appendChild(opt);
    });
  });

  poSelect.addEventListener('change', async (e) => {
    activePO = e.target.value;
    await handlePOSelected(activePO);
  });

  if (btnToggleManual) {
    btnToggleManual.addEventListener('click', () => {
      isManualMode = !isManualMode;
      if (isManualMode) {
        poSelect.style.display = 'none'; manualPoInput.style.display = 'block';
        btnToggleManual.innerText = 'Gunakan Dropdown'; manualPoInput.focus();
      } else {
        poSelect.style.display = 'block'; manualPoInput.style.display = 'none';
        btnToggleManual.innerText = 'Input Manual PO?';
      }
    });
  }

  if (manualPoInput) {
    manualPoInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const val = manualPoInput.value.trim();
        if (!val) return;
        
        // 1. AUTO-DETECT RIT, TANGGAL & WHID DARI MASTER DATA
        const matchedPO = allOrdersData.find(o => o.po_number === val);
        
        if (matchedPO) {
          // Set variabel global otomatis
          activeWHID = matchedPO.wh_id || 'WH01';
          activeDate = matchedPO.arrival_date;
          activeRIT = matchedPO.arrival_time;
          activePO = matchedPO.po_number;
          
          showFeedback(`🔍 PO Ditemukan! (RIT: ${activeRIT} | Tgl: ${activeDate})`, 'success');
          
          // 2. Load PO Details
          await handlePOSelected(activePO);
          barcodeInput.focus();
        } else {
          triggerFeedback('error');
          showFeedback(`❌ PO [${val}] tidak ditemukan di Master Data! Pastikan Admin sudah import Order.`, 'error');
        }
      }
    });
  }

  async function handlePOSelected(poNumber) {
    if (!poNumber) {
      document.getElementById('poSummary').style.display = 'none';
      btnOpenLogs.style.display = 'none'; btnCopyWA.style.display = 'none';
      document.getElementById('lotTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;">Pilih PO untuk menampilkan LOT</td></tr>';
      return;
    }
    btnOpenLogs.style.display = 'inline-block'; btnCopyWA.style.display = 'inline-block';
    await fetchPODetails(poNumber);
    barcodeInput.focus();
  }

  async function fetchPODetails(poNumber) {
    try {
      const { data: items, error: errItems } = await supabaseClient.from('vcp-op-order_items')
        .select('*').eq('po_number', poNumber).eq('arrival_time', activeRIT);
      if (errItems) throw errItems;

      const { data: logs, error: errLogs } = await supabaseClient.from('vcp-op-scan_logs')
        .select('lot_code, net_weight_kg').eq('po_number', poNumber).eq('arrival_time', activeRIT);
      if (errLogs) throw errLogs;

      const poHeader = allOrdersData.find(o => o.po_number === poNumber && o.arrival_time === activeRIT);

      poItems = items.map(item => {
        const lotLogs = logs.filter(l => l.lot_code === item.lot_code);
        const totalWeightScanned = lotLogs.reduce((sum, l) => sum + Number(l.net_weight_kg), 0);
        const stdWeight = skuMasterMap.get(item.lot_code) || 200.0;
        return { ...item, scanned_ct: parseFloat((totalWeightScanned / stdWeight).toFixed(2)) };
      });

      renderPOSummary(poHeader, poItems[0]);
      renderLotTable();
    } catch (err) { showFeedback(`Error fetching PO details: ${err.message}`, 'error'); }
  }

  barcodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const rawBarcode = barcodeInput.value.trim(); barcodeInput.value = '';
      if (!activePO) return triggerFeedback('error'), showFeedback('⚠️ Tolong PILIH PO TARGET terlebih dahulu!', 'warning');
      if (rawBarcode) await processScan(rawBarcode);
    }
  });

  function parseHMSBarcode(snString) {
    if (!snString || snString.length !== 31) return { isValid: false, message: "Barcode harus 31 Karakter!" };
    return {
      isValid: true, serialNumber: snString, lotCode: snString.substring(0, 6),
      pmiRunNo: snString.substring(6, 9), caseNo: snString.substring(9, 14),
      grossWeight: parseFloat(snString.substring(14, 18)) / 10,
      netWeight: parseFloat(snString.substring(18, 22)) / 10,
      moisture: parseFloat(snString.substring(22, 26)) / 100,
      gradeCode: snString.substring(26, 31)
    };
  }

  async function processScan(rawBarcode) {
    const parsed = parseHMSBarcode(rawBarcode);
    if (!parsed.isValid) return triggerFeedback('error'), showFeedback(`❌ ${parsed.message}`, 'error');

    if (skuMasterMap.size > 0 && !skuMasterMap.has(parsed.lotCode)) 
      return triggerFeedback('error'), showFeedback(`⚠️ LOT [${parsed.lotCode}] BELUM TERDAFTAR di SKU Master! Contact Admin.`, 'error');

    const matchedLot = poItems.find(i => i.lot_code === parsed.lotCode);
    if (!matchedLot) return triggerFeedback('error'), showFeedback(`❌ LOT ${parsed.lotCode} TIDAK ADA dalam PO ${activePO}!`, 'error');

    const stdNetWeight = skuMasterMap.get(parsed.lotCode) || 200.0;
    const projectedCt = matchedLot.scanned_ct + (parsed.netWeight / stdNetWeight);
    
    if (projectedCt > Number(matchedLot.qty_usage_ct) + 0.05) 
      return triggerFeedback('error'), showFeedback(`❌ OVER PICKING! LOT [${parsed.lotCode}] sudah FULFILLED!`, 'error');

    const { data: existingSNs } = await supabaseClient.from('vcp-op-scan_logs').select('po_number, arrival_time').eq('serial_number', parsed.serialNumber);
    if (existingSNs && existingSNs.length > 0) {
      const samePOScan = existingSNs.find(s => s.po_number === activePO && s.arrival_time === activeRIT);
      if (samePOScan) {
        return triggerFeedback('error'), showFeedback(`❌ DUPLICATE SN! Barcode SUDAH DI-SCAN pada PO/RIT ini!`, 'error');
      } else {
        pendingScanData = { parsed, isBypassed: true };
        triggerFeedback('warning');
        openBypassModal(`SN [${parsed.serialNumber}] SUDAH DI-SCAN di PO [${existingSNs[0].po_number}] Jam [${existingSNs[0].arrival_time}]. Tetap masukkan ke sini?`);
        return;
      }
    }
    await executeSaveScan(parsed, false);
  }

  async function executeSaveScan(parsedData, isBypassed) {
    try {
      const { error } = await supabaseClient.from('vcp-op-scan_logs').insert([{
        po_number: activePO, arrival_time: activeRIT, serial_number: parsedData.serialNumber,
        lot_code: parsedData.lotCode, pmi_run_no: parsedData.pmiRunNo, case_number: parsedData.caseNo,
        gross_weight_kg: parsedData.grossWeight, net_weight_kg: parsedData.netWeight,
        moisture: parsedData.moisture, grade_code: parsedData.gradeCode,
        is_bypassed: isBypassed, scanned_by: checkerNameInput.value.trim() || 'anon'
      }]);
      if (error) throw error;
      triggerFeedback('success'); showFeedback(`✅ [${parsedData.lotCode}] SN OK!`, 'success');
      await fetchPODetails(activePO);
    } catch (err) { triggerFeedback('error'); showFeedback(`❌ DB Save Error: ${err.message}`, 'error'); }
  }

  btnCopyWA.addEventListener('click', () => {
    if (!activePO || poItems.length === 0) return;
    const checkerName = checkerNameInput.value.trim() || 'Operator Gudang';
    const totalTargetCT = poItems.reduce((s, i) => s + Number(i.qty_usage_ct), 0);
    const totalScannedCT = poItems.reduce((s, i) => s + Number(i.scanned_ct), 0);
    const pct = totalTargetCT > 0 ? Math.round((totalScannedCT / totalTargetCT) * 100) : 0;
    
    let lotBreakdown = poItems.map(item => `  ${item.scanned_ct >= item.qty_usage_ct ? "✅" : (item.scanned_ct > 0 ? "⚠️" : "⬜")} *${item.lot_code}*: ${item.scanned_ct}/${item.qty_usage_ct} CT`).join("\n");
    const waMessage = `${totalScannedCT >= totalTargetCT ? "✅ *PO FULFILLED*" : "⏳ *PO IN-PROGRESS*"}
🏢 *WHID:* ${activeWHID || 'WH01'}
📅 *TGL:* ${activeDate || '-'} | 🕒 *RIT/JAM:* ${activeRIT || '-'}
📌 *PO NUMBER:* ${activePO}
📦 *BLEND:* ${poItems[0].blend_code || '-'}
👤 *PIC:* ${checkerName}

📊 *PROGRESS OVERALL:* ${totalScannedCT.toFixed(1)} / ${totalTargetCT} CT (${pct}%)
*BREAKDOWN LOT:*
${lotBreakdown}
_Reported via VCP-OP RF Scanner App_`;

    navigator.clipboard.writeText(waMessage).then(() => { triggerFeedback('success'); showFeedback('📋 Laporan WA di-copy!', 'success'); });
  });

  btnOpenLogs.addEventListener('click', async () => {
    if (!activePO) return;
    document.getElementById('modalPoNum').innerText = activePO;
    modalLogs.style.display = 'flex'; await loadLogsTable();
  });
  document.getElementById('btnCloseLogs').addEventListener('click', () => { modalLogs.style.display = 'none'; barcodeInput.focus(); });

  async function loadLogsTable() {
    const tbody = document.getElementById('logTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    try {
      const { data: logs, error } = await supabaseClient.from('vcp-op-scan_logs').select('id, serial_number, lot_code, net_weight_kg').eq('po_number', activePO).eq('arrival_time', activeRIT).order('scanned_at', { ascending: false });
      if (error) throw error;
      if (logs.length === 0) return tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Belum ada scan.</td></tr>';
      tbody.innerHTML = '';
      logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${log.lot_code}</strong></td><td>...${log.serial_number.slice(-8)}</td><td>${log.net_weight_kg} kg</td><td><button class="btn btn-delete btn-sm" onclick="deleteScanLog(${log.id})">Hapus</button></td>`;
        tbody.appendChild(tr);
      });
    } catch (err) { tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error: ${err.message}</td></tr>`; }
  }

  window.deleteScanLog = async function(logId) {
    if (!confirm("Yakin hapus scan item ini?")) return;
    try {
      const { error } = await supabaseClient.from('vcp-op-scan_logs').delete().eq('id', logId);
      if (error) throw error;
      triggerFeedback('success'); showFeedback('🗑️ Scan dihapus!', 'success');
      await loadLogsTable(); await fetchPODetails(activePO);
    } catch (err) { showFeedback(`❌ Error: ${err.message}`, 'error'); }
  };

  function renderPOSummary(poHeader, sampleItem) {
    if(!sampleItem) return;
    document.getElementById('poSummary').style.display = 'block';
    
    // Proteksi: Jika elemen lblWhId ada, baru diubah
    const lblWhId = document.getElementById('lblWhId');
    if (lblWhId) lblWhId.innerText = (poHeader && poHeader.wh_id) ? poHeader.wh_id : 'WH01';

    document.getElementById('lblRit').innerText = activeRIT || '-';
    document.getElementById('lblDate').innerText = activeDate || '-';
    document.getElementById('lblBlend').innerText = sampleItem.blend_code || '-';

    const totalTargetCT = poItems.reduce((s, i) => s + Number(i.qty_usage_ct), 0);
    const totalScannedCT = poItems.reduce((s, i) => s + Number(i.scanned_ct), 0);
    const pct = totalTargetCT > 0 ? Math.min(100, Math.round((totalScannedCT / totalTargetCT) * 100)) : 0;
    
    document.getElementById('lblProgressText').innerText = `${totalScannedCT.toFixed(1)} / ${totalTargetCT} CT (${pct}%)`;
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('progressBar').classList.toggle('is-complete', pct >= 100);
  }

  function renderLotTable() {
    const tbody = document.getElementById('lotTableBody');
    tbody.innerHTML = '';
    if(poItems.length === 0) return tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#a0aec0;">Tidak ada LOT</td></tr>';
    poItems.forEach(item => {
      const tr = document.createElement('tr');
      const badgeClass = item.scanned_ct >= item.qty_usage_ct ? 'badge-done' : (item.scanned_ct > 0 ? 'badge-partial' : 'badge-open');
      const statusText = item.scanned_ct >= item.qty_usage_ct ? 'DONE' : (item.scanned_ct > 0 ? 'PARTIAL' : 'OPEN');
      tr.innerHTML = `<td><strong>${item.lot_code}</strong></td><td>${item.qty_usage_ct} CT</td><td>${item.scanned_ct} CT</td><td><span class="status-badge ${badgeClass}">${statusText}</span></td>`;
      tbody.appendChild(tr);
    });
  }

  function openBypassModal(message) { document.getElementById('modalBodyText').innerText = message; modalBypass.style.display = 'flex'; }
  function closeBypassModal() { modalBypass.style.display = 'none'; pendingScanData = null; barcodeInput.focus(); }

  async function compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas'); const MAX_WIDTH = 1024; const scaleFactor = MAX_WIDTH / img.width;
          canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width; canvas.height = img.width > MAX_WIDTH ? img.height * scaleFactor : img.height;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.75);
        };
      };
    });
  }

  async function uploadPhotoToSupabase(file, prefix) {
    if (!file) return null;
    const compressedBlob = await compressImage(file);
    const fileName = `${prefix}_${Date.now()}.jpg`;
    const filePath = `${activePO}/${fileName}`;
    const { error } = await supabaseClient.storage.from('staging-evidence').upload(filePath, compressedBlob, { contentType: 'image/jpeg' });
    if (error) throw error;
    return supabaseClient.storage.from('staging-evidence').getPublicUrl(filePath).data.publicUrl;
  }

  btnOpenMonitoring.addEventListener('click', () => {
    if (!activePO) return;
    document.getElementById('monPoNum').innerText = activePO;
    const totalTargetCT = poItems.reduce((s, i) => s + Number(i.qty_usage_ct), 0);
    document.getElementById('monTotalBox').value = totalTargetCT;
    document.getElementById('monSerricoQty').value = Math.ceil(totalTargetCT / 20);
    modalMonitoring.style.display = 'flex';
  });
  btnCloseMonitoring.addEventListener('click', () => modalMonitoring.style.display = 'none');

  btnSubmitMonitoring.addEventListener('click', async () => {
    const kainMori = document.getElementById('monKainMori').value.trim();
    if (!kainMori || !document.getElementById('photoMori').files[0] || !document.getElementById('photoSerricoOut').files[0] || !document.getElementById('photoSerricoIn').files[0]) {
      return showFeedback('❌ Nomor Kain Mori dan ke-3 Foto Wajib Diisi!', 'error');
    }
    btnSubmitMonitoring.disabled = true; btnSubmitMonitoring.innerText = '⏳ Mengunggah Data...';
    try {
      const urlMori = await uploadPhotoToSupabase(document.getElementById('photoMori').files[0], 'mori');
      const urlOut = await uploadPhotoToSupabase(document.getElementById('photoSerricoOut').files[0], 'serrico_out');
      const urlIn = await uploadPhotoToSupabase(document.getElementById('photoSerricoIn').files[0], 'serrico_in');

      const { error } = await supabaseClient.from('vcp-op-staging_monitoring_logs').insert([{
        po_number: activePO, arrival_time: activeRIT, wh_id: activeWHID || 'WH01', nomor_kain_mori: kainMori,
        total_box: parseFloat(document.getElementById('monTotalBox').value) || 0, serrico_trap_qty: parseInt(document.getElementById('monSerricoQty').value) || 0,
        photo_mori_url: urlMori, photo_serrico_out_url: urlOut, photo_serrico_in_url: urlIn,
        inspected_by: checkerNameInput.value.trim() || 'anon'
      }]);
      if (error) throw error;
      showFeedback('✅ Monitoring Disimpan!', 'success');
      modalMonitoring.style.display = 'none';
      ['monKainMori','photoMori','photoSerricoOut','photoSerricoIn'].forEach(id => document.getElementById(id).value = '');
    } catch (err) { showFeedback(`❌ Error Upload: ${err.message}`, 'error'); } 
    finally { btnSubmitMonitoring.disabled = false; btnSubmitMonitoring.innerText = '💾 Simpan Evidence Monitoring'; }
  });

  // btnOpenDispatch.addEventListener('click', () => { if (!activePO) return; modalDispatch.style.display = 'flex'; });
  btnOpenDispatchNew.addEventListener('click', () => {
    modalDispatch.style.display = 'flex';
  });
  btnCloseDispatch.addEventListener('click', () => modalDispatch.style.display = 'none');

  btnSubmitDispatch.addEventListener('click', async () => {
    const ritNum = document.getElementById('dispRit').value.trim();
    const vehicle = document.getElementById('dispVehicle').value.trim();
    if (!ritNum || !vehicle || !document.getElementById('photoTrapOutBefore').files[0] || !document.getElementById('photoTrapInBefore').files[0] || !document.getElementById('photoTrapOutAfter').files[0] || !document.getElementById('photoTrapInAfter').files[0]) {
      return showFeedback('❌ Semua field dan 4 Foto wajib diisi!', 'error');
    }
    btnSubmitDispatch.disabled = true; btnSubmitDispatch.innerText = '⏳ Memproses Loading...';
    
    try {
      const urlOutBefore = await uploadPhotoToSupabase(document.getElementById('photoTrapOutBefore').files[0], 'trap_out_before');
      const urlInBefore = await uploadPhotoToSupabase(document.getElementById('photoTrapInBefore').files[0], 'trap_in_before');
      const urlOutAfter = await uploadPhotoToSupabase(document.getElementById('photoTrapOutAfter').files[0], 'trap_out_after');
      const urlInAfter = await uploadPhotoToSupabase(document.getElementById('photoTrapInAfter').files[0], 'trap_in_after');
      
      const { data: sessionData, error: errSession } = await supabaseClient.from('vcp-op-outbound_dispatch_sessions').insert([{
        dispatch_code: `DISP-${Date.now()}-${ritNum.replace(/\s+/g, '')}`,
        wh_id: activeWHID || 'WH01', rit_number: ritNum, vehicle_number: vehicle,
        eta_time: activeLoadRIT, // Gunakan activeLoadRIT dari filter
        photo_trap_out_before_url: urlOutBefore, photo_trap_in_before_url: urlInBefore, photo_trap_out_after_url: urlOutAfter, photo_trap_in_after_url: urlInAfter, created_by: checkerNameInput.value.trim() || 'anon'
      }]).select().single();
      if (errSession) throw errSession;

      // UPDATE MASSAL: Semua PO yang Arrival Date & Time nya sama dengan RIT yang sedang di-load akan ter-link ke Dispatch ID ini!
      const { error: errOrder } = await supabaseClient.from('vcp-op-orders')
        .update({ dispatch_id: sessionData.id })
        .eq('arrival_date', activeLoadDate)
        .eq('arrival_time', activeLoadRIT)
        .eq('wh_id', activeWHID || 'WH01');
        
      if (errOrder) throw errOrder;

      showFeedback('🎉 Proses Muat Truk Selesai 100%!', 'success');
      modalDispatch.style.display = 'none';
      ['dispRit','dispVehicle','photoTrapOutBefore','photoTrapInBefore','photoTrapOutAfter','photoTrapInAfter'].forEach(id => document.getElementById(id).value = '');
      
      // Auto-kembali ke tab Picking setelah loading selesai
      tabPicking.click();
    } catch (err) { showFeedback(`❌ Error Dispatch: ${err.message}`, 'error'); } 
    finally { btnSubmitDispatch.disabled = false; btnSubmitDispatch.innerText = '🚀 Selesaikan Loading'; }
  });

  document.getElementById('btnCancelScan').addEventListener('click', closeBypassModal);
  document.getElementById('btnBypassScan').addEventListener('click', async () => {
    if (pendingScanData) { const dataToSave = pendingScanData.parsed; closeBypassModal(); await executeSaveScan(dataToSave, true); }
  });
  window.addEventListener('keydown', (e) => {
    if (modalBypass.style.display === 'flex') { if (e.key === 'Enter') document.getElementById('btnBypassScan').click(); else if (e.key === 'Escape') document.getElementById('btnCancelScan').click(); }
  });
}

// ==========================================
// DASHBOARD ANALYTICS MODULE
// ==========================================
function initDashboardPage() {
  const dashWhSelect = document.getElementById('dashWhSelect');
  const dashDateSelect = document.getElementById('dashDateSelect');
  const dashRitSelect = document.getElementById('dashRitSelect');
  const btnRefreshDash = document.getElementById('btnRefreshDash');
  const btnExportDash = document.getElementById('btnExportDash');
  const dashTableBody = document.getElementById('dashTableBody');
  
  let dashDataGlobal = []; // Menyimpan raw data untuk tabel & export

  async function loadDashboardFilters() {
    try {
      const { data: orders } = await supabaseClient.from('vcp-op-orders').select('wh_id, arrival_date, arrival_time');
      if (!orders) return;

      // Populate WHID
      const whids = [...new Set(orders.map(o => o.wh_id || 'WH01'))];
      dashWhSelect.innerHTML = '<option value="ALL">-- SEMUA WAREHOUSE --</option>';
      whids.forEach(w => dashWhSelect.innerHTML += `<option value="${w}">${w}</option>`);

      // Populate Dates
      const dates = [...new Set(orders.map(o => o.arrival_date))].sort().reverse(); // Terbaru di atas
      dashDateSelect.innerHTML = '<option value="">- Loading Dates -</option>';
      dates.forEach(d => dashDateSelect.innerHTML += `<option value="${d}">${d}</option>`);
      
      // Auto-select tanggal terbaru jika ada
      if (dates.length > 0) {
        dashDateSelect.value = dates[0];
        populateRitFilter();
        fetchDashboardData();
      }
    } catch (err) {
      showFeedback(`Gagal load filter: ${err.message}`, 'error');
    }
  }

  function populateRitFilter() {
    dashRitSelect.innerHTML = '<option value="ALL">-- SEMUA RIT --</option>';
    dashRitSelect.disabled = true;
    
    if (!dashDateSelect.value) return;
    dashRitSelect.disabled = false;
    
    // Nanti akan diisi secara dinamis setelah fetchDashboardData
  }

  dashDateSelect.addEventListener('change', () => {
    populateRitFilter();
    fetchDashboardData();
  });
  
  dashWhSelect.addEventListener('change', fetchDashboardData);
  dashRitSelect.addEventListener('change', renderDashboardTable);
  btnRefreshDash.addEventListener('click', fetchDashboardData);

  async function fetchDashboardData() {
    const activeDate = dashDateSelect.value;
    const activeWh = dashWhSelect.value;
    if (!activeDate) return;

    dashTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">⏳ Mengkalkulasi Data Live...</td></tr>';
    
    try {
      // 1. Ambil Orders hari itu
      let queryOrders = supabaseClient.from('vcp-op-orders').select('*').eq('arrival_date', activeDate);
      if (activeWh !== 'ALL') queryOrders = queryOrders.eq('wh_id', activeWh);
      
      const { data: orders } = await queryOrders;
      if (!orders || orders.length === 0) {
        dashDataGlobal = [];
        return renderDashboardTable();
      }

      // Populate RIT Dropdown berdasarkan orders yang didapat
      const rits = [...new Set(orders.map(o => o.arrival_time))].sort();
      dashRitSelect.innerHTML = '<option value="ALL">-- SEMUA RIT --</option>';
      rits.forEach(r => dashRitSelect.innerHTML += `<option value="${r}">${r}</option>`);

      const poList = orders.map(o => o.po_number);

      // 2. Ambil Target Items (Qty Target)
      const { data: items } = await supabaseClient.from('vcp-op-order_items').select('*').in('po_number', poList);
      
      // 3. Ambil Scan Logs (Progress Picking & Loading)
      const { data: logs } = await supabaseClient.from('vcp-op-scan_logs').select('*').in('po_number', poList);

      // 4. Kalkulasi Data (Join & Math)
      dashDataGlobal = orders.map(po => {
        // Cari target
        const poItems = items.filter(i => i.po_number === po.po_number && i.arrival_time === po.arrival_time);
        const targetCt = poItems.reduce((sum, item) => sum + Number(item.qty_usage_ct), 0);
        
        // Cari progress dari logs
        const poLogs = logs.filter(l => l.po_number === po.po_number && l.arrival_time === po.arrival_time);
        
        let pickedCt = 0;
        let loadedCt = 0;

        // Hitung CT berdasarkan standar berat (SKU Master)
        poLogs.forEach(log => {
          const stdWeight = skuMasterMap.get(log.lot_code) || 200.0;
          const boxCt = Number(log.net_weight_kg) / stdWeight;
          pickedCt += boxCt;
          if (log.is_loaded) loadedCt += boxCt;
        });

        pickedCt = parseFloat(pickedCt.toFixed(2));
        loadedCt = parseFloat(loadedCt.toFixed(2));

        // Tentukan Status Real-Time
        let status = 'OPEN';
        let badge = 'badge-open'; // CSS class dari style.css
        
        if (loadedCt >= targetCt && targetCt > 0) {
          status = 'DISPATCHED'; badge = 'badge-done';
        } else if (pickedCt >= targetCt && targetCt > 0) {
          status = 'STAGING (Ready Load)'; badge = 'badge-partial'; // Kuning
        } else if (pickedCt > 0) {
          status = 'PICKING'; badge = 'badge-open';
        }

        return {
          po_number: po.po_number,
          wh_id: po.wh_id || 'WH01',
          rit: po.arrival_time,
          blend: po.blend_code || '-',
          target: targetCt,
          picked: pickedCt,
          loaded: loadedCt,
          status: status,
          badge: badge
        };
      });

      renderDashboardTable();

    } catch (err) {
      dashTableBody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
    }
  }

  function renderDashboardTable() {
    if (dashDataGlobal.length === 0) {
      document.getElementById('scoreTarget').innerText = '0';
      document.getElementById('scorePicked').innerText = '0';
      document.getElementById('scoreLoaded').innerText = '0';
      document.getElementById('scorePct').innerText = '0%';
      dashTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Tidak ada PO pada filter ini.</td></tr>';
      return;
    }

    const activeRit = dashRitSelect.value;
    const filteredData = activeRit === 'ALL' ? dashDataGlobal : dashDataGlobal.filter(d => d.rit === activeRit);

    let html = '';
    let sumTarget = 0, sumPicked = 0, sumLoaded = 0;

    filteredData.forEach(d => {
      sumTarget += d.target;
      sumPicked += d.picked;
      sumLoaded += d.loaded;

      html += `
        <tr>
          <td><strong>${d.po_number}</strong></td>
          <td>${d.wh_id}</td>
          <td>${d.rit}</td>
          <td>${d.blend}</td>
          <td style="font-weight:bold;">${d.target}</td>
          <td style="color: #2b6cb0; font-weight:bold;">${d.picked}</td>
          <td style="color: #c05621; font-weight:bold;">${d.loaded}</td>
          <td style="text-align:center;"><span class="status-badge ${d.badge}">${d.status}</span></td>
        </tr>
      `;
    });

    dashTableBody.innerHTML = html;

    // Update Scorecards
    document.getElementById('scoreTarget').innerText = sumTarget;
    document.getElementById('scorePicked').innerText = parseFloat(sumPicked.toFixed(1));
    document.getElementById('scoreLoaded').innerText = parseFloat(sumLoaded.toFixed(1));
    
    const pct = sumTarget > 0 ? Math.round((sumLoaded / sumTarget) * 100) : 0;
    document.getElementById('scorePct').innerText = `${pct}%`;
    document.getElementById('scorePct').style.color = pct >= 100 ? '#2f855a' : '#dd6b20';
  }

  // EXPORT TO EXCEL
  // COMPREHENSIVE EXPORT TO EXCEL (MULTI-SHEET)
  btnExportDash.addEventListener('click', async () => {
    if (dashDataGlobal.length === 0) return showFeedback('⚠️ Tidak ada data untuk diexport!', 'warning');
    showFeedback('⏳ Mengambil & Merangkum Data Master...', 'warning');
    
    const activeRit = dashRitSelect.value;
    const filteredSummary = activeRit === 'ALL' ? dashDataGlobal : dashDataGlobal.filter(d => d.rit === activeRit);
    const poList = filteredSummary.map(d => d.po_number);

    try {
      // Fetch 3 Database Referensi
      const { data: logs } = await supabaseClient.from('vcp-op-scan_logs').select('*').in('po_number', poList);
      const { data: staging } = await supabaseClient.from('vcp-op-staging_monitoring_logs').select('*').in('po_number', poList);
      
      // Ambil ID Sesi Dispatch dari data filter yang memiliki ID Truk
      const dispatchIds = [...new Set(filteredSummary.map(d => d.dispatch_id).filter(id => id))];
      let dispatches = [];
      if (dispatchIds.length > 0) {
        const { data: disp } = await supabaseClient.from('vcp-op-outbound_dispatch_sessions').select('*').in('id', dispatchIds);
        dispatches = disp || [];
      }

      const workbook = XLSX.utils.book_new();

      // SHEET 1: SUMMARY (Dari Dashboard)
      const exportSummary = filteredSummary.map((d, index) => ({
        'No': index + 1, 'PO Number': d.po_number, 'Warehouse': d.wh_id, 'RIT (Arrival)': d.rit, 'Blend': d.blend,
        'Target Qty (CT)': d.target, 'Picked (CT)': d.picked, 'Loaded (CT)': d.loaded, 'Status': d.status
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportSummary), "1. Summary PO");

      // SHEET 2: SCAN LOGS (Picking & Loading Tracking)
      const exportLogs = (logs || []).map(l => ({
        'PO Number': l.po_number, 'RIT': l.arrival_time, 'Serial Number': l.serial_number, 'LOT Code': l.lot_code,
        'Net Wt (Kg)': l.net_weight_kg, 
        'Status Picking': 'PICKED', 'Picked At': new Date(l.scanned_at).toLocaleString('id-ID'), 'Picker ID': l.scanned_by,
        'Status Loading': l.is_loaded ? 'LOADED' : 'PENDING', 
        'Loaded At': l.loaded_at ? new Date(l.loaded_at).toLocaleString('id-ID') : '-', 'Loader ID': l.loaded_by || '-'
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportLogs), "2. Box Tracking Logs");

      // SHEET 3: STAGING & EVIDENCE MONITORING
      const exportStaging = (staging || []).map(m => ({
        'PO Number': m.po_number, 'RIT': m.arrival_time, 'No. Mori': m.nomor_kain_mori,
        'Total Box Target': m.total_box, 'Serrico Qty Target': m.serrico_trap_qty,
        'Jam Inspeksi': `${m.inspection_date} ${m.inspection_time}`, 'Inspektor': m.inspected_by,
        'Link Foto Mori': m.photo_mori_url, 'Link Serrico Luar': m.photo_serrico_out_url, 'Link Serrico Dalam': m.photo_serrico_in_url
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportStaging), "3. Staging Evidence");

      // SHEET 4: DISPATCH SESSIONS (Armada Truk)
      const exportDispatch = (dispatches || []).map(d => ({
        'Dispatch ID': d.dispatch_code, 'Tgl Loading': d.dispatch_date, 'RIT Ke-': d.rit_number, 'Plat Nomor': d.vehicle_number,
        'Checker Armada': d.created_by,
        'Foto Luar (Before)': d.photo_trap_out_before_url, 'Foto Dalam (Before)': d.photo_trap_in_before_url,
        'Foto Luar (After)': d.photo_trap_out_after_url, 'Foto Dalam (After)': d.photo_trap_in_after_url
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportDispatch), "4. Armada Dispatch");

      // SIMPAN FILE KE PC USER
      const fileName = `Laporan_Lengkap_VCPOP_${dashDateSelect.value}_RIT-${activeRit.replace(':', '')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showFeedback('✅ Laporan Full Evidence berhasil diunduh!', 'success');

    } catch (err) {
      showFeedback(`❌ Gagal export detail: ${err.message}`, 'error');
    }
  });

  loadDashboardFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSkuMaster();
  if (document.getElementById('barcodeInput')) initScannerPage();
  if (document.getElementById('dropzoneOrder') || document.getElementById('dropzoneSku')) initAdminPage();
  if (document.getElementById('dashboardPage')) initDashboardPage(); // Trigger Dashboard
});