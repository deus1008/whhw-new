import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export type CustomerRow = {
  no:           number;
  code:         string;
  level:        string;    // 구분: 1차|2차|...
  name:         string;    // 현재 레벨 업체명
  root:         string;    // 1차 업체명
  bizType:      string;    // 개인/법인
  start:        string;
  end:          string;
  bizNo:        string;    // 사업자번호
  address:      string;
  phone:        string;
  rep:          string;    // 대표자명
  repEmail:     string;
  manager:      string;    // 담당자명
  managerEmail: string;
  docScore:     number;    // 서류 완비 수 (0~9)
};

const LEVEL_COL: Record<string, number> = {
  '1차': 2, '2차': 3, '3차': 4, '4차': 5,
  '5차': 6, '6차': 7, '7차': 8, '8차': 9, '9차': 10,
};
const DOC_COLS = [22, 23, 24, 25, 26, 27, 28, 29, 30];

function parseRows(buf: Buffer): CustomerRow[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  const rows: CustomerRow[] = [];
  for (let i = 1; i < all.length; i++) {
    const r = all[i] as unknown[];
    if (!r[0]) continue;
    const level = String(r[11] ?? '').trim();
    const nameIdx = LEVEL_COL[level] ?? 2;
    const docScore = DOC_COLS.reduce(
      (s, ci) => s + (String(r[ci] ?? '').trim().toUpperCase() === 'O' ? 1 : 0),
      0,
    );
    rows.push({
      no:           Number(r[0]),
      code:         String(r[1] ?? ''),
      level,
      name:         String(r[nameIdx] ?? '').trim(),
      root:         String(r[2] ?? '').trim(),
      bizType:      String(r[12] ?? '').trim(),
      start:        String(r[13] ?? ''),
      end:          String(r[14] ?? ''),
      bizNo:        String(r[15] ?? '').trim(),
      address:      String(r[16] ?? '').trim(),
      phone:        String(r[17] ?? '').trim(),
      rep:          String(r[18] ?? '').trim(),
      repEmail:     String(r[19] ?? '').trim(),
      manager:      String(r[20] ?? '').trim(),
      managerEmail: String(r[21] ?? '').trim(),
      docScore,
    });
  }
  return rows;
}

function serviceClient() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Module-level cache (persists across warm invocations)
let _cache: { key: string; rows: CustomerRow[] } | null = null;

async function getRows(companyId: string | null): Promise<{ rows: CustomerRow[]; filename: string; updatedAt: string } | null> {
  const svc = serviceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docQ: any = svc
    .from('documents')
    .select('id, filename, storage_path, created_at')
    .eq('category', '거래처현황')
    .order('created_at', { ascending: false })
    .limit(1);
  if (companyId) docQ = docQ.eq('company_id', companyId);
  const { data: docs } = await docQ;
  const doc = (docs ?? [])[0] as Record<string, string> | undefined;
  if (!doc) return null;

  const cacheKey = `${companyId}:${doc.storage_path}`;
  if (_cache?.key === cacheKey) {
    return {
      rows: _cache.rows,
      filename: doc.filename,
      updatedAt: new Date(doc.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
    };
  }

  const { data: blob, error } = await svc.storage.from('documents').download(doc.storage_path);
  if (error || !blob) return null;

  const buf = Buffer.from(await blob.arrayBuffer());
  const rows = parseRows(buf);
  _cache = { key: cacheKey, rows };

  return {
    rows,
    filename: doc.filename,
    updatedAt: new Date(doc.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
  };
}

export async function GET(req: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const sp = req.nextUrl.searchParams;
  const result = await getRows(companyId);

  if (!result) {
    if (sp.get('meta') === '1') {
      return NextResponse.json({ levels: [], levelCounts: [], bizTypes: [], totalCount: 0, filename: '', updatedAt: '' });
    }
    return NextResponse.json({ items: [], total: 0, page: 1, limit: 50 });
  }

  const { rows, filename, updatedAt } = result;

  // 메타
  if (sp.get('meta') === '1') {
    const levelMap = new Map<string, number>();
    const bizTypeSet = new Set<string>();
    for (const r of rows) {
      levelMap.set(r.level, (levelMap.get(r.level) ?? 0) + 1);
      if (r.bizType) bizTypeSet.add(r.bizType);
    }
    const ORDER = ['1차','2차','3차','4차','5차','6차','7차','8차','9차'];
    const levelCounts = ORDER
      .filter(l => levelMap.has(l))
      .map(l => ({ level: l, count: levelMap.get(l)! }));
    return NextResponse.json({
      levels:      levelCounts.map(l => l.level),
      levelCounts,
      bizTypes:    [...bizTypeSet].sort(),
      totalCount:  rows.length,
      filename,
      updatedAt,
    });
  }

  // 검색 + 필터
  const q       = (sp.get('q')       ?? '').trim().toLowerCase();
  const level   = (sp.get('level')   ?? '').trim();
  const bizType = (sp.get('bizType') ?? '').trim();
  const page    = Math.max(1, parseInt(sp.get('page') ?? '1'));
  const limit   = 50;

  let filtered = rows;
  if (level)   filtered = filtered.filter(r => r.level === level);
  if (bizType) filtered = filtered.filter(r => r.bizType === bizType);
  if (q) {
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.root.toLowerCase().includes(q) ||
      r.bizNo.includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.rep.toLowerCase().includes(q) ||
      r.manager.toLowerCase().includes(q) ||
      String(r.code).includes(q),
    );
  }

  const total  = filtered.length;
  const offset = (page - 1) * limit;
  const items  = filtered.slice(offset, offset + limit);

  return NextResponse.json({ items, total, page, limit });
}
