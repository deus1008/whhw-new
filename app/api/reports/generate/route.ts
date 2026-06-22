import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

/* ── Supabase 서비스 클라이언트 ── */
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSvc(url, key);
}

/* ── 키워드 기반 DB 라우팅 ── */
function selectTables(topic: string): Set<string> {
  const t = topic.toLowerCase();
  const tables = new Set<string>();

  // 약가·보험
  if (/약가|가격|상한가|급여|보험/.test(t))
    tables.add('drug_prices');

  // 수수료율 (CSO 계약)
  if (/수수료율?|cso|채널|딜러|제약사/.test(t))
    tables.add('commission_rates');

  // 수수료 정산·영업 실적
  if (/정산|수수료정산|매출|영업실적|실적|성과/.test(t))
    tables.add('commission_settlements');

  // 생동
  if (/생동|생물학적동등성|자사생동/.test(t))
    tables.add('drug_bioequiv');

  // 원료 DMF
  if (/dmf|원료dmf|원료/.test(t))
    tables.add('drug_dmf');

  // 거래처·병원·약국
  if (/거래처|병원|약국|거래처현황|고객/.test(t))
    tables.add('customer_status');

  // 처방 데이터
  if (/ubist|처방|처방량|처방액|처방건/.test(t))
    tables.add('ubist_data');

  // 영업활동·방문기록
  if (/영업|영업활동|영업현황|영업분석|영업보고|주간|월간|분기|반기|주차|방문|활동/.test(t)) {
    tables.add('visit_records');
    tables.add('commission_settlements');
    tables.add('customer_status');
  }

  // 처방 데이터 (ubist)
  if (/ubist|처방|처방량|처방액|처방건/.test(t))
    tables.add('ubist_data');

  // 키워드 미감지 시 → 영업 실적 중심 테이블
  if (tables.size === 0) {
    ['visit_records', 'commission_settlements', 'customer_status', 'commission_rates'].forEach(t => tables.add(t));
  }
  return tables;
}

