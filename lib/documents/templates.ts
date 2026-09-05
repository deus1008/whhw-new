// 문서관리 폴더(카테고리)별 표준 업로드 양식.
// 잘못된 파일 업로드를 방지하기 위해, 각 카테고리의 표준 헤더가 담긴 파일을 내려받아
// 데이터를 채워 다시 업로드하도록 안내한다.
// - headers: 표준 헤더(1행)
// - example: 예시 데이터 1행(선택)
// - note: 작성 안내
// - external: 외부(식약처·심평원·Ubist 등) 다운로드 원본 파일 → 헤더 확인용(수기 작성 아님)

export type DocTemplate = {
  category: string;
  label: string;
  headers: string[];
  example?: (string | number)[];
  note: string;
  external?: boolean;
  /** 업로드 사전 검증용 필수 컬럼(그룹별 동의어 중 하나라도 있으면 통과) */
  required?: { label: string; kw: string[] }[];
};

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    category: '거래처현황', label: '거래처현황(재위탁현황)',
    headers: ['거래처명', '사업자등록번호', '종별', '시도', '시군구', '주소', '전화번호', '담당사원명', '담당자(CSO)', '담당자이메일', '비고'],
    example: ['○○약품', '123-45-67890', '2차', '경기', '용인시 기흥구', '경기도 용인시 기흥구 동백중앙로 191', '031-000-0000', '홍길동', '김담당', 'sample@example.com', ''],
    note: '거래처(CSO법인·딜러) 목록. 시도/시군구가 없으면 주소에서 자동 보강됩니다. 거래처명은 필수.',
    required: [{ label: '거래처명', kw: ['cso명', '거래처명', '업체명', '기관명', '병원명', '약국명', '요양기관명', '상호', '법인명', '1차'] }],
  },
  {
    category: '수수료율', label: '수수료율',
    headers: ['제약사명', '품목명', '보험코드', '기본요율'],
    example: ['○○제약', '○○정 10mg', '640000000', '0.45'],
    note: '제약사·품목별 기본 수수료율. 요율은 소수(0.45) 또는 % 없이 숫자로. 제약사명·요율 필수.',
    required: [
      { label: '제약사/업체명', kw: ['제약사명', '제약사', '업체명', '회사명', '제조사', '거래처명', '행레이블'] },
      { label: '요율', kw: ['기본요율', '수수료율', '수수료', '요율', 'rate', 'commission', '비율'] },
    ],
  },
  {
    category: '수수료정산', label: '수수료정산',
    headers: ['정산월', '내부담당자', '담당CSO', '처방처명', '품목명', '승인수량', 'T당단가', '처방금액', '종별구분', '수수료율', '정산액', '보험코드'],
    example: ['2026-08', '김내부', '○○메디', '○○병원', '○○정 10mg', '1000', '120', '120000', '종합병원', '0.45', '54000', '640000000'],
    note: '월별 처방·정산 내역. 정산월(YYYY-MM)·처방처명·품목명·처방금액 필수.',
    required: [
      { label: '처방처명', kw: ['처방처명', '처방처', '병원명', '요양기관명'] },
      { label: '품목명', kw: ['품목명', '제품명', '품명', 'item'] },
      { label: '처방금액', kw: ['처방금액', '처방액', '처방총액'] },
    ],
  },
  {
    category: 'EDI', label: 'EDI현황조회(처방실적)',
    headers: ['처방처명', '품목명', '담당자', '담당CSO', '보험코드', '대표코드', '처방금액'],
    example: ['○○병원', '○○정 10mg', '김담당', '○○메디', '640000000', '640000000000', '120000'],
    note: 'EDI 처방실적. 처방처명·품목명·처방금액은 반드시 실제 값이어야 합니다(처방처명이 숫자면 업로드가 거부됩니다). 파일명에 연월(2026-08 등)을 포함하세요. Ubist 파일은 이 폴더에 올리지 마세요.',
    required: [
      { label: '처방처명', kw: ['처방처명', '처방처', '요양기관명', '거래처명', '기관명', '병원명', '의원명'] },
      { label: '품목명', kw: ['품목명', '약품명', '제품명', '의약품명', '품목'] },
      { label: '처방금액', kw: ['처방금액', '처방액', '청구금액', '약품금액', '총금액', '청구액', '금액'] },
    ],
  },
  {
    category: '위탁품목리스트', label: '위탁품목리스트',
    headers: ['NO', '대표코드', '품목명', '성분명'],
    example: ['1', '640000000000', '○○정 10mg', 'metformin'],
    note: '위탁 품목 마스터. 업로드 시 전체 교체됩니다. 품목명 필수, 대표코드로 보험코드가 산출됩니다.',
    required: [{ label: '품목명', kw: ['품목명'] }],
  },
  {
    category: '재고현황', label: '재고현황(품절)',
    headers: ['구분', '제품코드', '제품명', '품목구분', '종합병원', '직3매출', '당월매출', '재고', '재고일', '품절시작일', '공급예정일', '품절일수', '제조처', '발생유형'],
    note: '품절/재고 현황. 제품명·재고 관련 컬럼을 채워 업로드하세요.',
    required: [{ label: '제품명', kw: ['제품명', '품목명', '품명'] }],
  },
  {
    category: '약가', label: '약가(심평원)',
    headers: ['품목명', '품목코드', '주성분명', '규격', '단위', '급여구분', '상한가', '시행일', '제조업체'],
    note: '심평원 약가파일. 보통 원본 그대로 업로드하며, 헤더 확인용으로 사용하세요.',
    external: true,
    required: [
      { label: '품목명', kw: ['품목명', '품명', '제품명', 'itmnm', 'item_name'] },
      { label: '상한가', kw: ['상한가', '최고상한가', '상한금액', 'mxcprc'] },
    ],
  },
  {
    category: '허가현황', label: '허가현황(식약처)',
    headers: ['품목명', '업체명', '주성분', '허가일자', '품목기준코드'],
    note: '식약처 허가 원부. 외부 다운로드 원본 그대로 업로드하세요(헤더 확인용).',
    external: true,
    required: [{ label: '품목명', kw: ['품목명', '제품명', '품명'] }],
  },
  {
    category: 'Ubist', label: 'Ubist(외부)',
    headers: ['성분명', '제품명', '진료과', '대표코드', '처방금액'],
    note: 'Ubist 시스템 다운로드 원본. EDI 폴더가 아닌 Ubist 폴더에 업로드하세요(헤더 확인용).',
    external: true,
    required: [{ label: '제품/성분명', kw: ['제품명', '성분명', '품목명', '주성분명'] }],
  },
  {
    category: '생동품목', label: '생동품목(식약처)',
    headers: ['품목명', '업체명', '주성분', '생동시험'],
    note: '식약처 생동 원본. 외부 다운로드 원본 그대로 업로드하세요(헤더 확인용).',
    external: true,
    required: [{ label: '품목명', kw: ['품목명', '제품명'] }],
  },
  {
    category: '원료DMF', label: '원료DMF(식약처)',
    headers: ['성분명', '제조원', '국가', '등록일'],
    note: '식약처 DMF 원본. 외부 다운로드 원본 그대로 업로드하세요(헤더 확인용).',
    external: true,
    required: [{ label: '성분명', kw: ['성분명', '주성분', '원료명'] }],
  },
  {
    category: '병의원마스터', label: '병의원마스터(심평원)',
    headers: ['처방처코드', '처방처명', '종별', '시도', '구군', '주소', '개설일자'],
    note: '심평원 의료기관 원본. 외부 다운로드 원본 그대로 업로드하세요(헤더 확인용).',
    external: true,
    required: [
      { label: '처방처코드', kw: ['처방처코드', '요양기관기호', '암호화요양기호'] },
      { label: '처방처명', kw: ['처방처명', '요양기관명', '기관명'] },
    ],
  },
];

