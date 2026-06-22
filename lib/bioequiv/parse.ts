/**
 * 생동품목(생물학적동등성인정품목) Excel 파싱 유틸리티
 * MFDS 제공 Excel 다운로드 파일을 drug_bioequiv 테이블에 적재
 */
import * as XLSX from 'xlsx';

export type BioequivRow = {
  source_file:     string;
  item_name:       string;
  company_name:    string | null;
  ingredient_name: string | null;
  notice_date:     string | null;
  dosage_form:     string | null;
};

export type ParseBioequivResult = {
  rows:  BioequivRow[];
  total: number;
  error?: string;
};

/* ── 컬럼 키워드 ── */
const ITEM_KW    = ['품목명', '제품명', '품명', '생동품목명', '생동제품명', '인정품목명'];
const COMPANY_KW = ['업체명', '제약사', '회사명', '업체', '제조사', '제조업체'];
const INGR_KW    = ['성분명', '주성분명', '성분', '주성분', '원료명'];
const DATE_KW    = ['고시일자', '고시일', '인정일자', '인정일', '허가일', '날짜'];
const FORM_KW    = ['제형', '제형구분', '剤形', '투여경로'];

function norm(s: string): string {
  return s.replace(/[\s\r\n_\-\.()（）]/g, '').toLowerCase();
}

function findCol(keys: string[], candidates: string[]): string | undefined {
  const normKeys = keys.map(k => ({ orig: k, norm: norm(k) }));
  const normCands = candidates.map(norm);
  // 정확 매칭 우선
  for (const cand of normCands) {
    const found = normKeys.find(k => k.norm === cand);
    if (found) return found.orig;
  }
  // 포함 매칭
  for (const cand of normCands) {
    const found = normKeys.find(k => k.norm.includes(cand) || cand.includes(k.norm));
    if (found) return found.orig;
  }
  return undefined;
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function parseBioequivBuffer(buffer: Buffer, fileName: string): ParseBioequivResult {
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, {
      type: 'buffer', cellFormula: false, cellHTML: false,
      cellNF: false, cellText: false, cellDates: false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 헤더 행 자동 탐색 (최대 10행)
    const arrays = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const ALL_KW = [...ITEM_KW, ...COMPANY_KW, ...INGR_KW, ...DATE_KW, ...FORM_KW].map(norm);
    let headerIdx = 0, bestHits = 0;
    for (let ri = 0; ri < Math.min(arrays.length, 10); ri++) {
      const cells = (arrays[ri] as unknown[]).map(c => norm(String(c ?? '')));
      const hits = cells.filter(c => c.length >= 2 && ALL_KW.some(k => c === k || c.includes(k) || k.includes(c))).length;
      if (hits > bestHits) { bestHits = hits; headerIdx = ri; }
    }

    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', range: headerIdx });
  } catch (e) {
    return { rows: [], total: 0, error: `파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (rawRows.length === 0) return { rows: [], total: 0, error: '데이터 없음' };

  // 컬럼명 줄바꿈 제거 정규화
  const origKeys = Object.keys(rawRows[0]);
  const cleanKeys = origKeys.map(k => k.replace(/[\r\n]+/g, ' ').trim());
  const normalizedRows = rawRows.map(row => {
    const out: Record<string, unknown> = {};
    origKeys.forEach((ok, i) => { out[cleanKeys[i]] = row[ok]; });
    return out;
  });

  const COL = {
    item:    findCol(cleanKeys, ITEM_KW),
    company: findCol(cleanKeys, COMPANY_KW),
    ingr:    findCol(cleanKeys, INGR_KW),
    date:    findCol(cleanKeys, DATE_KW),
    form:    findCol(cleanKeys, FORM_KW),
  };

  console.log(`[bioequiv-parse] 파일: ${fileName}, 컬럼 매핑:`, JSON.stringify(COL));

  if (!COL.item) {
    return {
      rows: [], total: rawRows.length,
      error: `품목명 컬럼 미감지. 감지된 컬럼: [${cleanKeys.slice(0, 10).join(', ')}]`,
    };
  }

  const rows: BioequivRow[] = [];
  for (const row of normalizedRows) {
    const item = str(COL.item ? row[COL.item] : null);
    if (!item) continue;
    rows.push({
      source_file:     fileName,
      item_name:       item,
      company_name:    str(COL.company ? row[COL.company] : null),
      ingredient_name: str(COL.ingr    ? row[COL.ingr]    : null),
      notice_date:     str(COL.date    ? row[COL.date]    : null),
      dosage_form:     str(COL.form    ? row[COL.form]    : null),
    });
  }

  console.log(`[bioequiv-parse] 유효 행: ${rows.length} / 전체: ${rawRows.length}`);
  return { rows, total: rawRows.length };
}
