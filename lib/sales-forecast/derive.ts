/**
 * SF 파생 계산 — 결정론적. 샘플 엑셀 수식을 그대로 옮긴다.
 *   순공급가 net = 약가/1.1 × 계수(0.93)              (미가론 C2 = 324/1.1*0.93)
 *   정 수량   = 금액 / net                              (미가론 C7=C8, 피나 C4=C5/700)
 *   박스수    = 정 수량 / 포장(정/박스)                (미가론 C7=C8/30)
 *   성장률    = (당년-전년)/전년                        (미가론 R14, 피나 R6)
 *   마진      = 금액 × (1 - 원가율 - 수수료율)
 *   회수기간  = 누적 마진이 개발비에 도달하는 연차(보간)
 */
import type { ForecastPlan, ForecastYear, DerivedYear } from './types';

/** 순공급가(원). 약가에 부가세(÷1.1)와 할인계수를 적용 */
export function netPrice(insurancePrice: number, factor: number): number {
  if (!insurancePrice || insurancePrice <= 0) return 0;
  return (insurancePrice / 1.1) * (factor || 0.93);
}

/** 연도별 금액 → 정/박스/마진/성장률 파생 */
export function deriveYears(years: ForecastYear[], plan: ForecastPlan): DerivedYear[] {
  const net = netPrice(plan.insurancePrice, plan.priceFactor);
  const marginRate = Math.max(0, 1 - (plan.costRatio || 0) - (plan.commissionRate || 0));
  const sorted = [...years].sort((a, b) => a.y - b.y);

  return sorted.map((yr, i) => {
    const prev = i > 0 ? sorted[i - 1].amount : null;
    const growth = prev && prev > 0 ? (yr.amount - prev) / prev : null;
    const tablets = net > 0 ? yr.amount / net : 0;
    const boxesByPack: Record<string, number> = {};
    for (const p of plan.packUnits) {
      boxesByPack[p.label] = p.tabsPerBox > 0 ? tablets / p.tabsPerBox : 0;
    }
    return {
      y: yr.y,
      amount: yr.amount,
      growth,
      tablets,
      boxesByPack,
      grossProfit: yr.amount * marginRate,
    };
  });
}

/** 성장률 체인으로 금액 전개: y1 + [g2,g3,...] → 금액 배열 */
export function growthChain(y1amount: number, growths: (number | null)[]): number[] {
  const out = [y1amount];
  for (let i = 1; i < growths.length; i++) {
    const g = growths[i] ?? 0;
    out.push(out[i - 1] * (1 + g));
  }
  return out;
}

/**
 * 기존 품목 처방트렌드 자동산출 — 과거 연도별 처방금액에서 다음 horizon년을 추정한다.
 * 성장률은 과거 CAGR을 기준으로 하되, 성숙에 따라 매년 둔화(taper 0.85)한다.
 *   1Y = 최신 실적연도 × (1+g), 2Y = 1Y × (1+g·0.85), …
 * 성장률이 없으면(단일 연도 등) 최근 YoY, 그것도 없으면 보합(0).
 */
export function trendForecast(
  amountByYear: Record<string, number>, years: string[], cagr: number | null, horizon = 5,
): ForecastYear[] {
  const latest = years[years.length - 1];
  const base = amountByYear[latest] ?? 0;
  // 성장률 기준: CAGR 우선, 없으면 최근 2개년 YoY
  let g0 = cagr;
  if (g0 == null && years.length >= 2) {
    const p = amountByYear[years[years.length - 2]] ?? 0;
    g0 = p > 0 ? (base - p) / p : 0;
  }
  g0 = g0 ?? 0;
  const out: ForecastYear[] = [];
  let prev = base;
  for (let i = 1; i <= horizon; i++) {
    const g = g0 * Math.pow(0.85, i - 1);
    const amount = Math.max(0, Math.round(prev * (1 + g)));
    out.push({ y: i, amount, growth: i === 1 ? null : g });
    prev = amount;
  }
  return out;
}

/**
 * 개발비 회수기간(년). 누적 마진이 개발비에 도달하는 연차를 선형 보간.
 * 5년 내 미도달이면 null.
 */
export function paybackPeriod(devCost: number | null, derived: DerivedYear[]): number | null {
  if (!devCost || devCost <= 0) return 0;
  let cum = 0;
  for (let i = 0; i < derived.length; i++) {
    const before = cum;
    cum += derived[i].grossProfit;
    if (cum >= devCost) {
      const need = devCost - before;
      const frac = derived[i].grossProfit > 0 ? need / derived[i].grossProfit : 0;
      return derived[i].y - 1 + frac; // 예: 2.4년
    }
  }
  return null; // 기간 내 미회수
}
