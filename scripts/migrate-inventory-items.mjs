/**
 * inventory_items 테이블 생성 스크립트
 * 실행: node scripts/migrate-inventory-items.mjs
 *
 * 또는 아래 SQL을 Supabase Dashboard > SQL Editor에서 직접 실행하세요.
 */

const SQL = `
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type     text        NOT NULL DEFAULT '예측',
  product_code   text        NOT NULL DEFAULT '',
  product_name   text        NOT NULL,
  sales_3m       numeric,
  sales_month    numeric,
  stock_amount   numeric,
  stock_days     integer,
  stockout_start text,
  supply_date    text,
  stockout_days  text,
  manufacturer   text        NOT NULL DEFAULT '',
  cause          text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inv_alert ON public.inventory_items(alert_type);
`;

const PROJECT_REF = 'lvzgtcxrpsebyzptmqvd';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2emd0Y3hycHNlYnl6cHRtcXZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MDc0NywiZXhwIjoyMDk0NjY2NzQ3fQ.7aX8PVtNLaFhNBnEcPBH7q5cxnX6g6sOC4PFnpR2Yx0';

// Supabase Management API (requires personal access token, not service key)
// Trying the management API endpoint:
const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

console.log('inventory_items 테이블 생성 시도...');
console.log('');

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: SQL }),
  });
  const body = await res.text();
  if (res.ok) {
    console.log('✅ 테이블 생성 완료');
  } else {
    console.log('❌ API 호출 실패 (Management API는 PAT 필요)');
    console.log('   응답:', body.slice(0, 200));
    console.log('');
    console.log('━━━ 수동 실행 방법 ━━━');
    console.log('Supabase Dashboard > SQL Editor에서 아래 SQL을 실행하세요:');
    console.log('');
    console.log(SQL);
  }
} catch (e) {
  console.error('오류:', e.message);
  console.log('');
  console.log('━━━ 수동 실행 방법 ━━━');
  console.log('Supabase Dashboard > SQL Editor에서 아래 SQL을 실행하세요:');
  console.log('');
  console.log(SQL);
}
