/**
 * AI 예측 제안 — 시장 landscape + 당사 계획을 근거로 1~5년 매출을 제안.
 * 샘플의 '제품전략실 의견'처럼 근거 서술을 함께 낸다.
 * AI는 가정(achievable share·성장률)과 근거만 내고, 수치 전개·파생은 derive.ts가 담당(재현성).
 *
 * Anthropic fetch 패턴은 lib/competitor/classify.ts, lib/ingredient-info/build.ts 와 동일.
 */
import type { MarketData, ForecastPlan, ForecastProposal } from './types';

const 억 = (n: number) => (n / 1e8).toFixed(1);

function marketBrief(market: MarketData, plan: ForecastPlan): string {
  const { years, marketTotalByYear, products, referenceShare, avgCommission } = market;
  const latest = years[years.length - 1];
  const totalLine = years.map(y => `${y}: ${억(marketTotalByYear[y] ?? 0)}억`).join(' / ');

  // 유사약가 구간(발매약가 ±20%) peer
  const lo = plan.launchPrice * 0.8, hi = plan.launchPrice * 1.2;
  const peers = products.filter(p => p.price != null && p.price >= lo && p.price <= hi);
  const top = products.slice(0, 8).map((p, i) =>
    `${i + 1}. ${p.product_name}(${p.manufacturer ?? '-'}) 약가 ${p.price ?? '-'} / ${latest}년 ${억(p.amountByYear[latest] ?? 0)}억`
    + `${p.share != null ? ` / Share ${(p.share * 100).toFixed(1)}%` : ''}`
    + `${p.is_reference ? ' [대조약]' : ''}`
    + `${p.commission_rate != null ? ` / 요율 ${(p.commission_rate * 100).toFixed(0)}%` : ''}`,
  ).join('\n');

  return [
    `[시장 총 처방금액 추이] ${totalLine}`,
    referenceShare != null ? `[대조약(오리지날) 합산 점유율] ${(referenceShare * 100).toFixed(1)}% (제네릭 addressable 시장에서 제외 고려)` : '',
    avgCommission != null ? `[시장 처방액 가중 평균 수수료율] ${(avgCommission * 100).toFixed(1)}%` : '',
    peers.length ? `[유사약가(${Math.round(lo)}~${Math.round(hi)}원) 경쟁사 ${peers.length}곳] 평균요율 ${peers.filter(p => p.commission_rate != null).length ? (peers.reduce((s, p) => s + (p.commission_rate ?? 0), 0) / peers.filter(p => p.commission_rate != null).length * 100).toFixed(0) + '%' : '-'}` : '',
    `[상위 경쟁품목]\n${top}`,
    `[당사 계획] 발매예상약가 ${plan.launchPrice}원 / 수수료율 ${(plan.commissionRate * 100).toFixed(0)}% / 원가율 ${(plan.costRatio * 100).toFixed(0)}%`,
  ].filter(Boolean).join('\n');
}

const SYS =
  '당신은 국내 제약 판매대행사의 제품전략 담당자입니다. 후발 제네릭 품목의 5개년 Sales Forecast(매출예측)를 ' +
  '보수적이고 근거 있게 제안합니다. 판단 원칙: ' +
  '① 대조약(오리지날) 점유율은 제네릭이 뺏기 어려우므로 addressable 시장에서 제외한다. ' +
  '② 후발주자는 이미 자리잡은 선발 제네릭보다 낮은 초기 점유율에서 시작한다. ' +
  '③ 1년차는 부분 발매(발매 시점)라 연 환산보다 낮게 잡는다. ' +
  '④ 성장률은 초기 높고 점차 둔화(예: 30%→20%→15%→12%)한다. ' +
  '과도하게 공격적인 수치를 경계하고, 시장 데이터에 없는 사실을 지어내지 않습니다.';

export async function proposeForecast(
  market: MarketData, plan: ForecastPlan, apiKey: string,
): Promise<ForecastProposal | null> {
  const brief = marketBrief(market, plan);
  const user =
    `${brief}\n\n` +
    '위 시장 데이터를 근거로 당사 후발 제네릭의 1~5년차 처방금액(원)을 제안하세요. ' +
    '1년차 achievable 금액과 이후 성장률을 정하고, 근거를 3~5문장으로 서술하세요.\n' +
    'JSON 으로만 답하세요: {"y1_amount": 정수(원), "growths": [null, 0.3, 0.2, 0.15, 0.12], ' +
    '"rationale": "근거 서술", "achievable_share": 0~1 또는 null, "reference_excluded": true/false, "price_band_avg_rate": 0~1 또는 null}';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 1200, system: SYS,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const text = j?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? j?.content?.[0]?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const y1 = Number(o.y1_amount);
    if (!Number.isFinite(y1) || y1 <= 0) return null;
    const growthsRaw: (number | null)[] = Array.isArray(o.growths) ? o.growths : [null, 0.3, 0.2, 0.15, 0.12];
    const growths = [null, ...growthsRaw.slice(1, 5).map((g: unknown) => (g == null ? 0 : Number(g)))];
    while (growths.length < 5) growths.push(0);
    // 성장률 체인으로 금액 전개
    const amounts = [y1];
    for (let i = 1; i < 5; i++) amounts.push(Math.round(amounts[i - 1] * (1 + (growths[i] ?? 0))));
    const years = amounts.map((amount, i) => ({
      y: i + 1, amount: Math.round(amount), growth: i === 0 ? null : (growths[i] ?? 0),
    }));
    return {
      years,
      rationale: String(o.rationale ?? '').trim(),
      assumptions: {
        achievableShare: o.achievable_share != null ? Number(o.achievable_share) : null,
        referenceExcluded: o.reference_excluded === true,
        priceBandAvgRate: o.price_band_avg_rate != null ? Number(o.price_band_avg_rate) : null,
      },
    };
  } catch { return null; }
}
