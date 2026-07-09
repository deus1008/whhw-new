-- ============================================================
-- dashboard_rpc_cache: /weekly 대시보드 집계 RPC 결과 캐시
-- 목적: get_edi_summary / get_dashboard_settlements 는 매 로드마다 수십만 행을
--       스캔해 수 초가 걸리지만, 데이터는 업로드 시에만 변경됨.
--       결과 JSON을 캐시해 캐시 히트 시 작은 행 1건만 읽어 즉시 응답.
-- 무효화: 업로드 동기화(syncEdiToDb, 수수료정산 insert) 시 company_id 캐시 삭제
--         + 애플리케이션 레벨 TTL(기본 30분)로 자가 치유
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_rpc_cache (
  cache_key   text        PRIMARY KEY,
  company_id  uuid,
  payload     jsonb       NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drc_company ON dashboard_rpc_cache(company_id);

-- 서버(서비스 롤)만 접근 — RLS 활성화 + anon/authenticated 정책 없음.
-- 서비스 롤은 RLS를 우회하므로 서버 사이드 대시보드 로직에서만 읽고 쓴다.
ALTER TABLE dashboard_rpc_cache ENABLE ROW LEVEL SECURITY;
