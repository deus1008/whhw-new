const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://lvzgtcxrpsebyzptmqvd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2emd0Y3hycHNlYnl6cHRtcXZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MDc0NywiZXhwIjoyMDk0NjY2NzQ3fQ.7aX8PVtNLaFhNBnEcPBH7q5cxnX6g6sOC4PFnpR2Yx0';
const db = createClient(SUPABASE_URL, SERVICE_KEY);

function normProd(s) {
  return s.replace(/[\s\.\-\/,·]/g, '').toLowerCase();
}

async function run() {
  const { data: docs } = await db.from('documents').select('id, filename, storage_path').eq('category', 'Ubist').eq('status', 'ready');
  console.log('Ubist 문서:', docs.length + '개');

  // normProd(product_name) → { mfr, dist, isOrig }
  const prodMap = new Map();

  for (const doc of docs) {
    console.log('처리 중:', doc.filename);
    const { data: fileData, error } = await db.storage.from('documents').download(doc.storage_path);
    if (error || !fileData) { console.error('다운로드 실패:', error?.message); continue; }

    const buf = Buffer.from(await fileData.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length < 2) continue;

    const headers = raw[0].map(c => String(c ?? ''));
    const prodIdx    = headers.indexOf('제품');
    const mfrIdx     = headers.indexOf('제조사');
    const distIdx    = headers.indexOf('판매사');
    const genericIdx = headers.indexOf('Generic');
    console.log('  컬럼: 제품=', prodIdx, '제조사=', mfrIdx, '판매사=', distIdx, 'Generic=', genericIdx);
    if (prodIdx < 0) { console.warn('  제품 컬럼 없음'); continue; }

    let mapped = 0;
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      const prod = String(row[prodIdx] ?? '').trim();
      if (!prod) continue;
      const key = normProd(prod);
      if (prodMap.has(key)) continue; // 최초 등장 기준

      const mfr  = mfrIdx  >= 0 ? String(row[mfrIdx]  ?? '').trim() || null : null;
      const dist = distIdx >= 0 ? String(row[distIdx] ?? '').trim() || null : null;
      const gv   = genericIdx >= 0 ? String(row[genericIdx] ?? '').trim().toLowerCase() : '';
      const isOrig = gv === 'original' ? true : gv === 'generic' ? false : null;
      prodMap.set(key, { mfr, dist, isOrig });
      mapped++;
    }
    console.log('  ->', mapped + '개 신규 제품 등록');
  }

  console.log('\n총', prodMap.size + '개 고유 제품명 매핑');
  console.log('예시(모나린정):', prodMap.get('모나린정') ?? '없음');

  // disease_drugs 교정
  const { data: drugs } = await db.from('disease_drugs').select('id, product_name, manufacturer, distributor, is_original');
  let updMfr = 0, updDist = 0, updOrig = 0;

  for (const drug of drugs ?? []) {
    const n = normProd(drug.product_name ?? '');
    if (!n) continue;

    // 정확한 매칭 우선, 없으면 접두사 매칭
    let info = prodMap.get(n) ?? null;
    if (!info) {
      for (const [un, v] of prodMap) {
        if (un.startsWith(n) || n.startsWith(un)) { info = v; break; }
      }
    }
    if (!info) continue;

    const update = {};
    if (!drug.manufacturer && info.mfr)   { update.manufacturer = info.mfr; updMfr++; }
    if (!drug.distributor && info.dist)    { update.distributor  = info.dist; updDist++; }
    if (info.isOrig !== null && info.isOrig !== drug.is_original) {
      update.is_original = info.isOrig; updOrig++;
    }
    if (Object.keys(update).length === 0) continue;

    const { error } = await db.from('disease_drugs').update(update).eq('id', drug.id);
    if (!error && update.manufacturer) console.log('  [제조사]', drug.product_name + ':', drug.manufacturer, '->', info.mfr);
    if (!error && update.distributor)  console.log('  [판매사]', drug.product_name + ':', drug.distributor, '->', info.dist);
  }

  console.log('\n결과: 제조사', updMfr + '개, 판매사', updDist + '개, is_original', updOrig + '개 교정');
}

run().catch(console.error);
