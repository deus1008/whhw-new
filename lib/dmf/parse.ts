/**
 * 원료DMF(Drug Master File) Excel 파싱 유틸리티
 * MFDS 제공 Excel 다운로드 파일을 drug_dmf 테이블에 적재
 */
import * as XLSX from 'xlsx';

export type DmfRow = {
  source_file:          string;
  ingredient_name:      string;
  company_name:         string | null;  // 국내 등록업체
  manufacturer_name:    string | null;  // 실제 제조업체명
  manufacturer_address: string | null;  // 제조소 주소
  country:              string | null;  // 제조국
  registration_date:    string | null;  // 등록일
  dmf_number:           string | null;  // DMF 허가번호
};

export type ParseDmfResult = {
  rows:  DmfRow[];
  total: number;
  error?: string;
  debug?: {
    headerRow:  number;
    allCols:    string[];
    colMapping: Record<string, string | undefined>;
  };
};

/* ── 컬럼 키워드 (구체적인 것 → 일반적인 것 순서) ── */
const INGR_KW    = ['성분명', '원료명', '성분(한글)', '한글성분명', '성분명(한글)', '주성분명', '성분'];
const COMPANY_KW = ['국내관리업체명', '국내등록업체', '국내업체명', '관리업체명', '등록업체', '업체명', '회사명', '수입사'];
const MFG_KW     = ['제조업소명', '외국제조업체명', '제조업체명', '등록자명', '업소명', '제조사명', '제조업소', '제조업체', '제조사', '제조원', '외국제조업체'];
const ADDR_KW    = ['제조소주소', '제조소 주소', '제조소소재지', '소재지', '주소'];
const COUNTRY_KW = ['제조국', '원산지', '제조국가', '국가명', '국가'];
const DATE_KW    = ['허가일자', '등록일자', '등록연월일', 'DMF등록일', '허가연월일', '등록일', '허가일', '등재일'];
const DMF_KW     = ['DMF허가번호', 'DMF 허가번호', 'DMF번호', '허가번호', '등록번호', 'DMF No', 'DMF호'];

function norm(s: string): string {
  return s.replace(/[\s\r\n_\-\.()（）]/g, '').toLowerCase();
}

function findCol(keys: string[], candidates: string[]): string | undefined {
  const normKeys = keys.map(k => ({ orig: k, norm: norm(k) }));
  const normCands = candidates.map(norm);
  for (const cand of normCands) {
    const found = normKeys.find(k => k.norm === cand);
    if (found) return found.orig;
  }
  for (const cand of normCands) {
    // k.norm이 3자 미만이면 cand.includes(k.norm) 방향은 오매칭 위험 → 제외
    const found = normKeys.find(k =>
      k.norm.includes(cand) ||
      (cand.includes(k.norm) && k.norm.length >= 3)
    );
    if (found) return found.orig;
  }
  return undefined;
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function parseDmfBuffer(buffer: Buffer, fileName: string): ParseDmfResult {
  let rawRows: Record<string, unknown>[];
  let headerIdx = 0;
  try {
    const wb = XLSX.read(buffer, {
      type: 'buffer', cellFormula: false, cellHTML: false,
      cellNF: false, cellText: false, cellDates: false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 헤더 행 자동 탐색 (최대 10행)
    const arrays = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const ALL_KW = [...INGR_KW, ...COMPANY_KW, ...MFG_KW, ...ADDR_KW, ...COUNTRY_KW, ...DATE_KW, ...DMF_KW].map(norm);
    let bestHits = 0;
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

  const origKeys = Object.keys(rawRows[0]);
  const cleanKeys = origKeys.map(k => k.replace(/[\r\n]+/g, ' ').trim());
  const normalizedRows = rawRows.map(row => {
    const out: Record<string, unknown> = {};
    origKeys.forEach((ok, i) => { out[cleanKeys[i]] = row[ok]; });
    return out;
  });

  const COL = {
    ingr:    findCol(cleanKeys, INGR_KW),
    company: findCol(cleanKeys, COMPANY_KW),
    mfg:     findCol(cleanKeys, MFG_KW),
    addr:    findCol(cleanKeys, ADDR_KW),
    country: findCol(cleanKeys, COUNTRY_KW),
    date:    findCol(cleanKeys, DATE_KW),
    dmfNo:   findCol(cleanKeys, DMF_KW),
  };

  const debug = {
    headerRow:  headerIdx,
    allCols:    cleanKeys,
    colMapping: { ingr: COL.ingr, company: COL.company, mfg: COL.mfg, addr: COL.addr, country: COL.country, date: COL.date, dmfNo: COL.dmfNo },
  };
  console.log(`[dmf-parse] 파일: ${fileName}`);
  console.log(`[dmf-parse] 헤더행 idx=${headerIdx}, 컬럼:`, cleanKeys.join(' | '));
  console.log(`[dmf-parse] 매핑:`, JSON.stringify(debug.colMapping));

  if (!COL.ingr) {
    return {
      rows: [], total: rawRows.length, debug,
      error: `성분명 컬럼 미감지. 감지된 컬럼: [${cleanKeys.slice(0, 10).join(', ')}]`,
    };
  }

  const rows: DmfRow[] = [];
  for (const row of normalizedRows) {
    const ingr = str(COL.ingr ? row[COL.ingr] : null);
    if (!ingr) continue;
    rows.push({
      source_file:          fileName,
      ingredient_name:      ingr,
      company_name:         str(COL.company ? row[COL.company] : null),
      manufacturer_name:    str(COL.mfg     ? row[COL.mfg]     : null),
      manufacturer_address: str(COL.addr    ? row[COL.addr]    : null),
      country:              str(COL.country ? row[COL.country] : null),
      registration_date:    str(COL.date    ? row[COL.date]    : null),
      dmf_number:           str(COL.dmfNo   ? row[COL.dmfNo]   : null),
    });
  }

  console.log(`[dmf-parse] 유효 행: ${rows.length} / 전체: ${rawRows.length}`);
  return { rows, total: rawRows.length, debug };
}
