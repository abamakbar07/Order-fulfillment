// ==========================================
// 1. CONFIGURATION & STATE MANAGEMENT
// ==========================================
const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let parsedData = [];

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function showBanner(msg, type) {
  const statusBanner = document.getElementById('statusBanner');
  if (!statusBanner) return;
  statusBanner.style.display = 'block';
  statusBanner.innerText = msg;
  statusBanner.className = `banner banner-${type}`;
  setTimeout(() => {
    statusBanner.style.display = 'none';
  }, 5000);
}

// ==========================================
// 3. ADMIN MODULE (Excel/CSV & Master Data)
// ==========================================
function initAdminPage() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnSaveToDb = document.getElementById('btnSaveToDb');
  const btnRefresh = document.getElementById('btnRefresh');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.backgroundColor = '#e2e8f0'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.backgroundColor = '#ebf8ff'; });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.backgroundColor = '#ebf8ff';
      if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFileSelect(e.target.files[0]);
    });
  }

  if (btnSaveToDb) btnSaveToDb.addEventListener('click', saveToSupabase);
  if (btnRefresh) btnRefresh.addEventListener('click', loadMasterData);

  loadMasterData();
}

function handleFileSelect(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });

      if (rawRows.length === 0) {
        showBanner('❌ File kosong atau format tidak sesuai!', 'error');
        return;
      }
      processExcelRows(rawRows);
    } catch (err) {
      showBanner(`❌ Gagal membaca file: ${err.message}`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function processExcelRows(rawRows) {
  parsedData = [];

  rawRows.forEach(row => {
    const getVal = (keys) => {
      for (let k of keys) {
        const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (foundKey && row[foundKey] !== undefined) return String(row[foundKey]).trim();
      }
      return '';
    };

    const poNumber = getVal(['po_number', 'po number', 'po', 'no po']);
    const blendCode = getVal(['blend_code', 'blend code', 'blend']);
    const lotCode = getVal(['lot_code', 'lot code', 'lot']);
    const qtyUsage = parseFloat(getVal(['qty_usage_ct', 'qty usage', 'qty ct', 'qty', 'carton'])) || 1.0;
    const arrivalDate = getVal(['arrival_date', 'arrival date', 'date', 'tanggal']) || new Date().toISOString().split('T')[0];
    const arrivalTime = getVal(['arrival_time', 'arrival time', 'time', 'jam', 'rit']) || '06:00:00';

    if (poNumber && lotCode) {
      parsedData.push({
        po_number: poNumber,
        blend_code: blendCode,
        lot_code: lotCode,
        qty_usage_ct: qtyUsage,
        qty_spare_ct: qtyUsage,
        uom: 'CT',
        arrival_date: arrivalDate,
        arrival_time: arrivalTime.length === 5 ? arrivalTime + ':00' : arrivalTime
      });
    }
  });

  if (parsedData.length === 0) {
    showBanner('❌ Kolom Excel tidak terdeteksi. Pastikan ada kolom "PO Number" dan "Lot Code"', 'error');
    return;
  }

  renderPreviewTable();
  showBanner(`✅ Berhasil membaca ${parsedData.length} baris data.`, 'success');
}

function renderPreviewTable() {
  const previewTbody = document.getElementById('previewTbody');
  const draftCount = document.getElementById('draftCount');
  const previewArea = document.getElementById('previewArea');
  const btnSaveToDb = document.getElementById('btnSaveToDb');

  if (!previewTbody) return;
  previewTbody.innerHTML = '';

  parsedData.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.po_number}</strong></td>
      <td>${item.blend_code}</td>
      <td>${item.lot_code}</td>
      <td>${item.qty_usage_ct} CT</td>
      <td>${item.arrival_date}</td>
      <td>${item.arrival_time}</td>
    `;
    previewTbody.appendChild(tr);
  });

  if (draftCount) draftCount.innerText = parsedData.length;
  if (previewArea) previewArea.style.display = 'block';
  if (btnSaveToDb) btnSaveToDb.style.display = 'inline-block';
}

async function saveToSupabase() {
  if (parsedData.length === 0 || !supabaseClient) return;

  const btnSaveToDb = document.getElementById('btnSaveToDb');
  btnSaveToDb.disabled = true;
  btnSaveToDb.innerText = '⏳ Saving...';

  try {
    const uniqueOrdersMap = new Map();
    parsedData.forEach(item => {
      if (!uniqueOrdersMap.has(item.po_number)) {
        uniqueOrdersMap.set(item.po_number, {
          po_number: item.po_number,
          blend_code: item.blend_code,
          arrival_date: item.arrival_date,
          arrival_time: item.arrival_time
        });
      }
    });

    const ordersHeaderList = Array.from(uniqueOrdersMap.values());
    const { error: errOrders } = await supabaseClient.from('orders').upsert(ordersHeaderList, { onConflict: 'po_number' });
    if (errOrders) throw errOrders;

    const orderItemsList = parsedData.map(item => ({
      po_number: item.po_number,
      blend_code: item.blend_code,
      lot_code: item.lot_code,
      qty_usage_ct: item.qty_usage_ct,
      qty_spare_ct: item.qty_spare_ct,
      uom: item.uom
    }));

    const { error: errItems } = await supabaseClient.from('order_items').upsert(orderItemsList, { onConflict: 'po_number,lot_code' });
    if (errItems) throw errItems;

    showBanner('🎉 DATA BERHASIL DISIMPAN KE SUPABASE!', 'success');
    parsedData = [];
    document.getElementById('previewArea').style.display = 'none';
    btnSaveToDb.style.display = 'none';
    document.getElementById('fileInput').value = '';

    await loadMasterData();
  } catch (err) {
    showBanner(`❌ Gagal menyimpan ke DB: ${err.message}`, 'error');
  } finally {
    btnSaveToDb.disabled = false;
    btnSaveToDb.innerText = '💾 Simpan ke Database';
  }
}

async function loadMasterData() {
  const masterPoTbody = document.getElementById('masterPoTbody');
  if (!masterPoTbody || !supabaseClient) return;

  masterPoTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading data master...</td></tr>';
  try {
    const { data: orders, error: errOrders } = await supabaseClient.from('orders').select('*').order('arrival_date', { ascending: false });
    if (errOrders) throw errOrders;

    const { data: items, error: errItems } = await supabaseClient.from('order_items').select('po_number');
    if (errItems) throw errItems;

    if (!orders || orders.length === 0) {
      masterPoTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Belum ada PO tersimpan.</td></tr>';
      return;
    }

    masterPoTbody.innerHTML = '';
    orders.forEach(po => {
      const lotCount = items.filter(i => i.po_number === po.po_number).length;
      const tr = document.createElement('tr');
      tr.innerHTML = `
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
    masterPoTbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
  }
}

window.deletePO = async function(poNumber) {
  if (!confirm(`Yakin ingin menghapus PO [${poNumber}] beserta seluruh LOT terkait?`) || !supabaseClient) return;

  try {
    const { error } = await supabaseClient.from('orders').delete().eq('po_number', poNumber);
    if (error) throw error;
    showBanner(`🗑️ PO [${poNumber}] berhasil dihapus!`, 'success');
    await loadMasterData();
  } catch (err) {
    showBanner(`❌ Delete error: ${err.message}`, 'error');
  }
};

// ==========================================
// 4. SCANNER MODULE (index.html)
// ==========================================
function initScannerPage() {
  const barcodeInput = document.getElementById('barcodeInput');
  if (barcodeInput) {
    barcodeInput.focus();
    barcodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const val = barcodeInput.value.trim();
        if (val) {
          showBanner(`🔍 Barcode Scanned: ${val}`, 'success');
          barcodeInput.value = '';
        }
      }
    });
  }
}

// Auto Router based on DOM Presence
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('dropzone')) {
    initAdminPage();
  } else if (document.getElementById('barcodeInput')) {
    initScannerPage();
  }
});