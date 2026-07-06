const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const SVC_URL = 'https://lvzgtcxrpsebyzptmqvd.supabase.co';
const SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2emd0Y3hycHNlYnl6cHRtcXZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MDc0NywiZXhwIjoyMDk0NjY2NzQ3fQ.7aX8PVtNLaFhNBnEcPBH7q5cxnX6g6sOC4PFnpR2Yx0';
const svc = createClient(SVC_URL, SVC_KEY);

function norm(s) {
  return String(s ?? '').replace(/[\s\r\n_\-\.\:%()\[\] ]/g, '').toLowerCase();
}
function matchKw(cell, kws) {
  const n = norm(cell);
  return kws.some(k => n.includes(norm(k)));
}
function normalizePeriod(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[^\d년월\-\.]/g, '').trim();
  if (/^\d{6}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6);
  const m = s.match(/^(\d{4})[-\.](\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0');
  const m2 = s.match(/^(\d{4})년(\d{1,2})월?$/);
  if (m2) return m2[1] + '-' + m2[2].padStart(2, '0');
  return null;
}
function periodFromFilename(filename) {
  const m4 = filename.match(/_(\d{4})\.(\d{2})\b/);
  if (m4) return m4[1] + '-' + m4[2];
  const m2 = filename.match(/_(\d{2})\.(\d{2})\b/);
  if (m2) {
    const year = parseInt(m2[1]) >= 90 ? '19' + m2[1] : '20' + m2[1];
    return year + '-' + m2[2];
  }
  return null;
}
function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

const PERIOD_KW = ['기간','연월','년월','월','period','yyyymm','연도','date'];
const INGR_KW   = ['성분명','성분','ingredient','inn','주성분','성분코드명'];
const PROD_KW   = ['제품명','품목명','상품명','brand','제품','품목','상품'];
const MFR_KW    = ['제조사','제약사','회사명','회사','manufacturer','메이커','공급사'];
const HOSP_KW   = ['병원구분','의료기관종별','종별구분','병원종류','구분','종별'];
const REGION_KW = ['지역','시도','지역명','region','광역'];
const AMOUNT_KW = ['처방금액','처방조제액','금액','처방액','amount','처방매출','매출액','처방총액','측정치'];
const COUNT_KW  = ['처방건수','건수','처방수','count','rx건수','건'];

function parseUbistBuffer(buffer, filename, documentId) {
  let wb;
  try { wb = XLSX.read(buffer, { type: 'buffer', cellDates: false }); }
  catch (e) { return { rows: [], total: 0, error: String(e) }; }

  const filenamePeriod = periodFromFilename(filename);
  const allRows = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length < 2) continue;

    const sheetPeriod = normalizePeriod(sheetName);
    let headerRow = -1;
    for (let r = 0; r < Math.min(10, raw.length); r++) {
      const rowCells = raw[r].map(c => String(c ?? ''));
      if (rowCells.some(c => matchKw(c, PROD_KW) || matchKw(c, INGR_KW))) {
        headerRow = r; break;
      }
    }

    if (headerRow === -1) {
      // DEBUG: show first few rows
      console.log('  [DEBUG] 헤더 미발견. 처음 3행:');
      for (let r = 0; r < Math.min(3, raw.length); r++) {
        console.log('   행' + r + ':', JSON.stringify(raw[r]));
      }
      continue;
    }

    const headers = raw[headerRow].map(c => String(c ?? ''));
    console.log('  [DEBUG] 헤더 행(' + headerRow + '):', JSON.stringify(headers));

    let periodCol=-1, ingrCol=-1, prodCol=-1, mfrCol=-1, hospCol=-1, regionCol=-1, amountCol=-1, countCol=-1;
    headers.forEach((h, i) => {
      // 헤더 자체가 기간 값(예: "2025년 3월")이면 wide-format 금액 컬럼 — period 컬럼으로 잡지 않음
      if (periodCol === -1 && matchKw(h, PERIOD_KW) && !normalizePeriod(h)) periodCol = i;
      if (ingrCol   === -1 && matchKw(h, INGR_KW))   ingrCol   = i;
      if (prodCol   === -1 && matchKw(h, PROD_KW))    prodCol   = i;
      if (mfrCol    === -1 && matchKw(h, MFR_KW))     mfrCol    = i;
      if (hospCol   === -1 && matchKw(h, HOSP_KW))    hospCol   = i;
      if (regionCol === -1 && matchKw(h, REGION_KW))  regionCol = i;
      if (amountCol === -1 && matchKw(h, AMOUNT_KW))  amountCol = i;
      if (countCol  === -1 && matchKw(h, COUNT_KW))   countCol  = i;
    });
    console.log('  [DEBUG] 컬럼: prod=' + prodCol + ' ingr=' + ingrCol + ' period=' + periodCol + ' amount=' + amountCol);

    // Wide-format: 금액 컬럼명이 기간인 경우
    const wideAmountCols = [];
    if (amountCol === -1) {
      const fixedCols = new Set([periodCol, ingrCol, prodCol, mfrCol, hospCol, regionCol, countCol].filter(c => c >= 0));
      headers.forEach((h, i) => {
        if (fixedCols.has(i)) return;
        const candidate = normalizePeriod(h);
        if (candidate) wideAmountCols.push({ col: i, period: candidate });
      });
      if (wideAmountCols.length > 0) console.log('  [DEBUG] Wide-format 감지:', wideAmountCols);
    }

    if (amountCol === -1 && wideAmountCols.length === 0 && prodCol === -1) {
      console.log('  [DEBUG] 처방금액/제품 컬럼 없어 시트 건너뜀');
      continue;
    }

    let rowCount = 0;
    for (let r = headerRow + 1; r < raw.length; r++) {
      const row = raw[r];
      if (row.every(c => c == null || String(c).trim() === '')) continue;
      const productName = prodCol >= 0 ? String(row[prodCol] ?? '').trim() || null : null;
      const ingrName    = ingrCol >= 0 ? String(row[ingrCol] ?? '').trim() || null : null;
      if (!productName && !ingrName) continue;

      const mfr      = mfrCol    >= 0 ? String(row[mfrCol]    ?? '').trim() || null : null;
      const hospType = hospCol   >= 0 ? String(row[hospCol]   ?? '').trim() || null : null;
      const region   = regionCol >= 0 ? String(row[regionCol] ?? '').trim() || null : null;

      if (wideAmountCols.length > 0) {
        for (const { col, period } of wideAmountCols) {
          allRows.push({
            source_file: filename, document_id: documentId || null,
            period, ingredient_name: ingrName, product_name: productName,
            manufacturer: mfr, hospital_type: hospType, region,
            prescription_amount: toNum(row[col]),
            prescription_count: countCol >= 0 ? toNum(row[countCol]) : null,
          });
        }
      } else {
        const rawPeriod = periodCol >= 0 ? normalizePeriod(row[periodCol]) : null;
        const period = rawPeriod || sheetPeriod || filenamePeriod;
        allRows.push({
          source_file: filename, document_id: documentId || null,
          period, ingredient_name: ingrName, product_name: productName,
          manufacturer: mfr, hospital_type: hospType, region,
          prescription_amount: amountCol >= 0 ? toNum(row[amountCol]) : null,
          prescription_count: countCol >= 0 ? toNum(row[countCol]) : null,
        });
      }
      rowCount++;
    }
    console.log('  [DEBUG] 시트', sheetName, '→', rowCount, '행 파싱');
  }
  return { rows: allRows, total: allRows.length };
}

