// ==========================================
// 1. SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://dtrzkyjbdjngyuquajkk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zZJ7aREpv6jjemYmrrWtUw_ZgoMD2Us';

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Scanner Global States
let activePO = null;
let poItems = [];
let allOrdersData = [];
let pendingScanData = null;
let isManualMode = false;

// Admin Global States
let parsedData = [];

// Helper: Show Feedback Banner
function showFeedback(msg, type) {
  const banner = document.getElementById('feedbackBanner') || document.getElementById('statusBanner');
  if (!banner) return;
  banner.style.display = 'block';
  banner.innerText = msg;
  banner.className = `banner banner-${type} feedback-banner`;

  setTimeout(() => {
    banner.style.display = 'none';
  }, 4000);
}

// Audio Synthesizer
function playAudio(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'warning') {
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.log('Audio playback error:', e);
  }
}

// ==========================================
// 2. SCANNER PAGE MODULE (index.html)
// ==========================================
function initScannerPage() {
  const weekSelect = document.getElementById('weekSelect');
  const dateSelect = document.getElementById('dateSelect');
  const ritSelect = document.getElementById('ritSelect');
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
      populateWeekDropdown();
    } catch (err) {
      showFeedback(`Gagal load PO: ${err.message}`, 'error');
    }
  }

  function populateWeekDropdown() {
    const weeks = [...new Set(allOrdersData.map(item => getISOWeek(item.arrival_date)))];
    weekSelect.innerHTML = '<option value="">- Week -</option>';
    weeks.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.innerText = w;
      weekSelect.appendChild(opt);
    });
  }

  weekSelect.addEventListener('change', () => {
    const selectedWeek = weekSelect.value;
    dateSelect.innerHTML = '<option value="">- Date -</option>';
    ritSelect.innerHTML = '<option value="">- Rit -</option>';
    poSelect.innerHTML = '<option value="">-- Pilih Rit Dahulu --</option>';

    dateSelect.disabled = !selectedWeek;
    ritSelect.disabled = true;
    poSelect.disabled = true;

    if (!selectedWeek) return;

    const filteredDates = [...new Set(
      allOrdersData
        .filter(item => getISOWeek(item.arrival_date) === selectedWeek)
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
    ritSelect.innerHTML = '<option value="">- Rit -</option>';
    poSelect.innerHTML = '<option value="">-- Pilih Rit Dahulu --</option>';

    ritSelect.disabled = !selectedDate;
    poSelect.disabled = true;

    if (!selectedDate) return;

    const filteredRits = [...new Set(
      allOrdersData
        .filter(item => item.arrival_date === selectedDate)
        .map(item => item.arrival_time)
    )];

    filteredRits.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.innerText = `Rit: ${r.substring(0, 5)}`;
      ritSelect.appendChild(opt);
    });
  });

  ritSelect.addEventListener('change', () => {
    const selectedDate = dateSelect.value;
    const selectedRit = ritSelect.value;
    poSelect.innerHTML = '<option value="">-- Pilih Target PO --</option>';

    poSelect.disabled = !selectedRit;
    if (!selectedRit) return;

    const matchedPOs = allOrdersData.filter(
      item => item.arrival_date === selectedDate && item.arrival_time === selectedRit
    );

    matchedPOs.forEach(po => {
      const opt = document.createElement('option');
      opt.value = po.po_number;
      opt.innerText = `PO: ${po.po_number} (${po.blend_code})`;
      poSelect.appendChild(opt);
    });
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

      poItems = items.map(item => {
        const lotLogs = logs.filter(l => l.lot_code === item.lot_code);
        const totalWeightScanned = lotLogs.reduce((sum, l) => sum + Number(l.net_weight_kg), 0);
        const scannedCt = parseFloat((totalWeightScanned / 200).toFixed(2));
        return { ...item, scanned_ct: scannedCt };
      });

      renderPOSummary(poItems[0]);
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
        playAudio('error');
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
      playAudio('error');
      showFeedback(`❌ ${parsed.message}`, 'error');
      return;
    }

    const matchedLot = poItems.find(i => i.lot_code === parsed.lotCode);
    if (!matchedLot) {
      playAudio('error');
      showFeedback(`❌ LOT ${parsed.lotCode} TIDAK ADA dalam PO ${activePO}!`, 'error');
      return;
    }

    const scannedWeightCt = parsed.netWeight / 200;
    const projectedCt = matchedLot.scanned_ct + scannedWeightCt;
    const maxAllowedCt = Number(matchedLot.qty_usage_ct);

    if (projectedCt > maxAllowedCt + 0.05) {
      playAudio('error');
      showFeedback(`❌ OVER PICKING! LOT [${parsed.lotCode}] sudah FULFILLED (Target: ${maxAllowedCt} CT, Current: ${matchedLot.scanned_ct} CT)`, 'error');
      return;
    }

    const { data: existingSN } = await supabaseClient
      .from('scan_logs')
      .select('po_number, serial_number')
      .eq('serial_number', parsed.serialNumber)
      .maybeSingle();

    if (existingSN) {
      pendingScanData = { parsed, isBypassed: true };
      playAudio('warning');
      openBypassModal(`SN [${parsed.serialNumber}] SUDAH PERNAH DI-SCAN di PO [${existingSN.po_number}]. Tetap masukkan?`);
      return;
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

      playAudio('success');
      showFeedback(`✅ [${parsedData.lotCode}] SN OK! (+${parsedData.netWeight} KG)`, 'success');
      await fetchPODetails(activePO);
    } catch (err) {
      playAudio('error');
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
📌 *PO NUMBER:* ${activePO}
📦 *BLEND:* ${sampleItem.blend_code || '-'}
⏰ *RIT/TIME:* ${sampleItem.arrival_time ? sampleItem.arrival_time.substring(0, 5) : '-'}
📅 *DATE:* ${todayStr}

📊 *PROGRESS OVERALL:* ${totalScannedCT.toFixed(1)} / ${totalTargetCT} CT (${pct}%)

*BREAKDOWN LOT:*
${lotBreakdown}

_Reported via RF Scanner App_`;

    navigator.clipboard.writeText(waMessage).then(() => {
      playAudio('success');
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
      playAudio('success');
      showFeedback('🗑️ Scan item berhasil dihapus!', 'success');
      await loadLogsTable();
      await fetchPODetails(activePO);
    } catch (err) {
      showFeedback(`❌ Delete error: ${err.message}`, 'error');
    }
  };

  function renderPOSummary(sampleItem) {
    if(!sampleItem) return;
    document.getElementById('poSummary').style.display = 'block';
    document.getElementById('lblBlend').innerText = sampleItem.blend_code || '-';
    document.getElementById('lblTime').innerText = sampleItem.arrival_time ? sampleItem.arrival_time.substring(0, 5) : '-';

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
// 3. ADMIN PAGE MODULE (admin.html)
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
        showFeedback('❌ File kosong atau format tidak sesuai!', 'error');
        return;
      }
      processExcelRows(rawRows);
    } catch (err) {
      showFeedback(`❌ Gagal membaca file: ${err.message}`, 'error');
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
    showFeedback('❌ Kolom Excel tidak terdeteksi. Pastikan ada kolom "PO Number" dan "Lot Code"', 'error');
    return;
  }

  renderPreviewTable();
  showFeedback(`✅ Berhasil membaca ${parsedData.length} baris data.`, 'success');
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

    showFeedback('🎉 DATA BERHASIL DISIMPAN KE SUPABASE!', 'success');
    parsedData = [];
    document.getElementById('previewArea').style.display = 'none';
    btnSaveToDb.style.display = 'none';
    document.getElementById('fileInput').value = '';

    await loadMasterData();
  } catch (err) {
    showFeedback(`❌ Gagal menyimpan ke DB: ${err.message}`, 'error');
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
    showFeedback(`🗑️ PO [${poNumber}] berhasil dihapus!`, 'success');
    await loadMasterData();
  } catch (err) {
    showFeedback(`❌ Delete error: ${err.message}`, 'error');
  }
};

// ==========================================
// 4. ROUTER INITIALIZER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('barcodeInput')) {
    initScannerPage();
  }
  if (document.getElementById('dropzone')) {
    initAdminPage();
  }
});