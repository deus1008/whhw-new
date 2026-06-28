/**
 * 재고현황 페이지 (Server Component)
 * - 문서관리 > 품절예측 폴더의 최신 품절예측현황 Excel을 Supabase Storage에서
 *   직접 다운로드 + 파싱하여 렌더링 (별도 DB 테이블 불필요)
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import InventoryClient from '@/components/InventoryClient';
import { parseInventoryBuffer, type StockAlertItem } from '@/lib/inventory/parse';
import type { DbItem } from '@/components/InventoryClient';

export const revalidate = 1800;

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}


export default async function InventoryPage() {
  // ── 인증 ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const companyId = (myProfile.company_id as string) ?? null;

  const svc = getSvc();

  // ── 품절예측 폴더에서 최신 파일 조회 ──────────────────────────────────────
  const { data: doc } = await svc
    .from('documents')
    .select('id, filename, storage_path, created_at')
    .eq('category', '품절예측')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let items: StockAlertItem[] = [];
  let parseError: string | null = null;
  let fileName: string | null   = null;
  let uploadDate: string | null = null;

  // ── DB 항목 조회 ──────────────────────────────────────────────────────────────
  const { data: dbRaw } = await svc
    .from('inventory_items')
    .select('*')
    .order('created_at', { ascending: false });

  const dbItems: DbItem[] = (dbRaw ?? []).map((r: Record<string, unknown>) => ({
    id:            r.id as string,
    alert_type:    r.alert_type as string,
    product_code:  r.product_code as string,
    product_name:  r.product_name as string,
    sales_3m:      r.sales_3m as number | null,
    sales_month:   r.sales_month as number | null,
    stock_amount:  r.stock_amount as number | null,
    stock_days:    r.stock_days as number | null,
    stockout_start: r.stockout_start as string | null,
    supply_date:   r.supply_date as string | null,
    stockout_days: r.stockout_days as string | null,
    manufacturer:  r.manufacturer as string,
    cause:         r.cause as string,
    memo:          r.memo as string | null,
  }));

  if (doc?.storage_path) {
    fileName   = doc.filename;
    uploadDate = doc.created_at;

    const { data: blob, error: dlErr } = await svc.storage
      .from('documents')
      .download(doc.storage_path);

    if (dlErr || !blob) {
      parseError = `파일 다운로드 실패: ${dlErr?.message ?? '알 수 없는 오류'}`;
    } else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const result = parseInventoryBuffer(buffer);
      if (result.error) parseError = result.error;
      else items = result.items;
    }
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          품절현황
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <InventoryClient
          items={items}
          fileName={fileName}
          uploadDate={uploadDate}
          error={parseError}
          dbItems={dbItems}
          companyId={companyId}
        />
      </div>
    </>
  );
}
