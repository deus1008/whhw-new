/**
 * 재고현황 페이지 (Server Component)
 * - 문서관리 > 재고관리 폴더의 최신 품절예측현황 Excel을 Supabase Storage에서
 *   직접 다운로드 + 파싱하여 렌더링 (별도 DB 테이블 불필요)
 */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import InventoryClient from '@/components/InventoryClient';
import { parseInventoryBuffer, type StockAlertItem } from '@/lib/inventory/parse';

export const revalidate = 1800;

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function nl(color: string, bg: string, border: string): CSSProperties {
  return {
    padding: '0.4rem 0.9rem', borderRadius: '8px', textDecoration: 'none',
    background: bg, border: `1px solid ${border}`,
    color, fontSize: '0.82rem', fontWeight: 600,
  };
}

export default async function InventoryPage() {
  // ── 인증 ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single();
  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const normRole = normalizeRole(myProfile.role as string);
  const isAdmin  = normRole === '관리자';

  const svc = getSvc();

  // ── 재고관리 폴더에서 최신 파일 조회 ──────────────────────────────────────
  const { data: doc } = await svc
    .from('documents')
    .select('id, filename, storage_path, created_at')
    .eq('category', '재고관리')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let items: StockAlertItem[] = [];
  let parseError: string | null = null;
  let fileName: string | null   = null;
  let uploadDate: string | null = null;

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

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem,4vw,1.8rem)' }}>
          재고현황
        </p>

        <div className="page-nav">
          <HomeButton />
          <Link href="/dc"        style={nl('#c4b5fd','rgba(139,92,246,0.10)','rgba(139,92,246,0.28)')}>🏥 DC현황</Link>
          <Link href="/calendar"  style={nl('#fdba74','rgba(251,146,60,0.10)','rgba(251,146,60,0.28)')}>📅 주요일정</Link>
          <Link href="/documents" style={nl('#fde68a','rgba(251,191,36,0.10)','rgba(251,191,36,0.28)')}>📁 문서관리</Link>
          {isAdmin && <Link href="/admin" style={nl('#a259ff','rgba(162,89,255,0.10)','rgba(162,89,255,0.28)')}>관리자</Link>}
          <LogoutButton compact />
        </div>

        <InventoryClient
          items={items}
          fileName={fileName}
          uploadDate={uploadDate}
          error={parseError}
        />
      </div>
    </>
  );
}
