-- trend_prescriptions 포맷 정규화 및 중복 데이터 정리
-- 원인: 동시 업로드·동기화 재시도로 인한 중복 삽입 및 레거시 포맷 혼재
--
-- 수행 순서:
--   0단계: prescription_month 포맷 통일 (YYYY-MM / YYYY.MM → YYYYMM)
--   1단계: 동일 (company_id, prescription_month)에 여러 source_file이 있으면
--          가장 최근에 삽입된 source_file 데이터만 남김
--   2단계: 같은 source_file 내 완전히 동일한 행 중복 제거

-- ── 0단계: prescription_month 포맷 정규화 ────────────────────────────────────
-- YYYY-MM, YYYY.MM → YYYYMM (구분자 제거)
UPDATE trend_prescriptions
SET prescription_month = REGEXP_REPLACE(prescription_month, '[.\-]', '', 'g')
WHERE prescription_month ~ '^[0-9]{4}[.\-][0-9]{2}$';

-- ── 1단계: 월+회사별 최신 source_file 외 삭제 ──────────────────────────────
WITH latest_source AS (
  SELECT DISTINCT ON (company_id, prescription_month)
    company_id,
    prescription_month,
    source_file
  FROM trend_prescriptions
  WHERE prescription_month IS NOT NULL
  ORDER BY company_id, prescription_month, created_at DESC, source_file
)
DELETE FROM trend_prescriptions tp
WHERE tp.prescription_month IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM latest_source ls
    WHERE ls.company_id IS NOT DISTINCT FROM tp.company_id
      AND ls.prescription_month = tp.prescription_month
      AND ls.source_file = tp.source_file
  );

-- ── 2단계: 완전 동일 행 중복 제거 (같은 파일 2회 처리된 경우) ────────────────
DELETE FROM trend_prescriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY
          source_file,
          prescription_month,
          sales_rep,
          cso_name,
          hospital_name,
          product_name,
          prescription_amount,
          company_id
        ORDER BY created_at DESC, id
      ) AS rn
    FROM trend_prescriptions
  ) ranked
  WHERE rn > 1
);
