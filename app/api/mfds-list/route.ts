import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 식약처 회수·판매중지 / 행정처분 조회 (data.go.kr).
// ⚠ 두 서비스는 별도 승인 필요 — 미승인 시 500을 반환하므로 notAvailable 로 안내.
// 승인 후 실제 응답 필드를 확인해 매핑을 확정한다(현재는 대표 후보 필드명으로 방어적 매핑).

const ENDPOINTS: Record<string, { url: string; nameParam: string }> = {
  recall: {
    url: 'https://apis.data.go.kr/1471000/MdcinRtrvlSleStpgeInfoService03/getMdcinRtrvlSleStpgeInfoList',
    nameParam: 'Prduct',
  },
  admin: {
    url: 'https://apis.data.go.kr/1471000/MdcinExaathHtdInfoService/getMdcinExaathHtdInfoList',
    nameParam: 'Prduct',
  },
};

// 여러 후보 필드명 중 첫 비어있지 않은 값
function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function normalize(type: string, raw: Record<string, unknown>) {
  if (type === 'recall') {
    return {
      product: pick(raw, ['PRDUCT', 'PRDLST_NM', 'ITEM_NAME', 'PRODUCT_NAME']),
      company: pick(raw, ['ENTRPS', 'ENTP_NAME', 'BSSH_NM', 'COMPANY']),
      type:    pick(raw, ['TYPE_NAME', 'RTRVL_TYPE', 'GRADE', 'RECALL_TYPE']),
      reason:  pick(raw, ['RETRIEVE_REASON', 'RTRVL_RESN', 'SNGL_JBBB', 'REASON', 'RTRVL_CN']),
      date:    pick(raw, ['PUBLIC_DATE', 'PBLNT_DT', 'RTRVL_DT', 'DATE', 'RETRIEVE_DATE']),
    };
  }
  // admin (행정처분)
  return {
    company: pick(raw, ['ENTRPS', 'ENTP_NAME', 'BSSH_NM', 'COMPANY']),
    product: pick(raw, ['PRDUCT', 'ITEM_NAME', 'PRDLST_NM']),
    action:  pick(raw, ['DSPS_CN', 'ADM_ACT', 'DISPOSAL', 'DSPS_NM', 'ACTION']),
    reason:  pick(raw, ['VILT_CN', 'VIOLATION', 'DSPS_RESN', 'REASON']),
    date:    pick(raw, ['DSPS_DT', 'DISPOSAL_DATE', 'DATE', 'PBLNT_DT']),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'recall';
  const q    = (searchParams.get('q') ?? '').trim();
  const cfg  = ENDPOINTS[type];
  if (!cfg) return NextResponse.json({ items: [], error: '알 수 없는 조회 유형' }, { status: 400 });

  const key = process.env.MFDS_API_KEY ?? process.env.DRUG_API_KEY;
  if (!key) return NextResponse.json({ items: [], notAvailable: true, message: 'DRUG_API_KEY 미설정' });

  const params = new URLSearchParams({ serviceKey: key, type: 'json', numOfRows: '50', pageNo: '1' });
  if (q) params.set(cfg.nameParam, q);

  try {
    const res  = await fetch(`${cfg.url}?${params}`, { next: { revalidate: 0 } });
    const text = await res.text();
    if (!text.trim().startsWith('{')) {
      // 미승인/오류 → HTML/XML 에러 반환
      return NextResponse.json({ items: [], notAvailable: true, message: '식약처 API 미승인 또는 응답 오류입니다. data.go.kr에서 해당 서비스 활용신청 승인 후 이용 가능합니다.' });
    }
    const json = JSON.parse(text);
    let items = json?.body?.items ?? json?.response?.body?.items?.item ?? json?.body?.items?.item ?? [];
    items = Array.isArray(items) ? items : (items ? [items] : []);
    const total = Number(json?.body?.totalCount ?? json?.response?.body?.totalCount ?? items.length);
    return NextResponse.json({ items: items.map((r: Record<string, unknown>) => normalize(type, r)), total });
  } catch {
    return NextResponse.json({ items: [], notAvailable: true, message: '식약처 API 조회에 실패했습니다.' });
  }
}
