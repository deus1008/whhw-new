// /weekly 대시보드 집계 RPC 결과 read-through 캐시 (stale-while-revalidate)
// - 신선(age < TTL): 캐시 즉시 반환
// - 만료(age >= TTL): "오래된 값"을 즉시 반환하고 백그라운드(after)로 재계산 →
//   사용자는 절대 재계산(6~9초)을 기다리지 않음. 다음 로드는 신선.
// - 콜드(캐시 없음): 동기 계산(재시도 포함) 후 저장.
// - RPC 간헐적 null(타임아웃) 방어: 재시도 + 실패 시 오래된 값 폴백.
// - 무효화: invalidateDashboardCache(svc, companyId) — 업로드 동기화 시 호출.

import { after } from 'next/server';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30분 (초과 시 백그라운드 갱신 트리거)
const COMPUTE_RETRIES = 2;            // RPC null/오류 시 추가 재시도 횟수

/** RPC 실행 — null/예외 시 재시도. 최종 실패 시 null. */
async function computeWithRetry<T>(compute: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt <= COMPUTE_RETRIES; attempt++) {
    try {
      const r = await compute();
      if (r != null) return r;
    } catch { /* 다음 시도 */ }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function refreshAndStore<T>(svc: any, cacheKey: string, companyId: string | null, compute: () => Promise<T>): Promise<void> {
  const payload = await computeWithRetry(compute);
  if (payload == null) return; // 실패 시 기존 캐시 유지
  try {
    await svc.from('dashboard_rpc_cache').upsert({
      cache_key:   cacheKey,
      company_id:  companyId,
      payload,
      computed_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }
}

/**
 * 캐시 우선 RPC 실행. 반환 형태는 { data } 로 통일해 기존 destructure 와 호환.
 * compute 는 실제 페이로드(RPC data)를 반환해야 한다.
 */
export async function cachedRpc<T = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  cacheKey: string,
  companyId: string | null,
  compute: () => Promise<T>,
): Promise<{ data: T | null }> {
  let stale: T | null = null;
  try {
    const { data: row } = await svc
      .from('dashboard_rpc_cache')
      .select('payload, computed_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (row?.payload != null) {
      const age = Date.now() - new Date(row.computed_at as string).getTime();
      if (age < CACHE_TTL_MS) {
        return { data: row.payload as T }; // 신선 → 즉시
      }
      stale = row.payload as T;             // 만료됐지만 사용 가능
    }
  } catch { /* 캐시 조회 실패 → 실시간 계산 폴백 */ }

  // 만료 캐시 존재: 오래된 값 즉시 반환 + 백그라운드 갱신 (사용자 무대기)
  if (stale != null) {
    try {
      after(() => refreshAndStore(svc, cacheKey, companyId, compute));
    } catch {
      // after 사용 불가 환경: 응답을 막지 않도록 fire-and-forget (다음 로드에서 재시도)
      void refreshAndStore(svc, cacheKey, companyId, compute);
    }
    return { data: stale };
  }

  // 콜드(캐시 없음): 동기 계산(재시도 포함)
  const payload = await computeWithRetry(compute);
  if (payload != null) {
    try {
      await svc.from('dashboard_rpc_cache').upsert({
        cache_key:   cacheKey,
        company_id:  companyId,
        payload,
        computed_at: new Date().toISOString(),
      });
    } catch { /* ignore */ }
  }
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
