// HIRA 급여이력정보 → 대조약(오리지널)의 "최초 등재 상한가" 수집.
//   getHistoryList 화면의 엑셀 다운로드 엔드포인트(medicineExcelAjax.do)는 인증 없이
//   품목명 검색으로 상한가 전체 이력(적용개시일자별)을 XLSX로 반환한다.
//   코드별 최소 적용개시일자의 상한가 = 조정 전 최초 등재가.
//   대조약(drug_reference)에 해당하는 제품코드만 disease_orig_price 에 적재.
import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import { refKeyOf } from './resolve';

const EXCEL_URL = 'https://www.hira.or.kr/ra/medi/medicineExcelAjax.do';
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
  'User-Agent': 'Mozilla/5.0',
  'Referer': 'https://www.hira.or.kr/ra/medi/getHistoryList.do?pgmid=HIRAA030035020000',
};

export type OrigPriceRow = {
  item_code: string; item_name: string; gnlnm_cd: string; orig_price: number; orig_date: string;
};

// 품목명(브랜드) 1건 검색 → 코드별 최초(min 적용개시일자) 상한가
export async function fetchOrigHistory(searchWrd: string): Promise<OrigPriceRow[]> {
  const body = new URLSearchParams({
    isActivity: '', pageIndex: '1', isDown: 'Y', radio1: '', searchWrd,
    sortOrdr: '', srchCnd: `[${searchWrd}]`, artcNm: searchWrd, mnfCoNm: '',
    anceDdFr: '', anceDdTo: '', adtStaDdFr: '', adtStaDdTo: '',
  });
  const res = await fetch(EXCEL_URL, { method: 'POST', headers: HEADERS, body });
  if (!res.ok) throw new Error(`HIRA 급여이력 ${searchWrd}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 2).toString('latin1') !== 'PK') return []; // 데이터 없음/에러(HTML)

  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  if (!rows.length) return [];
  const H = rows[0].map(String);
  const iC = H.indexOf('제품코드'), iN = H.indexOf('제품명'),
        iG = H.indexOf('주성분코드'), iP = H.indexOf('상한가'), iS = H.indexOf('적용개시일자');
  if (iC < 0 || iP < 0 || iS < 0) return [];

  const byCode = new Map<string, OrigPriceRow>();
  for (const r of rows.slice(1)) {
    const code = String(r[iC] ?? '').trim();
    if (!code) continue;
    const price = Number(String(r[iP] ?? '').replace(/[^0-9.]/g, '')) || 0;
    const date  = String(r[iS] ?? '').trim();
    if (!(price > 0) || !date) continue;
    const prev = byCode.get(code);
    if (!prev || date < prev.orig_date) {
      byCode.set(code, {
        item_code: code, item_name: String(r[iN] ?? '').trim(),
        gnlnm_cd: iG >= 0 ? String(r[iG] ?? '').trim() : '',
        orig_price: price, orig_date: date,
      });
    }
  }
  return [...byCode.values()];
}

// 대조약 품목명 → 검색어(브랜드 코어): 첫 숫자 이전까지, 없으면 전체
function brandOf(itemName: string): string {
  const cut = itemName.split(/\d/)[0].trim();
  return (cut.length >= 2 ? cut : itemName).trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

/**
 * 대조약 최초 등재가 수집·적재.
 * @param opts.limitBrands  이번 실행에서 처리할 브랜드 수(cron 300s 분산용)
 * @param opts.onlyMissing  이미 적재된 코드의 브랜드는 건너뜀(증분)
 * @param opts.delayMs      요청 간 지연(기본 250ms)
 */
export async function scrapeOrigPrices(
  db: Svc,
  opts: { limitBrands?: number; onlyMissing?: boolean; delayMs?: number } = {},
): Promise<{ brands: number; scanned: number; upserted: number }> {
  const delayMs = opts.delayMs ?? 250;

  // 1) 대조약 목록 → 정규화 키셋 + 브랜드 검색어
  const refKeys = new Set<string>();
  const brandSet = new Set<string>();
  const brandFirstItem = new Map<string, string>();
  {
    let from = 0; const P = 1000;
    while (true) {
      const { data } = await db.from('drug_reference').select('item_name').range(from, from + P - 1);
      if (!data?.length) break;
      for (const r of data) {
        const nm = String((r as { item_name?: string }).item_name ?? '').trim();
        if (!nm) continue;
        refKeys.add(refKeyOf(nm));
        const b = brandOf(nm);
        if (b.length >= 2 && !brandSet.has(b)) { brandSet.add(b); brandFirstItem.set(b, nm); }
      }
      if (data.length < P) break; from += P;
    }
  }

  // 2) 이미 적재된 코드(증분 skip 판단용)
  const existing = new Set<string>();
  if (opts.onlyMissing) {
    let from = 0; const P = 1000;
    while (true) {
      const { data } = await db.from('disease_orig_price').select('item_code').range(from, from + P - 1);
      if (!data?.length) break;
      for (const r of data) existing.add(String((r as { item_code?: string }).item_code ?? ''));
      if (data.length < P) break; from += P;
    }
  }

  let brands = [...brandSet].sort();
  // onlyMissing: 아직 어떤 코드도 적재 안 된(추정) 브랜드 우선. 완전 정확 판별은 아니나
  //   최초등재가는 불변이라 재수집해도 무해 → 여기선 단순히 전체에서 limit 만 적용.
  if (opts.limitBrands) brands = brands.slice(0, opts.limitBrands);

  let scanned = 0, upserted = 0;
  for (const b of brands) {
    let rows: OrigPriceRow[] = [];
    try { rows = await fetchOrigHistory(b); }
    catch (e) { console.error(`[orig-price] ${b}:`, e instanceof Error ? e.message : e); continue; }
    scanned += rows.length;

    // 주성분코드(동일제제군)별 전체 최소일자 = 조정 전 최초 등재가.
    //   재제형으로 코드가 갈려도(구코드 포함) 가장 오래된 등재가를 채택.
    const gMin = new Map<string, { price: number; date: string }>();
    for (const r of rows) {
      if (!r.gnlnm_cd) continue;
      const p = gMin.get(r.gnlnm_cd);
      if (!p || r.orig_date < p.date) gMin.set(r.gnlnm_cd, { price: r.orig_price, date: r.orig_date });
    }

    // 대조약(refKeys)에 해당하는 코드만, 값은 주성분코드 최소일자로 보정
    const keep = rows
      .filter(r => refKeys.has(refKeyOf(r.item_name)))
      .map(r => {
        const g = r.gnlnm_cd ? gMin.get(r.gnlnm_cd) : null;
        return {
          item_code: r.item_code, gnlnm_cd: r.gnlnm_cd, item_name: r.item_name,
          orig_price: g ? g.price : r.orig_price,
          orig_date:  g ? g.date  : r.orig_date,
        };
      });
    if (opts.onlyMissing && keep.length > 0 && keep.every(r => existing.has(r.item_code))) { await sleep(delayMs); continue; }
    if (keep.length) {
      const { error } = await db.from('disease_orig_price')
        .upsert(keep.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'item_code' });
      if (error) console.error(`[orig-price] upsert ${b}:`, error.message);
      else upserted += keep.length;
    }
    await sleep(delayMs);
  }
  return { brands: brands.length, scanned, upserted };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
