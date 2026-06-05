/**
 * 거래처현황 Excel/CSV 파일 파싱 유틸리티
 * 컬럼명 자동 감지 + 정규화
 */
import * as XLSX from 'xlsx';

export type CustomerRow = {
  source_file:   string;
  customer_code: string | null;
  customer_name: string;
  customer_type: string | null;
  region:        string | null;
  sub_region:    string | null;
  address:       string | null;
  phone:         string | null;
  manager:       string | null;
  cso:           string | null;
  memo:          string | null;
};

export type ParseCustomerResult = {
  rows:  CustomerRow[];
  total: number;
  error?: string;
  detectedCols?: Record<string, string>;
};

/* ── 컬럼 키워드 매핑 ── */
// 실제 파일 컬럼명 우선 배치
const CODE_KW    = ['cso코드','cso_코드','내부코드','co_id','거래처코드','코드','요양기관번호','기관코드','번호','code'];
const NAME_KW    = ['cso명','내부명','거래처명','업체명','기관명','병원명','약국명','요양기관명','상호','법인명','name'];
const TYPE_KW    = ['종별','종별구분','기관종별','요양종별','구분','업종'];
const REGION_KW  = ['시도','지역','광역','시도명'];
const SUBRGN_KW  = ['시군구','구시군','세부지역','시군구명'];
const ADDR_KW    = ['주소','주소지','소재지','도로명주소','지번주소','address'];
const PHONE_KW   = ['전화','전화번호','연락처','tel','phone','TEL'];
const MANAGER_KW = ['담당자','지역장','담당지역장','담당','manager','지점장','매니저'];
const CSO_KW     = ['담당cso','cso','cso명'];
const MEMO_KW    = ['비고','메모','note','remark'];

function norm(s: string): string {
  return s.replace(/[\s\r\n_\-\.]/g, '').toLowerCase();
}

function findCol(keys: string[], candidates: string[]): string | undefined {
  const normCandidates = candidates.map(c => norm(c));
  // 정확 매칭 우선
  for (let i = 0; i < keys.length; i++) {
    const k = norm(keys[i]);
    if (normCandidates.some(c => k === c)) return keys[i];
  }
  // 포함 매칭
  for (let i = 0; i < keys.length; i++) {
    const k = norm(keys[i]);
    if (normCandidates.some(c => k.includes(c) || c.includes(k))) return keys[i];
  }
  return undefined;
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function parseCustomerBuffer(buffer: Buffer, fileName: string): ParseCustomerResult {
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, {
      type: 'buffer', cellFormula: false, cellHTML: false,
      cellNF: false, cellText: false, cellDates: false, cellStyles: false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  } catch (e) {
    return { rows: [], total: 0, error: `파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (rawRows.length === 0) return { rows: [], total: 0, error: '데이터 없음' };

  // 헤더 행 자동 탐색 — 가장 많은 알려진 컬럼명이 있는 행 선택
  const rawArrays = XLSX.read(buffer, {
    type: 'buffer', cellFormula: false, cellHTML: false,
    cellNF: false, cellText: false, cellDates: false, cellStyles: false,
  });
  const ws2 = rawArrays.Sheets[rawArrays.SheetNames[0]];
  const headerArrays = XLSX.utils.sheet_to_json<unknown[]>(ws2, { header: 1, defval: '' });

  const ALL_KW = [...CODE_KW, ...NAME_KW, ...TYPE_KW, ...REGION_KW, ...SUBRGN_KW,
                  ...ADDR_KW, ...PHONE_KW, ...MANAGER_KW, ...CSO_KW, ...MEMO_KW].map(norm);

  let headerRowIdx = 0;
  let bestHits = 0;
  for (let ri = 0; ri < Math.min(headerArrays.length, 10); ri++) {
    const cells = (headerArrays[ri] as unknown[]).map(c => norm(String(c ?? '')));
    const nonEmpty = cells.filter(c => c.length >= 2);
    if (nonEmpty.length < 2) continue;
    const hits = nonEmpty.filter(c => ALL_KW.some(k => c === k || c.includes(k) || k.includes(c))).length;
    if (hits > bestHits) { bestHits = hits; headerRowIdx = ri; }
  }

  if (headerRowIdx > 0) {
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws2, { defval: '', range: headerRowIdx, raw: true });
  }

  if (rawRows.length === 0) return { rows: [], total: 0, error: '유효한 데이터 행 없음' };

  const keys = Object.keys(rawRows[0]).map(k => k.replace(/[\r\n]+/g, ' ').trim());
  const origKeys = Object.keys(rawRows[0]);
  // 키 정규화
  const normalizedRows: Record<string, unknown>[] = rawRows.map(row => {
    const out: Record<string, unknown> = {};
    origKeys.forEach((ok, i) => { out[keys[i]] = row[ok]; });
    return out;
  });

  // CSO명/내부명이 둘 다 있으면 CSO명 → name, 내부명 → cso로 분리
  const hasCsoName  = keys.some(k => norm(k) === 'cso명' || norm(k) === 'cso_명');
  const hasInnerName = keys.some(k => norm(k) === '내부명' || norm(k) === '내부_명');

  const COL = {
    code:    findCol(keys, CODE_KW),
    name:    hasCsoName ? findCol(keys, ['CSO명','cso명','cso_명']) || findCol(keys, NAME_KW)
                        : findCol(keys, NAME_KW),
    type:    findCol(keys, TYPE_KW),
    region:  findCol(keys, REGION_KW),
    sub:     findCol(keys, SUBRGN_KW),
    addr:    findCol(keys, ADDR_KW),
    phone:   findCol(keys, PHONE_KW),
    manager: findCol(keys, MANAGER_KW),
    // CSO명+내부명 둘 다 있으면 내부명을 cso 컬럼에 저장
    cso:     (hasCsoName && hasInnerName)
               ? findCol(keys, ['내부명','내부_명'])
               : findCol(keys, CSO_KW),
    memo:    findCol(keys, MEMO_KW),
  };

  console.log(`[customer-parse] 파일: ${fileName}, 헤더행=${headerRowIdx}`);
  console.log(`[customer-parse] 컬럼(${keys.length}):`, keys.slice(0, 15).join(' | '));
  console.log(`[customer-parse] 매핑:`, JSON.stringify(COL));

  if (!COL.name) {
    return {
      rows: [], total: rawRows.length,
      error: `거래처명 컬럼 미감지. 감지된 컬럼: [${keys.slice(0, 10).join(', ')}]`,
    };
  }

  const rows: CustomerRow[] = [];
  for (const row of normalizedRows) {
    const name = str(COL.name ? row[COL.name] : null);
    if (!name) continue;
    rows.push({
      source_file:   fileName,
      customer_code: str(COL.code    ? row[COL.code]    : null),
      customer_name: name,
      customer_type: str(COL.type    ? row[COL.type]    : null),
      region:        str(COL.region  ? row[COL.region]  : null),
      sub_region:    str(COL.sub     ? row[COL.sub]     : null),
      address:       str(COL.addr    ? row[COL.addr]    : null),
      phone:         str(COL.phone   ? row[COL.phone]   : null),
      manager:       str(COL.manager ? row[COL.manager] : null),
      cso:           str(COL.cso     ? row[COL.cso]     : null),
      memo:          str(COL.memo    ? row[COL.memo]    : null),
    });
  }

  console.log(`[customer-parse] 유효 행: ${rows.length} / 전체: ${rawRows.length}`);
  return { rows, total: rawRows.length, detectedCols: COL as Record<string, string> };
}
