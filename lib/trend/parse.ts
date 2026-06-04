/**
 * 처방실적 트렌드 XLSB/XLSX 파일 파싱
 * 컬럼 매핑: 처방월 | 내부담당자 | 담당CSO | 처방처명 | 품목명 | 종별구분 | 합산수수료 | 처방금액
 */
import * as XLSX from 'xlsx';

export type TrendRow = {
  source_file:          string;
  prescription_month:   string | null;   // YYYYMM
  sales_rep:            string | null;   // 내부담당자
  cso_name:             string | null;   // 담당CSO
  hospital_name:        string | null;   // 처방처명
  product_name:         string | null;   // 품목명
  hospital_type:        string | null;   // 종별구분
  commission_rate:      number | null;   // 합산수수료 (%)
  commission_tier:      string | null;   // 수수료구간
  prescription_amount:  number | null;   // 처방금액
};

/* ── 처방월 정규화 → YYYYMM ── */
function normalizeMonth(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[^\d]/g, '');
  if (s.length === 6) return s;                        // 202501
  if (s.length === 8) return s.slice(0, 6);            // 20250101
  if (s.length === 4) return s;                        // 2025 → 연도만
  return raw.trim() || null;
}

/* ── 수수료 구간 계산 ── */
function getCommissionTier(rate: number | null): string | null {
  if (rate === null || isNaN(rate)) return null;
  if (rate <  10) return '10% 미만';
  if (rate <  20) return '10%~20%';
  if (rate <  30) return '20%~30%';
  if (rate <  40) return '30%~40%';
  if (rate <  50) return '40%~50%';
  return '50% 이상';
}

/* ── 숫자 파싱 (콤마·% 제거) ── */
function parseNum(v: unknown): number | null {
  const s = String(v ?? '').replace(/[,%₩\s]/g, '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* ── 문자열 파싱 ── */
function parseStr(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export type ParseTrendResult = {
  rows:  TrendRow[];
  total: number;
  error?: string;
};

/* ── 컬럼명 유연 검색 (공백·괄호 포함 변형 대응) ── */
function findCol(keys: string[], candidates: string[]): string | undefined {
  // 1) 정확 매칭
  for (const c of candidates) {
    if (keys.includes(c)) return c;
  }
  // 2) trim·소문자 후 포함 매칭
  const lower = candidates.map(c => c.toLowerCase().replace(/\s/g, ''));
  for (const k of keys) {
    const kl = k.toLowerCase().replace(/\s/g, '');
    const idx = lower.findIndex(c => kl.includes(c) || c.includes(kl));
    if (idx >= 0) return k;
  }
  return undefined;
}

export function parseTrendBuffer(buffer: Buffer, fileName: string): ParseTrendResult {
  let rawRows: Record<string, unknown>[];
  try {
    const wb   = XLSX.read(buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  } catch (e) {
    return { rows: [], total: 0, error: `파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (rawRows.length === 0) return { rows: [], total: 0, error: '데이터 없음' };

  // 실제 컬럼명 탐색 (BOM·공백 포함 변형 대응)
  const keys = Object.keys(rawRows[0]);
  const COL = {
    month:    findCol(keys, ['처방월','처방년월','처방연월','청구년월','년월']),
    rep:      findCol(keys, ['내부담당자','담당자','MR','담당MR','영업담당자']),
    cso:      findCol(keys, ['담당CSO','CSO명','CSO','법인명','수탁법인']),
    hospital: findCol(keys, ['처방처명','병원명','거래처명','처방처','거래처']),
    product:  findCol(keys, ['품목명','제품명','약품명','품명']),
    type:     findCol(keys, ['종별구분','종별','요양기관종별','기관종별']),
    comm:     findCol(keys, ['합산수수료','수수료율','수수료','수수료(%)','합산수수료율']),
    amount:   findCol(keys, ['처방금액','처방액','원외처방금액','처방금액(원)','금액']),
  };

  // 진단용 로그 (Vercel 로그에서 확인 가능)
  console.log(`[trend-parse] 파일: ${fileName}`);
  console.log(`[trend-parse] 전체 컬럼(${keys.length}):`, keys.slice(0, 15).join(', '));
  console.log(`[trend-parse] 매핑:`, JSON.stringify(COL));

  if (!COL.amount) {
    return {
      rows:  [],
      total: rawRows.length,
      error: `처방금액 컬럼을 찾을 수 없습니다. 감지된 컬럼: [${keys.slice(0, 10).join(', ')}]`,
    };
  }

  const rows: TrendRow[] = [];
  for (const raw of rawRows) {
    const amount = parseNum(COL.amount ? raw[COL.amount] : null);
    if (!amount || amount <= 0) continue;

    const commRate = parseNum(COL.comm ? raw[COL.comm] : null);

    rows.push({
      source_file:         fileName,
      prescription_month:  normalizeMonth(String(COL.month ? raw[COL.month] : '')),
      sales_rep:           parseStr(COL.rep      ? raw[COL.rep]      : null),
      cso_name:            parseStr(COL.cso      ? raw[COL.cso]      : null),
      hospital_name:       parseStr(COL.hospital ? raw[COL.hospital] : null),
      product_name:        parseStr(COL.product  ? raw[COL.product]  : null),
      hospital_type:       parseStr(COL.type     ? raw[COL.type]     : null),
      commission_rate:     commRate,
      commission_tier:     getCommissionTier(commRate),
      prescription_amount: amount,
    });
  }

  console.log(`[trend-parse] 유효 행: ${rows.length} / 전체: ${rawRows.length}`);
  return { rows, total: rawRows.length };
}
