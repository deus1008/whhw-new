/* Sales Forecast 공용 타입 */

/** 시장 landscape의 제품 1개 (동일 성분+함량 경쟁품목) */
export type MarketProduct = {
  product_name: string;
  manufacturer: string | null;
  insurance_code: string | null;  // 대표 보험코드(기존품목 SF 실적매칭용)
  price: number | null;          // 약가(drug_prices.max_price)
  commission_rate: number | null; // 0~1
  is_reference: boolean;          // 대조약(오리지날) 여부
  amountByYear: Record<string, number>; // { '2025': 123.4(억원? → 원 그대로), ... }
  total: number;                  // 전체 기간 합(정렬용)
  share: number | null;          // 최신년 기준 점유율 0~1
  cagr: number | null;           // 가용연수 CAGR
};

export type MarketData = {
  ingredientKey: string;
  years: string[];                       // ['2021'..'2026'] 오름차순
  partialYears: string[];                // 월 커버리지<12라 연환산한 연도(표시 시 * )
  products: MarketProduct[];
  marketTotalByYear: Record<string, number>;
  referenceShare: number | null;         // 대조약 합산 점유율(최신년)
  avgCommission: number | null;          // 처방액 가중 평균 요율(0~1)
  hasQuantity: boolean;                  // prescription_count 보유 여부
  note?: string;
};

/** 당사 계획 입력 */
export type ForecastPlan = {
  launchPrice: number;      // 발매예상약가(원)
  insurancePrice: number;   // 약가(원)
  priceFactor: number;      // 순공급가 계수(기본 0.93)
  costRatio: number;        // 원가율 0~1
  commissionRate: number;   // 수수료율 0~1
  packUnits: { label: string; tabsPerBox: number }[];
  manufacturingLot: number | null;
  devCost: number | null;   // 개발비(원)
};

/** 연도별 예측 1행 */
export type ForecastYear = {
  y: number;              // 1..5
  amount: number;         // 처방금액(원)
  growth: number | null;  // 전년 대비(첫 해 null)
};

/** AI 제안 결과 */
export type ForecastProposal = {
  years: ForecastYear[];
  rationale: string;
  assumptions: {
    achievableShare: number | null;   // 목표 점유율 0~1
    referenceExcluded: boolean;       // 대조약 점유 제외 반영 여부
    priceBandAvgRate: number | null;  // 유사약가 구간 평균요율
  };
};

/** derive: 연도별 파생 수치 */
export type DerivedYear = {
  y: number;
  amount: number;
  growth: number | null;
  tablets: number;                     // 정 수량 = amount / netPrice
  boxesByPack: Record<string, number>; // 포장라벨 → 박스수
  grossProfit: number;                 // 마진 = amount × (1 - costRatio - commissionRate)
};
