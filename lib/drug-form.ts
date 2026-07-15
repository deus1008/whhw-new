/**
 * 제형 판정 — 정제 / 캡슐제 / 주사제 / 기타
 *
 * 1순위: 약가표 unit('정','캡슐','mL/앰플'…). '정'·'캡슐'은 unit 만으로 확정된다.
 * 2순위: 제품명. 한국 의약품명은 [브랜드][제형][함량] 순이라 제형 표기가 함량보다 앞에 온다.
 *        따라서 '끝나는 문자'가 아니라 "가장 오른쪽 제형 키워드"를 골라야 한다.
 *        예) '아주로수바스타틴정10mg' → '주'(1) vs '정'(9) → 오른쪽인 정제.
 *            '대웅세포탁심나트륨주2그램'  → '주'만 존재      → 주사제.
 *
 * 실측(drug_prices 22,189행): 정제 14,297 / 주사제 2,833 / 캡슐제 2,430 / 기타 2,629,
 * 미분류 28건(0.13%, 제형이 성분 괄호 안에만 있는 생리식염수류), 주사제 오탐 0.
 */
export type DrugForm = '정제' | '캡슐제' | '주사제' | '기타';

export const DRUG_FORMS: DrugForm[] = ['정제', '캡슐제', '주사제'];

export function formOf(unit: string | null | undefined, name: string | null | undefined): DrugForm {
  const u = String(unit ?? '').trim();
  if (/정/.test(u)) return '정제';
  if (/캡슐/.test(u)) return '캡슐제';

  const full = String(name ?? '');
  // '제품명_(규격)' 의 규격부와 (성분명) 괄호를 떼어 브랜드+제형+함량만 남긴다
  const base = full.replace(/_\(.*$/, '').replace(/\([^()]*\)/g, '');
  const cand: [DrugForm, number][] = [
    ['주사제', base.lastIndexOf('주')],
    ['정제',   base.lastIndexOf('정')],
    ['캡슐제', base.lastIndexOf('캡슐')],
  ];
  const hit = cand.filter(([, i]) => i >= 0).sort((a, b) => b[1] - a[1])[0];
  if (hit) return hit[0];

  // 브랜드명에 제형이 없고 성분 괄호에만 있는 경우(생리식염주사액 등)
  if (/프리필드|시린지|주사액|주사/.test(full)) return '주사제';
  return '기타';
}