async function main() {
  const { data: docs } = await svc.from('documents').select('id, filename, storage_path').eq('category', 'Ubist');
  console.log('총', docs.length, '개 파일 재처리 시작');

  for (const doc of docs) {
    console.log('\n처리 중:', doc.filename);
    const { data: blob, error: dlErr } = await svc.storage.from('documents').download(doc.storage_path);
    if (dlErr || !blob) { console.error('  다운로드 실패:', dlErr?.message); continue; }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const { rows, total, error } = parseUbistBuffer(buffer, doc.filename, doc.id);
    if (error) { console.error('  파싱 오류:', error); continue; }
    console.log('  파싱 결과:', total, '행');
    if (total === 0) { console.warn('  경고: 파싱된 행 없음'); continue; }

    const sample = rows.find(r => r.period && r.prescription_amount);
    if (sample) console.log('  샘플:', sample.product_name, '|', sample.period, '|', sample.prescription_amount, '원');

    await svc.from('ubist_data').delete().eq('source_file', doc.filename);

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insErr } = await svc.from('ubist_data').insert(rows.slice(i, i + CHUNK));
      if (insErr) console.error('  삽입 오류(chunk', i, '):', insErr.message);
      else inserted += rows.slice(i, i + CHUNK).length;
    }
    console.log('  삽입 완료:', inserted, '/', total);
  }

  const { count } = await svc.from('ubist_data').select('*', { count: 'exact', head: true });
  console.log('\n최종 ubist_data 총 행수:', count);

  const { data: sample2 } = await svc.from('ubist_data')
    .select('product_name, period, prescription_amount')
    .ilike('product_name', '%크레트롤%')
    .limit(3);
  console.log('크레트롤 샘플:', JSON.stringify(sample2, null, 2));
}
main().catch(console.error);