/** 헤더 정규화(파서와 동일 규칙) */
const normH = (s: unknown) => String(s ?? '').replace(/[\s_\-.()（）]/g, '').toLowerCase();

/**
 * 파일의 행 그리드(2차원 배열)에서 표준양식 필수 컬럼이 있는지 검사.
 * 제목행/멀티헤더 대비 상위 20행을 스캔해 가장 잘 맞는 행 기준으로 판정.
 */
export function validateHeaderGrid(grid: unknown[][], tpl: DocTemplate): { ok: boolean; missing: string[] } {
  const req = tpl.required ?? [];
  if (req.length === 0) return { ok: true, missing: [] };
  let best: string[] = req.map(r => r.label);
  const scan = Math.min(grid.length, 20);
  for (let i = 0; i < scan; i++) {
    const cells = (grid[i] ?? []).map(normH).filter(Boolean);
    if (!cells.length) continue;
    const missing: string[] = [];
    for (const g of req) {
      const hit = g.kw.some(k => {
        const nk = normH(k);
        return cells.some(c => c === nk || c.includes(nk) || (nk.includes(c) && c.length >= 2));
      });
      if (!hit) missing.push(g.label);
    }
    if (missing.length < best.length) best = missing;
    if (best.length === 0) break;
  }
  return { ok: best.length === 0, missing: best };
}

export function findTemplate(category: string | null | undefined): DocTemplate | undefined {
  if (!category) return undefined;
  return DOC_TEMPLATES.find(t => t.category === category);
}
