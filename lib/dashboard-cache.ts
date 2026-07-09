// /weekly 대시보드 집계 RPC 결과 read-through 캐시
// - 캐시 히트: dashboard_rpc_cache 에서 작은 JSONB 행 1건만 읽어 즉시 응답
// - 캐시 미스/만료: compute() 실행 후 결과 저장
// - 무효화: invalidateDashboardCache(svc, companyId) — 업로드 동기화 시 호출
// - TTL: 무효화 경로가 누락돼도 최대 TTL 후 자가 치유

const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

/**
 * 캐시 우선 RPC 실행. 반환 형태는 { data } 로 통일해 기존 destructure 와 호환.
 * compute 는 실제 페이로드(RPC data)를 반환해야 한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cachedRpc<T = any>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  cacheKey: string,
  companyId: string | null,
  compute: () => Promise<T>,
): Promise<{ data: T | null }> {
  try {
    const { data: row } = await svc
      .from('dashboard_rpc_cache')
      .select('payload, computed_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (row?.payload != null) {
      const age = Date.now() - new Date(row.computed_at as string).getTime();
      if (age < CACHE_TTL_MS) {
        return { data: row.payload as T };
      }
    }
  } catch { /* 캐시 조회 실패 시 실시간 계산으로 폴백 */ }

  const payload = await compute();

  // 저장 실패는 무시 (다음 로드에서 재계산)
  try {
    if (payload != null) {
      await svc.from('dashboard_rpc_cache').upsert({
        cache_key:   cacheKey,
        company_id:  companyId,
        payload,
        computed_at: new Date().toISOString(),
      });
    }
  } catch { /* ignore */ }

  return { data: payload ?? null };
}

/** 특정 위탁사의 대시보드 캐시 전체 무효화 (업로드 동기화 후 호출) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invalidateDashboardCache(svc: any, companyId: string | null): Promise<void> {
  try {
    let q = svc.from('dashboard_rpc_cache').delete();
    q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
    await q;
  } catch { /* ignore */ }
}
