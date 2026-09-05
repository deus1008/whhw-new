// 한국 주소 문자열 → 시도(region) / 시군구(sub_region) 파싱.
// 거래처현황(customer_status)에 시도/시군구 컬럼이 없을 때 주소에서 보강한다.

export const KOREAN_SIDO = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const;

const SIDO_MAP: Record<string, string> = {
  '서울': '서울', '서울특별시': '서울', '서울시': '서울',
  '부산': '부산', '부산광역시': '부산', '부산시': '부산',
  '대구': '대구', '대구광역시': '대구', '대구시': '대구',
  '인천': '인천', '인천광역시': '인천', '인천시': '인천',
  '광주': '광주', '광주광역시': '광주', '광주시': '광주',
  '대전': '대전', '대전광역시': '대전', '대전시': '대전',
  '울산': '울산', '울산광역시': '울산', '울산시': '울산',
  '세종': '세종', '세종특별자치시': '세종', '세종시': '세종',
  '경기': '경기', '경기도': '경기',
  '강원': '강원', '강원도': '강원', '강원특별자치도': '강원',
  '충북': '충북', '충청북도': '충북',
  '충남': '충남', '충청남도': '충남',
  '전북': '전북', '전라북도': '전북', '전북특별자치도': '전북',
  '전남': '전남', '전라남도': '전남',
  '경북': '경북', '경상북도': '경북',
  '경남': '경남', '경상남도': '경남',
  '제주': '제주', '제주도': '제주', '제주특별자치도': '제주',
};

/** 주소 → { region: 시도(약칭), sub: 시군구 } */
export function parseKoreanRegion(address: string | null | undefined): { region: string | null; sub: string | null } {
  if (!address) return { region: null, sub: null };
  const a = String(address).replace(/[,()（）]/g, ' ').trim();
  const toks = a.split(/\s+/).filter(Boolean);
  if (!toks.length) return { region: null, sub: null };

  // 시도
  let region = SIDO_MAP[toks[0]] ?? null;
  if (!region) {
    for (const [k, v] of Object.entries(SIDO_MAP)) {
      if (toks[0].startsWith(k)) { region = v; break; }
    }
  }

  // 시군구 (첫 시/군/구 토큰; '용인시 기흥구'처럼 시+구는 합쳐서)
  let sub: string | null = null;
  for (let i = 1; i < Math.min(toks.length, 4); i++) {
    if (/[시군구]$/.test(toks[i])) {
      sub = toks[i];
      if (/시$/.test(toks[i]) && toks[i + 1] && /구$/.test(toks[i + 1])) sub = `${toks[i]} ${toks[i + 1]}`;
      break;
    }
  }
  return { region, sub };
}
