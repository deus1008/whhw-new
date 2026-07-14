// 공식 API → Supabase 적재. dataset 별로 전량 수집 후 API 소스분(source_file='API:*')만
// 교체(삭제→삽입). 허가(drug_permit)는 PK(item_seq) 기준 upsert 로 상세보강 컬럼 보존.
// 파일 업로드분(source_file != 'API:*')은 건드리지 않음(보조 데이터 유지).

import {
  fetchBioeqRows, fetchDmfRows, fetchReferenceRows, fetchPermitRows, fetchAllPermitDetails, type RefDataset,
} from './reference-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// 허가 상세 대량적재: drug_permit 의 포장/제조원/위탁 등 전량 채움 + permit_pkg(코드→포장) 재구축.
export async function syncPermitDetail(svc: Svc): Promise<{ permit_detail: number; permit_pkg: number }> {
  const rows = await fetchAllPermitDetails();
  if (rows.length === 0) throw new Error('허가 상세 응답 0건 — 중단');
  const now = new Date().toISOString();

  // 1) drug_permit 상세 컬럼 갱신(item_seq upsert)
  const detail = rows.map((r) => ({
    item_seq: r.item_seq, package_unit: r.package_unit, maker: r.maker, is_consignment: r.is_consignment,
    storage_method: r.storage_method, etc_otc: r.etc_otc, atc_code: r.atc_code, valid_term: r.valid_term,
    cancel_name: r.cancel_name, detail_fetched_at: now,
  }));
  for (const c of chunk(detail, 500)) {
    const { error } = await svc.from('drug_permit').upsert(c, { onConflict: 'item_seq' });
    if (error) throw new Error(`drug_permit detail upsert: ${error.message}`);
  }

  // 2) permit_pkg(9자리 코드 → 포장/제조원/위탁) 재구축 — edi_code 분해
  const byCode = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    if (!r.edi_code || r.package_unit == null) continue;
    for (const code of String(r.edi_code).split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!byCode.has(code)) byCode.set(code, {
        code, item_seq: r.item_seq, package_unit: r.package_unit, maker: r.maker, is_consignment: r.is_consignment, updated_at: now,
      });
    }
  }
  const pkgRows = [...byCode.values()];
  await svc.from('permit_pkg').delete().not('code', 'is', null);
  for (const c of chunk(pkgRows, 1000)) {
    const { error } = await svc.from('permit_pkg').insert(c);
    if (error) throw new Error(`permit_pkg insert: ${error.message}`);
  }
  return { permit_detail: rows.length, permit_pkg: pkgRows.length };
}

export async function syncDataset(svc: Svc, dataset: RefDataset): Promise<{ table: string; count: number }> {
  if (dataset === 'permit') {
    const rows = await fetchPermitRows();
    // 목록 필드만 upsert — 상세(maker/package_unit/…)·detail_fetched_at 는 보존
    for (const c of chunk(rows, 500)) {
      const { error } = await svc.from('drug_permit').upsert(c, { onConflict: 'item_seq' });
      if (error) throw new Error(`drug_permit upsert: ${error.message}`);
    }
    return { table: 'drug_permit', count: rows.length };
  }

  const table = dataset === 'bioeq' ? 'drug_bioequiv' : dataset === 'dmf' ? 'drug_dmf' : 'drug_reference';
  const rows: Record<string, unknown>[] =
    dataset === 'bioeq' ? await fetchBioeqRows()
    : dataset === 'dmf' ? await fetchDmfRows()
    : await fetchReferenceRows();

  // API 소스분만 교체
  await svc.from(table).delete().eq('source_file', `API:${dataset}`);
  for (const c of chunk(rows, 1000)) {
    const { error } = await svc.from(table).insert(c);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  }
  return { table, count: rows.length };
}
