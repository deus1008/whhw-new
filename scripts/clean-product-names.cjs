const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://lvzgtcxrpsebyzptmqvd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2emd0Y3hycHNlYnl6cHRtcXZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MDc0NywiZXhwIjoyMDk0NjY2NzQ3fQ.7aX8PVtNLaFhNBnEcPBH7q5cxnX6g6sOC4PFnpR2Yx0';
const db = createClient(SUPABASE_URL, SERVICE_KEY);

// 제거 패턴: (27%), (48%->42%), (OM->아주) 등
function cleanName(name) {
  return name
    .replace(/\s*[\(（][^)\）]*(?:->|→)[^)\）]*[\)）]/g, '') // (A->B) 형태
    .replace(/\s*[\(（]\d+(?:\.\d+)?%[\)）]/g, '')           // (27%) 형태
    .trim();
}

async function run() {
  const { data: drugs } = await db.from('disease_drugs').select('id, product_name');
  let updated = 0;

  for (const drug of drugs ?? []) {
    const cleaned = cleanName(drug.product_name ?? '');
    if (cleaned !== drug.product_name) {
      console.log('[정제]', JSON.stringify(drug.product_name), '->', JSON.stringify(cleaned));
      await db.from('disease_drugs').update({ product_name: cleaned }).eq('id', drug.id);
      updated++;
    }
  }

  console.log('\n총', updated + '개 제품명 정제 완료');
}

run().catch(console.error);