/* ── 테이블별 데이터 요약 수집 ── */
async function gatherContext(db: ReturnType<typeof svc>, tables: Set<string>): Promise<string> {
  const sections: string[] = [];
  type Row = Record<string, unknown>;

  if (tables.has('drug_prices')) {
    const { data } = await db.from('drug_prices')
      .select('item_name, max_price, pay_type, standard, unit, manufacturer, ingredient_name')
      .order('max_price', { ascending: false })
      .limit(150);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      sections.push(`## 약가 데이터 (상위 ${rows.length}건)\n` +
        '| 품목명 | 상한가(원) | 급여구분 | 규격 | 제조사 | 주성분 |\n|---|---|---|---|---|---|\n' +
        rows.map(r =>
          `| ${r.item_name ?? ''} | ${r.max_price ?? ''} | ${r.pay_type ?? ''} | ${r.standard ?? ''} | ${r.manufacturer ?? ''} | ${r.ingredient_name ?? ''} |`
        ).join('\n'));
    }
  }

  if (tables.has('commission_rates')) {
    // 실제 컬럼: company_name, product_name, rate, source_file
    const { data } = await db.from('commission_rates')
      .select('company_name, product_name, rate, source_file')
      .order('company_name', { ascending: true })
      .limit(300);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      sections.push(`## 수수료율 데이터 (${rows.length}건)\n` +
        '| 업체명 | 제품명 | 수수료율(%) | 파일 |\n|---|---|---|---|\n' +
        rows.map(r => `| ${r.company_name ?? ''} | ${r.product_name ?? '(전체)'} | ${r.rate ?? ''} | ${r.source_file ?? ''} |`).join('\n'));
    }
  }

  if (tables.has('commission_settlements')) {
    // 실제 컬럼: settlement_month, manager, cso_name, hospital_name, product_name,
    //            approved_qty, unit_price, prescription_amount, commission_rate, settlement_amount
    const { data } = await db.from('commission_settlements')
      .select('settlement_month, manager, cso_name, hospital_name, product_name, prescription_amount, commission_rate, settlement_amount')
      .order('settlement_month', { ascending: false })
      .limit(300);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      const totalPrx  = rows.reduce((s, r) => s + (Number(r.prescription_amount) || 0), 0);
      const totalSetl = rows.reduce((s, r) => s + (Number(r.settlement_amount)   || 0), 0);
      sections.push(`## 수수료정산 데이터 (${rows.length}건)\n` +
        `- 처방금액 합계: ${totalPrx.toLocaleString()}원\n` +
        `- 정산액 합계: ${totalSetl.toLocaleString()}원\n\n` +
        '| 정산월 | 담당자 | CSO | 처방처 | 품목명 | 처방금액 | 수수료율 | 정산액 |\n|---|---|---|---|---|---|---|---|\n' +
        rows.slice(0, 150).map(r =>
          `| ${r.settlement_month ?? ''} | ${r.manager ?? ''} | ${r.cso_name ?? ''} | ${r.hospital_name ?? ''} | ${r.product_name ?? ''} | ${Number(r.prescription_amount||0).toLocaleString()} | ${r.commission_rate ?? ''}% | ${Number(r.settlement_amount||0).toLocaleString()} |`
        ).join('\n'));
    }
  }

  if (tables.has('drug_bioequiv')) {
    const { data } = await db.from('drug_bioequiv')
      .select('item_name, company_name, ingredient_name, notice_date')
      .order('notice_date', { ascending: false })
      .limit(300);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      sections.push(`## 자사 생동인정품목 (${rows.length}건)\n` +
        '| 품목명 | 업체명 | 성분명 | 고시일자 |\n|---|---|---|---|\n' +
        rows.map(r => `| ${r.item_name ?? ''} | ${r.company_name ?? ''} | ${r.ingredient_name ?? ''} | ${r.notice_date ?? ''} |`).join('\n'));
    }
  }

  if (tables.has('drug_dmf')) {
    const { data } = await db.from('drug_dmf')
      .select('ingredient_name, company_name, manufacturer_name, country, registration_date, dmf_number')
      .order('registration_date', { ascending: false })
      .limit(300);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      sections.push(`## 원료 DMF 데이터 (${rows.length}건)\n` +
        '| 성분명 | 국내업체 | 제조업체 | 제조국 | 등록일 | DMF번호 |\n|---|---|---|---|---|---|\n' +
        rows.map(r => `| ${r.ingredient_name ?? ''} | ${r.company_name ?? ''} | ${r.manufacturer_name ?? ''} | ${r.country ?? ''} | ${r.registration_date ?? ''} | ${r.dmf_number ?? ''} |`).join('\n'));
    }
  }

  if (tables.has('customer_status')) {
    const { data } = await db.from('customer_status')
      .select('customer_name, customer_type, region, manager, cso')
      .limit(300);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      const byType = rows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r.customer_type ?? '미분류');
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      const byRegion = rows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r.region ?? '미분류');
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      sections.push(`## 거래처 현황 (총 ${rows.length}건)\n` +
        `### 종별 분포\n${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}개`).join('\n')}\n\n` +
        `### 지역별 분포\n${Object.entries(byRegion).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>`- ${k}: ${v}개`).join('\n')}`);
    }
  }

  if (tables.has('ubist_data')) {
    // 실제 컬럼: period, ingredient_name, product_name, manufacturer, hospital_type, region,
    //            prescription_amount, prescription_count
    const { data } = await db.from('ubist_data')
      .select('product_name, ingredient_name, period, prescription_amount, prescription_count, manufacturer, hospital_type, region')
      .order('period', { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Row[];
    if (rows.length) {
      const totalAmt = rows.reduce((s, r) => s + (Number(r.prescription_amount) || 0), 0);
      const totalCnt = rows.reduce((s, r) => s + (Number(r.prescription_count)  || 0), 0);
      sections.push(`## Ubist 처방 데이터 (${rows.length}건, 최근순)\n` +
        `- 합산 처방액: ${totalAmt.toLocaleString()}원\n` +
        `- 합산 처방건수: ${totalCnt.toLocaleString()}건\n\n` +
        '| 제품명 | 성분명 | 연월 | 처방금액 | 처방건수 | 제조사 | 병원구분 | 지역 |\n|---|---|---|---|---|---|---|---|\n' +
        rows.slice(0, 80).map(r =>
          `| ${r.product_name ?? ''} | ${r.ingredient_name ?? ''} | ${r.period ?? ''} | ${Number(r.prescription_amount||0).toLocaleString()} | ${r.prescription_count ?? ''} | ${r.manufacturer ?? ''} | ${r.hospital_type ?? ''} | ${r.region ?? ''} |`
        ).join('\n'));
    }
  }

  if (tables.has('visit_records')) {
    const { data: visits } = await db
      .from('visit_records')
      .select('visited_at, customer_name, customer_type, contact_name, purpose, products, content, next_action')
      .order('visited_at', { ascending: false })
      .limit(300);

    // 별칭 매핑 로드
    const { data: aliases } = await db
      .from('customer_aliases')
      .select('alias_norm, customer_id');
    const { data: canonicals } = await db
      .from('customer_status')
      .select('id, customer_name');

    const canonicalMap = Object.fromEntries(
      (canonicals ?? []).map(c => [c.id, c.customer_name as string]),
    );
    const aliasMap = new Map<string, string>(
      (aliases ?? []).map(a => {
        const canonical = canonicalMap[a.customer_id] ?? null;
        return [a.alias_norm as string, canonical ?? ''] as [string, string];
      }).filter(([, v]) => v),
    );

    const rows = (visits ?? []) as Row[];
    if (rows.length) {
      // 정규화된 거래처명으로 집계
      const byCustomer: Record<string, { count: number; last: string; products: Set<string> }> = {};
      for (const r of rows) {
        const raw  = String(r.customer_name ?? '').trim();
        const norm = raw.toLowerCase();
        const name = aliasMap.get(norm) ?? raw;
        if (!byCustomer[name]) byCustomer[name] = { count: 0, last: String(r.visited_at ?? ''), products: new Set() };
        byCustomer[name].count += 1;
        if (String(r.visited_at ?? '') > byCustomer[name].last) byCustomer[name].last = String(r.visited_at ?? '');
        String(r.products ?? '').split(/[,，\n]+/).map(p => p.trim()).filter(Boolean).forEach(p => byCustomer[name].products.add(p));
      }
      const sortedCustomers = Object.entries(byCustomer).sort((a, b) => b[1].count - a[1].count);

      sections.push(
        `## 영업 방문 기록 (총 ${rows.length}건, 정규화 적용)\n\n` +
        `### 거래처별 방문 현황 (상위 30개)\n` +
        `| 거래처명 | 방문 횟수 | 최근 방문일 | 주요 논의 제품 |\n|---|---|---|---|\n` +
        sortedCustomers.slice(0, 30).map(([name, d]) =>
          `| ${name} | ${d.count} | ${d.last} | ${[...d.products].slice(0, 3).join(', ') || '—'} |`
        ).join('\n') +
        `\n\n### 최근 방문 상세 (50건)\n` +
        `| 방문일 | 거래처명(정규화) | 담당자 | 방문목적 | 논의제품 |\n|---|---|---|---|---|\n` +
        rows.slice(0, 50).map(r => {
          const raw  = String(r.customer_name ?? '').trim();
          const name = aliasMap.get(raw.toLowerCase()) ?? raw;
          return `| ${r.visited_at ?? ''} | ${name} | ${r.contact_name ?? '—'} | ${String(r.purpose ?? '').slice(0, 30)} | ${String(r.products ?? '').slice(0, 40)} |`;
        }).join('\n'),
      );
    }
  }

  return sections.length > 0
    ? sections.join('\n\n')
    : '※ 선택된 테이블에 데이터가 없습니다. 문서 관리 페이지에서 해당 데이터 파일을 업로드해주세요.';
}

/* ── HTML 생성 프롬프트 ── */
const SYSTEM = `당신은 제약 영업 전략 데이터 분석 전문가입니다.
제공된 DB 데이터를 분석하여 완전한 HTML 형식의 경영 분석 리포트를 작성하세요.

출력 규칙:
- 반드시 완전한 HTML 파일(<!DOCTYPE html> 시작)만 반환
- 인라인 CSS로 전문적인 스타일 적용 (별도 외부 파일 없음)
- 깔끔한 흰 배경의 인쇄 가능한 레이아웃
- 한국어로 작성
- 데이터에서 의미 있는 인사이트를 도출하여 서술
- HTML 코드블록 마크다운(\`\`\`html) 없이 순수 HTML만 반환`;

function buildPrompt(title: string, topic: string, context: string, today: string): string {
  return `리포트 제목: ${title}
분석 내용: ${topic}
작성일: ${today}

아래는 사내 DB에서 추출한 실제 데이터입니다. 이 데이터를 바탕으로 분석 리포트를 작성하세요.

${context}

---
위 데이터를 분석하여 다음 구조로 HTML 리포트를 작성하세요:
1. 리포트 표지 (제목: "${title}", 작성일, 요약)
2. 핵심 지표 요약 (주요 수치를 카드 형태로)
3. 상세 데이터 분석 (섹션별 표 + 인사이트) — 분석 내용 "${topic}"에 집중
4. 결론 및 시사점
5. 데이터 출처 명시

스타일: 전문 컨설팅 리포트 수준의 깔끔한 흰 배경 디자인. 표는 border-collapse 스타일 적용.`;
}

/* ── POST 핸들러 ── */
export async function POST(req: NextRequest) {
  // 1. 인증
  const authClient = await createServerClient();
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await authClient.from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return NextResponse.json({ error: '접근 권한 없음' }, { status: 403 });
  if (!profileIsAdmin(profile)) return NextResponse.json({ error: '관리자만 AI 리포트를 생성할 수 있습니다.' }, { status: 403 });

  // 2. 요청 파싱
  let title: string;
  let topic: string;
  try {
    const body = await req.json();
    title = String(body.title ?? '').trim();
    topic = String(body.topic ?? '').trim();
    if (!title) throw new Error('title 필드가 필요합니다.');
    if (!topic) throw new Error('topic 필드가 필요합니다.');
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '잘못된 요청' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수 미설정' }, { status: 503 });

  const db = svc();
  const today = new Date().toISOString().slice(0, 10);

  // 3. DB 데이터 수집
  const tables = selectTables(topic);
  console.log(`[report-gen] 제목: "${title}", 분석내용: "${topic}", 테이블: ${[...tables].join(', ')}`);

  let context: string;
  try {
    context = await gatherContext(db, tables);
  } catch (e) {
    console.error('[report-gen] DB 수집 오류:', e);
    context = '※ DB 데이터 수집 중 오류가 발생했습니다.';
  }

  // 4. Claude 호출
  const anthropic = new Anthropic({ apiKey });
  let htmlContent: string;
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8000,
      system:     SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(title, topic, context, today) }],
    });
    const raw = msg.content.find(b => b.type === 'text')?.text ?? '';
    // 마크다운 코드블록 제거 (혹시 포함된 경우)
    htmlContent = raw
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/,      '')
      .replace(/\s*```$/,      '')
      .trim();
    if (!htmlContent.startsWith('<')) {
      htmlContent = `<!DOCTYPE html><html><body>${htmlContent}</body></html>`;
    }
  } catch (e) {
    console.error('[report-gen] Claude 호출 오류:', e);
    return NextResponse.json({ error: `AI 생성 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }

  // 5. Supabase 스토리지 저장
  // storage key는 ASCII-only (한글 경로 거부됨)
  // filename(표시명)은 한글 포함, storagePath(실제 키)는 영문+숫자만 사용
  const safeTitle   = title.slice(0, 50).replace(/[^\w가-힣]/g, '_');
  const filename    = `AI_${safeTitle}_${today}.html`;          // documents 테이블 표시명
  const ts          = Date.now();
  const storagePath = `ai-reports/report_${ts}.html`;           // 스토리지 실제 키

  const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
  const { error: upErr } = await db.storage
    .from('documents')
    .upload(storagePath, htmlBuffer, {
      contentType:  'text/html; charset=utf-8',
      upsert:       true,
    });

  if (upErr) {
    console.error('[report-gen] 스토리지 업로드 오류:', upErr.message);
    return NextResponse.json({ error: `파일 저장 실패: ${upErr.message}` }, { status: 500 });
  }

  // 6. documents 테이블 레코드 생성
  const { data: docRow, error: insErr } = await db.from('documents').insert({
    filename,
    file_type:    'html',
    storage_path: storagePath,
    category:     '분석리포트',
    uploaded_by:  user.id,
    status:       'ready',
    summary:      `AI 생성: ${title}`,
  }).select('id').single();

  if (insErr) {
    console.error('[report-gen] DB 레코드 생성 오류:', insErr.message);
    return NextResponse.json({ error: `DB 저장 실패: ${insErr.message}` }, { status: 500 });
  }

  console.log(`[report-gen] 완료 → id=${(docRow as { id: string }).id}, 파일=${filename}`);
  return NextResponse.json({ ok: true, id: (docRow as { id: string }).id, filename });
}
