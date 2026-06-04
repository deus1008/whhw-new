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

  const rows: TrendRow[] = [];
  for (const raw of rawRows) {
    const amount = parseNum(raw['처방금액']);
    if (!amount || amount <= 0) continue;   // 처방금액 없는 행 스킵

    const commRate = parseNum(raw['합산수수료']);

    rows.push({
      source_file:         fileName,
      prescription_month:  normalizeMonth(String(raw['처방월'] ?? '')),
      sales_rep:           parseStr(raw['내부담당자']),
      cso_name:            parseStr(raw['담당CSO']),
      hospital_name:       parseStr(raw['처방처명']),
      product_name:        parseStr(raw['품목명']),
      hospital_type:       parseStr(raw['종별구분']),
      commission_rate:     commRate,
      commission_tier:     getCommissionTier(commRate),
      prescription_amount: amount,
    });
  }

  return { rows, total: rawRows.length };
}
