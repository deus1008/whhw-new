import { createClient } from '@supabase/supabase-js'; import fs from 'fs';
import { parseUbistBuffer } from './lib/ubist/parse.js';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: docs } = await sb.from('documents').select('id,filename,storage_path').eq('category','Ubist').neq('status','ready').order('filename');
console.log(`이어서 적재: ${docs?.length}개`);
let grand=0;
for(const d of docs??[]){
  const t=Date.now();
  const { data: blob, error: dlErr } = await sb.storage.from('documents').download(d.storage_path);
  if(dlErr||!blob){ console.log(`❌ ${d.filename} 다운로드실패`); continue; }
  const buf = Buffer.from(await blob.arrayBuffer());
  const { rows, total, error } = parseUbistBuffer(buf, d.filename, d.id);
  if(error){ console.log(`❌ ${d.filename} 파싱실패 ${error}`); await sb.from('documents').update({status:'error',error_message:'파싱실패'}).eq('id',d.id); continue; }
  await sb.from('ubist_data').delete().eq('source_file', d.filename);
  let ins=0, bad='';
  for(let i=0;i<rows.length;i+=2000){ const { error: e } = await sb.from('ubist_data').insert(rows.slice(i,i+2000) as any); if(e){ bad=e.message; break; } ins+=Math.min(2000,rows.length-i); }
  if(bad){ console.log(`❌ ${d.filename} 삽입실패 ${bad.slice(0,80)}`); await sb.from('documents').update({status:'error',error_message:'삽입실패'}).eq('id',d.id); continue; }
  await sb.from('documents').update({status:'ready',error_message:null}).eq('id',d.id);
  grand+=ins; console.log(`✅ ${d.filename} ${ins}행 (${((Date.now()-t)/1000).toFixed(1)}s)`);
}
console.log(`이번 배치 총 ${grand.toLocaleString()}행 — 완료`);
