// 공식 API → Supabase 적재. dataset 별로 전량 수집 후 API 소스분(source_file='API:*')만
// 교체(삭제→삽입). 허가(drug_permit)는 PK(item_seq) 기준 upsert 로 상세보강 컬럼 보존.
// 파일 업로드분(source_file != 'API:*')은 건드리지 않음(보조 데이터 유지).

import {
  fetchBioeqRows, fetchDmfRows, fetchReferenceRows, fetchPermitRows, type RefDataset,
} from './reference-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
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
