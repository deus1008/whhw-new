-- ======================================================
-- parse_settings 테이블 생성 (2026-06-07)
-- 파싱 컬럼 인덱스 등 파서 설정을 DB에 저장하여
-- 코드 배포 없이 관리자가 수정 가능하게 함
-- ======================================================

CREATE TABLE IF NOT EXISTS public.parse_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  memo       text,
  updated_at timestamptz DEFAULT now()
);

-- RLS 비활성화 (서비스 롤로만 접근)
ALTER TABLE public.parse_settings DISABLE ROW LEVEL SECURITY;

-- ── 수수료정산 Excel 컬럼 인덱스 (0-based) ────────────────────────────────
-- 현재 파일 기준으로 확인된 정확한 값 (2026-04 처방 실적 파일 검증 완료)
--
-- A=0  B=1  C=2  D=3  E=4  F=5  G=6  H=7  I=8  J=9
-- K=10 L=11 M=12 N=13 O=14 P=15 Q=16 R=17 S=18 T=19
-- U=20 V=21 W=22 X=23 Y=24 Z=25 AA=26 AB=27 AC=28 AD=29
-- ──────────────────────────────────────────────────────
INSERT INTO public.parse_settings (key, value, memo)
VALUES (
  'settlement_columns',
  '{
    "hosp_col":  11,
    "mgr_col":   6,
    "cso_col":   8,
    "prod_col":  16,
    "presc_col": 20,
    "type_col":  22,
    "cat_col":   23,
    "sett_col":  29
  }',
  '수수료정산 파일 컬럼 인덱스 (0-based). hosp_col=L열(11), mgr_col=G열(6), cso_col=I열(8), prod_col=Q열(16), presc_col=U열(20), type_col=W열(22), cat_col=X열(23), sett_col=AD열(29). 변경 시 value JSON만 수정.'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      memo  = EXCLUDED.memo,
      updated_at = now();
