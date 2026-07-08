/** 숫자에 천 단위 콤마를 추가합니다. null/undefined/NaN은 '—'를 반환합니다. */
export function fmtNum(value: number | string | null | undefined, decimals = 0): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
  if (isNaN(n)) return '—';
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 거래처명에서 불필요한 법인 표기를 제거합니다.
 * "(주)", "주식회사" (앞/뒤 모두)
 */
export function stripCompanyAffix(name: string): string {
  if (!name) return name;
  return name
    .replace(/^\s*주식회사\s+/g, '')
    .replace(/\s+주식회사\s*$/g, '')
    .replace(/^주식회사(?=[^\s])/g, '')   // "주식회사한국" → "한국"
    .replace(/(?<=[^\s])주식회사$/g, '')   // "한국주식회사" → "한국"
    .replace(/^\s*\(주\)\s*/g, '')
    .replace(/\s*\(주\)\s*$/g, '')
    .trim();
}
