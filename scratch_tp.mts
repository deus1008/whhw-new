import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const REPS = ['박동수','임경봉','김윤성','김양희','이정원','이훈섭'];
// trend_prescriptions 월별 처방액(6 sales_rep) + distinct sales_rep
const cnt = new Map<string,number>(); const reps = new Set<string>(); const M=1e6;
let from=0,P=1000;
while(true){ const {data}=await sb.from('trend_prescriptions').select('prescription_month,prescription_amount,sales_rep').range(from,from+P-1); if(!data?.length)break;
  for(const r of data){ reps.add(r.sales_rep); if(REPS.includes(r.sales_rep)) cnt.set(r.prescription_month,(cnt.get(r.prescription_month)??0)+Number(r.prescription_amount??0)); }
  if(data.length<P)break; from+=P; if(from>2_000_000)break; }
console.log('trend_prescriptions sales_rep 종류:', [...reps].slice(0,30).join(', '));
console.log('\n[trend_prescriptions 6대표 처방액 백만원 월별]');
for(const m of [...cnt.keys()].sort()) console.log(`  ${m}: ${Math.round(cnt.get(m)!/M).toLocaleString()}`);
