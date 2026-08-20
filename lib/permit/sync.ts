// 식약처 의약품 제품허가정보(DrugPrdtPrmsnInfoService07) → drug_permits 적재.
//   재개형: drug_permit_sync.cursor(pageNo)부터 처리, 시간예산 초과 시 커서 저장 후 종료.
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

const PRMSN_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06';
const ROWS = 500;

function fmtDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// "[M040702]포도당|[M040426]염화나트륨" → "포도당,염화나트륨"
function parseIngredient(mainItemIngr: unknown): string {
  const parts = String(mainItemIngr ?? '')
    .split('|')
    .map(s => s.replace(/^\s*\[[^\]]*\]\s*/, '').trim().replace(/\s+/g, ''))
    .filter(Boolean);
  return [...new Set(parts)].join(',');
}

type PermitRow = {
  item_seq: string; item_name: string; item_name_norm: string; entp_name: string;
  ingredient: string; main_ingr_raw: string; etc_otc: string;
  permit_date: string | null; cancel_date: string | null; updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItem(it: any): PermitRow | null {
  const item_seq = String(it.ITEM_SEQ ?? '').trim();
  const item_name = String(it.ITEM_NAME ?? '').trim();
  if (!item_seq || !item_name) return null;
  return {
    item_seq,
    item_name,
    item_name_norm: item_name.replace(/\s+/g, ''),
    entp_name: String(it.ENTP_NAME ?? '').trim(),
    ingredient: parseIngredient(it.MAIN_ITEM_INGR),
    main_ingr_raw: String(it.MAIN_ITEM_INGR ?? '').trim(),
    etc_otc: String(it.ETC_OTC_CODE ?? '').trim(),
    permit_date: fmtDate(it.ITEM_PERMIT_DATE),
    cancel_date: fmtDate(it.CANCEL_DATE),
    updated_at: new Date().toISOString(),
  };
}

async function fetchPage(key: string, pageNo: number): Promise<{ items: unknown[]; total: number }> {
  const url = `${PRMSN_URL}?serviceKey=${encodeURIComponent(key)}&pageNo=${pageNo}&numOfRows=${ROWS}&type=json`;
  const res = await fetch(url);
  const j = await res.json();
  const body = j?.body ?? j?.response?.body;
  const items = body?.items;
  const arr = Array.isArray(items) ? items : (items?.item ? [items.item].flat() : []);
  return { items: arr as unknown[], total: Number(body?.totalCount ?? 0) };
}

export type SyncResult = { total: number; processed: number; cursor: number; done: boolean; elapsedMs: number };

export async function syncDrugPermits(svc: Svc, opts?: { budgetMs?: number; nowMs?: number }): Promise<SyncResult> {
  const key = process.env.DRUG_API_KEY;
  if (!key) throw new Error('DRUG_API_KEY 미설정');
  const budgetMs = opts?.budgetMs ?? 240_000;
  const start = opts?.nowMs ?? 0; // 시작 기준(테스트 주입 가능). 실제 경과는 누적 카운터로 계산.

  const { data: st } = await svc.from('drug_permit_sync').select('*').eq('id', 1).maybeSingle();
  // 이전 사이클 완료(done)면 새 사이클 시작(cursor=1, synced=0).
  let cursor = (!st || st.done) ? 1 : Number(st.cursor ?? 1);
  let syncedCycle = (!st || st.done) ? 0 : Number(st.synced ?? 0);
  if (!st || st.done) {
    await svc.from('drug_permit_sync').upsert({ id: 1, cursor: 1, synced: 0, done: false, started_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }

  let total = Number(st?.total ?? 0);
  let processed = 0;
  const t0 = Date.now();

  while (true) {
    const { items, total: t } = await fetchPage(key, cursor);
    if (t > 0) total = t;
    if (items.length === 0) {
      // 끝 도달 → 사이클 완료
      await svc.from('drug_permit_sync').update({ cursor: 1, synced: syncedCycle, total, done: true, updated_at: new Date().toISOString() }).eq('id', 1);
      break;
    }
    const rows = items.map(mapItem).filter((x): x is PermitRow => x !== null);
    if (rows.length) {
      const { error } = await svc.from('drug_permits').upsert(rows, { onConflict: 'item_seq' });
      if (error) throw new Error(`upsert 실패(p${cursor}): ${error.message}`);
    }
    processed += rows.length;
    syncedCycle += rows.length;
    cursor += 1;

    const lastPage = total > 0 && (cursor - 1) * ROWS >= total;
    if (lastPage) {
      await svc.from('drug_permit_sync').update({ cursor: 1, synced: syncedCycle, total, done: true, updated_at: new Date().toISOString() }).eq('id', 1);
      break;
    }
    // 시간예산 초과 → 커서 저장 후 종료(다음 실행에서 이어서)
    if (Date.now() - t0 >= budgetMs) {
      await svc.from('drug_permit_sync').update({ cursor, synced: syncedCycle, total, done: false, updated_at: new Date().toISOString() }).eq('id', 1);
      return { total, processed, cursor, done: false, elapsedMs: Date.now() - t0 + start };
    }
  }

  return { total, processed, cursor: 1, done: true, elapsedMs: Date.now() - t0 };
}
