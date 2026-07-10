// 병원명 접미사 기반 hospital_type 추정
// 정산(commission_settlements) 마스터에 없는 병원의 폴백 분류에 사용.
// 가장 구체적인 접미사부터 검사(치과의원 → 의원보다 우선).
const SUFFIX_RULES: [string, string][] = [
  ['치과의원', '치과의원'],
  ['한의원',   '한의원'],
  ['요양병원', '요양병원'],
  ['한방병원', '한방병원'],
  ['치과병원', '치과병원'],
  ['정신병원', '정신병원'],
  ['종합병원', '종합병원'],
  ['보건의료원', '보건의료원'],
  ['보건진료소', '보건진료소'],
  ['보건지소', '보건지소'],
  ['보건소',   '보건소'],
  ['약국',     '약국'],
];

/** 병원명에서 hospital_type 추정. 판별 불가(도매상·약품회사 등)면 null. */
export function inferHospitalType(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = String(name).trim();
  for (const [suf, type] of SUFFIX_RULES) if (n.endsWith(suf)) return type;
  if (n.endsWith('의원')) return '의원';
  if (n.endsWith('병원')) return '병원';
  return null;
}
