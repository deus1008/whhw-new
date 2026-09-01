import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export type HospitalHit = {
  hospital_code: string;
  hospital_name: string;
  hospital_type: string | null;
  sido: string | null;
  gugun: string | null;
  address: string | null;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ items: [] });

  const svc = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const cols = 'hospital_code, hospital_name, hospital_type, sido, gugun, address';

  // 숫자만 → 처방처코드 접두 검색, 그 외 → 처방처명 부분일치(trgm 인덱스)
  const isCode = /^\d+$/.test(q);
  const { data, error } = isCode
    ? await svc.from('hospital_master').select(cols).ilike('hospital_code', `${q}%`).limit(30)
    : await svc.from('hospital_master').select(cols).ilike('hospital_name', `%${q}%`).limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 이름 검색: 접두 일치 우선 → 이름 길이 짧은 순(정확도 근사)
  const rows = (data ?? []) as HospitalHit[];
  if (!isCode) {
    const ql = q.toLowerCase();
    rows.sort((a, b) => {
      const as = a.hospital_name.toLowerCase().startsWith(ql) ? 0 : 1;
      const bs = b.hospital_name.toLowerCase().startsWith(ql) ? 0 : 1;
      return as - bs || a.hospital_name.length - b.hospital_name.length;
    });
  }
  return NextResponse.json({ items: rows.slice(0, 25) });
}
