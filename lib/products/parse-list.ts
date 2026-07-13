// 위탁품목리스트 엑셀 파서 (페이지 폴백 + 업로드 저장 공용)
import XLSX from 'xlsx';
import { toInsuranceCode } from './insurance-code';

export type ParsedProduct = {
  no:                  number;
  representative_code: string;  // 원본 대표코드(13자리)
  insurance_code:      string;  // 추출된 보험코드(9자리)
  product_name:        string;
  ingredient_name:     string;
  commission_rate:     number;
  distribution:        string;  // 유통중 | 유통중단 | 유통예정
  note:                string;
};

/** 위탁품목리스트 엑셀 버퍼 → 제품 행 배열 (보험코드 포함) */
export function parseProductListBuffer(buf: Buffer): ParsedProduct[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  // 헤더 행 탐색: NO 또는 품목명이 있는 행
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, all.length); i++) {
    const row = (all[i] as unknown[]).map(c => String(c).trim());
    if (row.includes('NO') || row.includes('품목명')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];

  const hdr   = (all[headerIdx] as unknown[]).map(c => String(c).trim());
  const iNo   = hdr.findIndex(h => h === 'NO');
  const iCode = hdr.findIndex(h => h === '대표코드' || h === '보험코드');
  const iName = hdr.findIndex(h => h === '품목명');
  const iIngr = hdr.findIndex(h => h === '성분명');
  const iRate = hdr.findIndex(h => h === '수수료율');
  const iDist = hdr.findIndex(h => h === '유통여부');
  const iNote = hdr.findIndex(h => h === '참고사항');

  const rows: ParsedProduct[] = [];
  for (let r = headerIdx + 1; r < all.length; r++) {
    const row = all[r] as unknown[];
    const name = String(row[iName] ?? '').trim();
    if (!name) continue;
    const rawCode = iCode >= 0 ? String(row[iCode] ?? '').trim() : '';
    rows.push({
      no:                  iNo   >= 0 ? Number(row[iNo]) : r - headerIdx,
      representative_code: rawCode,
      insurance_code:      toInsuranceCode(rawCode),
      product_name:        name,
      ingredient_name:     iIngr >= 0 ? String(row[iIngr] ?? '').trim() : '',
      commission_rate:     iRate >= 0 ? Number(row[iRate] ?? 0) : 0,
      distribution:        iDist >= 0 ? String(row[iDist] ?? '').trim() : '',
      note:                iNote >= 0 ? String(row[iNote] ?? '').trim() : '',
    });
  }
  return rows;
}
