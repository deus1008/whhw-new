import * as XLSX from 'xlsx';

export type HospitalMasterRow = {
  hospital_code: string;
  hospital_name: string;
  business_no: string | null;
  sido: string | null;
  gugun: string | null;
  eupmyeondong: string | null;
  address: string | null;
  hospital_type: string | null;
  open_date: string | null;
  doctor_count: number | null;
  closed_status: string;
  closed_month: string | null;
  beds_upper: number | null;
  beds_general: number | null;
  icu_adult: number | null;
  icu_child: number | null;
  icu_newborn: number | null;
};

const S = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
const N = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
// Excel serial → YYYY-MM-DD
const serialToDate = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = S(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/**
 * 심평원 의료기관 엑셀 → hospital_master 행 배열.
 * 헤더(처방처코드 포함 행)를 탐지해 컬럼을 이름으로 매핑하므로 행 오프셋 변화에 견고.
 */
export function parseHospitalMasterBuffer(buffer: Buffer): HospitalMasterRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][];

  // 헤더 행 탐지
  let hIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    if ((grid[i] ?? []).some(c => String(c ?? '').trim() === '처방처코드')) { hIdx = i; break; }
  }
  if (hIdx < 0) return [];
  const header = grid[hIdx].map(c => String(c ?? '').replace(/\r?\n/g, ' ').trim());
  const col = (name: string) => header.findIndex(h => h === name);

  const cCode = col('처방처코드'), cName = col('처방처명');
  const cBiz = col('사업자번호'), cSido = col('시도'), cGu = col('구군'), cEmd = col('읍면동');
  const cAddr = col('주소'), cType = col('종별'), cOpen = col('개설일자'), cDoc = col('의사 수') >= 0 ? col('의사 수') : col('의사수');
  const cClosed = col('폐업상태'), cClosedM = col('폐업월');
  const cGen = col('일반입원실');   // 병상: 상급(=cGen), 일반(=cGen+1)
  const cIcu = col('중환자실');      // 성인(=cIcu), 소아(+1), 신생아(+2)
  if (cCode < 0 || cName < 0) return [];

  const out: HospitalMasterRow[] = [];
  const seen = new Set<string>();
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const code = r[cCode];
    if (code == null || String(code).trim() === '') continue;  // 소계·부제목·서브헤더 스킵
    const codeStr = String(code).trim();
    if (!/^\d+$/.test(codeStr)) continue;
    if (seen.has(codeStr)) continue;
    seen.add(codeStr);
    out.push({
      hospital_code: codeStr,
      hospital_name: S(r[cName]) ?? '(미상)',
      business_no: cBiz >= 0 ? S(r[cBiz]) : null,
      sido: cSido >= 0 ? S(r[cSido]) : null,
      gugun: cGu >= 0 ? S(r[cGu]) : null,
      eupmyeondong: cEmd >= 0 ? S(r[cEmd]) : null,
      address: cAddr >= 0 ? S(r[cAddr]) : null,
      hospital_type: cType >= 0 ? S(r[cType]) : null,
      open_date: cOpen >= 0 ? serialToDate(r[cOpen]) : null,
      doctor_count: cDoc >= 0 ? N(r[cDoc]) : null,
      closed_status: (cClosed >= 0 ? S(r[cClosed]) : null) ?? '정상',
      closed_month: cClosedM >= 0 ? S(r[cClosedM]) : null,
      beds_upper: cGen >= 0 ? N(r[cGen]) : null,
      beds_general: cGen >= 0 ? N(r[cGen + 1]) : null,
      icu_adult: cIcu >= 0 ? N(r[cIcu]) : null,
      icu_child: cIcu >= 0 ? N(r[cIcu + 1]) : null,
      icu_newborn: cIcu >= 0 ? N(r[cIcu + 2]) : null,
    });
  }
  return out;
}
