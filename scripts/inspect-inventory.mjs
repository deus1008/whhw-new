import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const path = String.raw`C:\Users\user\OneDrive - 아주헬스케어그룹\아주약품\월별재고_25.04-26.05.xlsx`;
const buf  = readFileSync(path);
const wb   = XLSX.read(buf, { type: 'buffer', cellFormula: false, cellHTML: false, cellNF: false });
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

console.log('전체 행수:', rows.length);

// 연도+기간 조합 카운트
const periods = new Map();
for (const r of rows) {
  const key = `${r['현재 기간 연도']}년 ${r['현재 기간']}월`;
  periods.set(key, (periods.get(key) ?? 0) + 1);
}
console.log('\n기간별 행수:');
[...periods.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .forEach(([k, v]) => console.log(`  ${k}: ${v}행`));

// 대상 저장위치 행수
const ALLOWED = new Set([
  '평택 고형제1동 제품','평택 고형제2동 제품','평택 주사제 제품',
  '평택 제상품(상온/실온)','평택 제상품(냉장)','피코 제상품(일반)','피코 제상품(냉장)',
]);
const filtered = rows.filter(r => ALLOWED.has(r['저장위치 내역']));
console.log(`\n대상 저장위치 해당 행수: ${filtered.length} / ${rows.length}`);

// 집계 후 예상 DB 행수
const agg = new Set(
  filtered.map(r => `${r['현재 기간 연도']}|${r['현재 기간']}|${r['자재']}`)
);
console.log(`집계 후 DB 예상 행수: ${agg.size}`);
