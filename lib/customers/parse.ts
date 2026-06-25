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
  manager_email: string | null;  // 업체담당자 이메일 (별도 컬럼)
  memo:          string | null;  // 기타 비고
};

export type ParseCustomerResult = {
  rows:  CustomerRow[];
  total: number;
  error?: string;
  detectedCols?: Record<string, string>;
};

/* ── 컬럼 키워드 매핑 ── */
// 실제 파일 컬럼명 우선 배치
const CODE_KW    = ['사업자번호','사업자등록번호','사업자등록번호(-)','사업자등록'];
const NAME_KW    = ['cso명','거래처명','업체명','기관명','병원명','약국명','요양기관명','상호','법인명','name'];
const TYPE_KW    = ['종별','종별구분','기관종별','요양종별','구분','업종'];
const REGION_KW  = ['시도','지역','광역','시도명'];
const SUBRGN_KW  = ['내부명','시군구','구시군','세부지역','시군구명'];  // 내부명을 sub_region에 저장
const ADDR_KW    = ['주소','주소지','소재지','도로명주소','지번주소','address'];
const PHONE_KW   = ['전화','전화번호','연락처','tel','phone','TEL'];
const MANAGER_KW = ['담당사원명','담당사원','지역장','담당지역장','manager','지점장','매니저'];  // 담당사원명 우선
const CSO_KW     = ['담당자','담당cso','cso담당자'];  // CSO 담당자(업체측)
const EMAIL_KW   = ['업체담당자이메일','담당자이메일','이메일','email','e-mail'];  // 이메일 → manager_email
const MEMO_KW    = ['비고','메모','note','remark','비고란'];

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
                  ...ADDR_KW, ...PHONE_KW, ...MANAGER_KW, ...CSO_KW, ...EMAIL_KW, ...MEMO_KW].map(norm);

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

  const COL = {
    code:    findCol(keys, CODE_KW),
    name:    findCol(keys, NAME_KW),
    type:    findCol(keys, TYPE_KW),
    region:  findCol(keys, REGION_KW),
    sub:     findCol(keys, SUBRGN_KW),   // 내부명 → sub_region
    addr:    findCol(keys, ADDR_KW),
    phone:   findCol(keys, PHONE_KW),
    manager: findCol(keys, MANAGER_KW),  // 담당사원명 → manager(지역장)
    cso:     findCol(keys, CSO_KW),      // 담당자 → cso(업체 담당자)
    email:   findCol(keys, EMAIL_KW),    // 업체담당자이메일 → manager_email
    memo:    findCol(keys, MEMO_KW),     // 비고 → memo
  };

  // H열(index 7) 위치 기반 폴백 — 키워드 감지 실패 시 강제 지정
  if (!COL.email && keys.length > 7) {
    COL.email = keys[7];
    console.log(`[customer-parse] 이메일 컬럼 키워드 미감지 → H열 "${keys[7]}" 폴백 사용`);
  }
  // K열(index 10) 위치 기반 폴백 — 주소 키워드 감지 실패 시 강제 지정
  if (!COL.addr && keys.length > 10) {
    COL.addr = keys[10];
    console.log(`[customer-parse] 주소 컬럼 키워드 미감지 → K열 "${keys[10]}" 폴백 사용`);
  }

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
      manager_email: str(COL.email   ? row[COL.email]   : null),
      memo:          str(COL.memo    ? row[COL.memo]    : null),
    });
  }

  console.log(`[customer-parse] 유효 행: ${rows.length} / 전체: ${rawRows.length}`);
  return { rows, total: rawRows.length, detectedCols: COL as Record<string, string> };
}
