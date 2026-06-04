/**
 * 약가 Excel/CSV 파일 파싱 공유 유틸리티
 * - drug-prices API route
 * - documents process route (약가 폴더 자동 처리)
 * 양쪽에서 공통으로 사용합니다.
 */
import * as XLSX from 'xlsx';

/* ── 컬럼명 정규화 ── */
export function normalizeKey(k: string): string {
  return String(k).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ── 컬럼명 매핑 ── */
export const COL_MAP: Record<string, string> = {
  '품목명': 'item_name', '품명': 'item_name', '제품명': 'item_name',
  'itmNm': 'item_name', 'ITEM_NAME': 'item_name',
  '상한가': 'max_price', '최고상한가': 'max_price', '최고상한금액': 'max_price',
  '상한금액': 'max_price', '상한금액표 금액': 'max_price',
  'mxCprc': 'max_price', 'MX_CPRC': 'max_price',
  '급여구분': 'pay_type', '급여유형': 'pay_type', '급여구분명': 'pay_type',
  '전일': 'pay_type', '전문일반': 'pay_type',
  'payTpNm': 'pay_type', 'PAY_TP_NM': 'pay_type',
  '규격': 'standard', '규격명': 'standard', '제형규격명': 'standard',
  'nomNm': 'standard', 'NOM_NM': 'standard',
  '단위': 'unit', 'unit': 'unit', 'UNIT': 'unit',
  '시행일': 'effective_date', '시행년월일': 'effective_date', '적용시작일': 'effective_date',
  '적용일자': 'effective_date', 'adtStaDd': 'effective_date', 'ADT_STA_DD': 'effective_date',
  '제조업체': 'manufacturer', '제조업체명': 'manufacturer', '제조사': 'manufacturer',
  '업체명': 'manufacturer', '제약사': 'manufacturer',
  'mnfEntpNm': 'manufacturer', 'MNF_ENTP_NM': 'manufacturer',
  '코드': 'item_code', '품목코드': 'item_code', '품목번호': 'item_code',
  '제품코드': 'item_code', '주성분코드': 'item_code',
  '주성분명': 'ingredient_name', '성분명': 'ingredient_name',
  'ingrName': 'ingredient_name', 'INGR_NAME': 'ingredient_name',
};

export type DrugPriceRow = Record<string, unknown> & { source_file: string };

export type ParseResult = {
  rows:  DrugPriceRow[];
  total: number;
  error?: string;
};

/**
 * Buffer(Excel/CSV) → drug_prices 삽입용 행 배열 변환
 * @param buffer  파일 버퍼
 * @param fileName source_file 컬럼에 기록할 파일명
 */
export function parseDrugPriceBuffer(buffer: Buffer, fileName: string): ParseResult {
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, {
      type:        'buffer',
      cellFormula: false,
      cellHTML:    false,
      cellNF:      false,
      cellText:    false,
      cellDates:   false,
      sheetStubs:  false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  } catch {
    return { rows: [], total: 0, error: 'Excel/CSV 파싱에 실패했습니다.' };
  }

  if (rawRows.length === 0) {
    return { rows: [], total: 0, error: '데이터가 없습니다.' };
  }

  /* 컬럼 매핑 */
  const colMapping: Record<string, string> = {};
  for (const rawKey of Object.keys(rawRows[0])) {
    const normalized = normalizeKey(rawKey);
    if (COL_MAP[normalized]) colMapping[rawKey] = COL_MAP[normalized];
  }

  if (!Object.values(colMapping).includes('item_name')) {
    const detected = Object.keys(rawRows[0]).map(normalizeKey).join(', ');
    return {
      rows:  [],
      total: rawRows.length,
      error: `품목명 컬럼을 찾을 수 없습니다. 감지된 컬럼: [${detected}]`,
    };
  }

  /* 행 변환 */
  const rows = rawRows
    .map(row => {
      const out: Record<string, unknown> = { source_file: fileName };
      for (const [rawKey, mappedKey] of Object.entries(colMapping)) {
        const val = String(row[rawKey] ?? '').trim();
        if (mappedKey === 'max_price') {
          out[mappedKey] = val ? (parseInt(val.replace(/,/g, ''), 10) || null) : null;
        } else {
          out[mappedKey] = val || null;
        }
      }
      return out as DrugPriceRow;
    })
    .filter(r => r.item_name);

  return { rows, total: rawRows.length };
}
