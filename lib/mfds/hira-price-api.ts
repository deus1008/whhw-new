// HIRA(건강보험심사평가원) 약가기준정보 API — 약가표(drug_prices) 갱신용
//   getDgamtList: 제품코드(mdsCd) 프리픽스로 전량 조회 가능(무param은 0건).
//   코드는 6·0·9 프리픽스에 분포. 코드별 최신(적용시작일 adtStaDd)만 채택하고
//   활성(삭제 제외 · 상한가>0)만 남긴다. 성분명은 API에 없으므로 호출측에서
//   기존 파일 성분명을 item_code 기준으로 보존한다.

const KEY = () => process.env.HIRA_API_KEY ?? process.env.DRUG_API_KEY ?? '';
const BASE = 'https://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
const PREFIXES = ['6', '0', '9', '1', '2', '3', '4', '5', '7', '8']; // 데이터 있는 6·0·9 우선, 나머지 방어
const PAGE = 9999;

export type HiraPrice = {
  item_code: string;         // mdsCd (9자리 제품코드)
  item_name: string;         // itmNm
  ingredient_name: string;   // itmNm 괄호에서 추출(있을 때만)
  max_price: number;         // mxCprc
  pay_type: string;          // payTpNm
  unit: string;              // unit
  standard: string;          // nomNm
  effective_date: string;    // adtStaDd (YYYYMMDD)
  manufacturer: string;      // mnfEntpNm
};

function parseItems(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const obj: Record<string, string> = {};
    for (const t of m[1].matchAll(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g)) obj[t[1]] = t[2].trim();
    out.push(obj);
  }
  return out;
}

// "글리원정2밀리그램(글리메피리드)_(2mg/1정)" → "글리메피리드" (성분 괄호가 있을 때만)
export function extractIngredient(itmNm: string): string {
  const m = itmNm.match(/\(([^)]+)\)_\(/);
  return m ? m[1].trim() : '';
}

/** 활성 약가 전량 수집(코드별 최신). */
export async function fetchAllHiraPrices(): Promise<HiraPrice[]> {
  // mdsCd → 최신 레코드
  const latest = new Map<string, Record<string, string>>();
  for (const pfx of PREFIXES) {
    let total = -1;
    for (let page = 1; page <= 20; page++) {
      const params = new URLSearchParams({ serviceKey: KEY(), numOfRows: String(PAGE), pageNo: String(page), mdsCd: pfx });
      const res = await fetch(`${BASE}?${params}`);
      const xml = await res.text();
      if (total < 0) { const t = xml.match(/<totalCount>(\d+)<\/totalCount>/); total = t ? Number(t[1]) : 0; }
      if (total === 0) break;
      const items = parseItems(xml);
      for (const r of items) {
        const code = r.mdsCd;
        if (!code) continue;
        const prev = latest.get(code);
        if (!prev || String(r.adtStaDd || '') > String(prev.adtStaDd || '')) latest.set(code, r);
      }
      if (page * PAGE >= total || items.length === 0) break;
    }
  }

  const out: HiraPrice[] = [];
  for (const r of latest.values()) {
    if (r.payTpNm === '삭제') continue;           // 최신상태가 삭제면 제외
    const price = Number(r.mxCprc || 0);
    if (!(price > 0)) continue;                     // 상한가 없는(비급여 등) 항목 제외
    out.push({
      item_code:       r.mdsCd,
      item_name:       r.itmNm || '',
      ingredient_name: extractIngredient(r.itmNm || ''),
      max_price:       price,
      pay_type:        r.spcGnlTpNm || '',   // 전문/일반 (기존 drug_prices.pay_type 의미와 일치)
      unit:            r.unit || '',
      standard:        r.nomNm || '',
      effective_date:  r.adtStaDd || '',
      manufacturer:    r.mnfEntpNm || '',
    });
  }
  return out;
}
