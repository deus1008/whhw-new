export type BrandGroup = {
  name: string;
  color: string;
  products: string[];
};

// 아주약품 주요 브랜드 그룹
export const BRAND_GROUPS: BrandGroup[] = [
  { name: '크레트롤',    color: '#60a5fa', products: ['크레트롤'] },
  { name: '안탁스',      color: '#34d399', products: ['안탁스'] },
  { name: '아나빅스',    color: '#fbbf24', products: ['아나빅스'] },
  { name: '유로박솜',    color: '#f472b6', products: ['유로박솜'] },
  { name: '도베셀',      color: '#a78bfa', products: ['도베셀'] },
  { name: '티아렌',      color: '#fb923c', products: ['티아렌'] },
];

// 신제품
export const NEW_PRODUCTS: BrandGroup[] = [
  { name: '자티놀',      color: '#60a5fa', products: ['자티놀'] },
  { name: '미가론',      color: '#34d399', products: ['미가론'] },
  { name: '엠파릴 듀오', color: '#fbbf24', products: ['엠파릴'] },
  { name: '피타렛',      color: '#f472b6', products: ['피타렛'] },
  { name: '유스펜',      color: '#a78bfa', products: ['유스펜'] },
];
