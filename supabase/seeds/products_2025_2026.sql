-- 2025~2026 발매예정/완료 품목 시드 데이터
-- Supabase SQL Editor에서 실행

DO $$
DECLARE
  admin_id uuid;
BEGIN
  -- 관리자 계정 ID 조회
  SELECT id INTO admin_id FROM profiles WHERE role = 'admin' LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION '관리자 계정을 찾을 수 없습니다.';
  END IF;

  -- ── 26년 출시 예정 품목 ───────────────────────────────────────

  INSERT INTO upcoming_products
    (user_id, ingredient, product_name, indication, launch_dates, approval_dates, product_type, status, is_priority)
  VALUES
    (admin_id,
     '사포그릴레이트염산염 100mg',
     '사포나털정 100mg',
     '항혈전제',
     '[{"date":"2026-06","note":""}]',
     '[]',
     '자사', '발매예정', false),

    (admin_id,
     '부데소니드미분화 0.5mg/2mL',
     '풀미케어분무용현탁액',
     '기관지 천식 치료제(흡입제)',
     '[{"date":"2026-07","note":""}]',
     '[]',
     '자사', '발매예정', false),

    (admin_id,
     '펠루비프로펜 30mg',
     '펠루원정 30mg',
     'NSAIDs',
     '[{"date":"2026-09","note":""}]',
     '[]',
     '자사', '발매예정', false),

    (admin_id,
     '아이비엽30%에탄올건조엑스',
     '아이스판F시럽',
     '기관지 치료제(시럽제)',
     '[{"date":"2026-09","note":""}]',
     '[]',
     '자사', '발매예정', false),

    (admin_id,
     '아트로핀 황산염 0.5mg/0.4mL (0.125%)',
     '마이오에이점안액 0.125%',
     '산동제(점안제)',
     '[{"date":"2026-10","note":""}]',
     '[]',
     '자사', '발매예정', false),

    (admin_id,
     '파모티딘 20mg',
     '아주파모티딘정 20mg',
     '소화성궤양용제',
     '[{"date":"2026-10","note":""}]',
     '[]',
     '자사', '발매예정', false),

    (admin_id,
     '브리모니딘 타르타르산염 0.15% 0.3mL',
     '에이간피점안액 0.15%',
     '녹내장 치료제(점안제)',
     '[{"date":"2026-12","note":""}]',
     '[]',
     '자사', '발매예정', false),

  -- ── 25년 하반기~26년 출시 완료 품목 ──────────────────────────

    (admin_id,
     '엠파글리플로진 10.00mg/25.00mg, 메트포르민염산염 1000.00mg',
     '엠파릴듀오서방정',
     '당뇨병 치료제',
     '[{"date":"2025-10","note":""}]',
     '[]',
     '자사', '발매완료', false),

    (admin_id,
     '피타바스타틴칼슘수화물 2.205mg, 페노피브레이트 160mg',
     '피타렛정2/160mg',
     '고지혈증 치료제',
     '[{"date":"2025-11","note":""}]',
     '[]',
     '자사', '발매완료', false),

    (admin_id,
     '미라베그론 50.0mg',
     '미가론서방정50mg',
     '과민성방광 치료제',
     '[{"date":"2025-12","note":""}]',
     '[]',
     '자사', '발매완료', false),

    (admin_id,
     '니자티딘 150mg',
     '자티놀캡슐 150mg',
     '소화성궤양용제',
     '[{"date":"2026-02","note":""}]',
     '[]',
     '자사', '발매완료', false),

    (admin_id,
     '피나스테리드 1mg',
     '스카페시아정 1mg',
     '탈모치료제',
     '[{"date":"2026-02","note":""}]',
     '[]',
     '자사', '발매완료', false);

  RAISE NOTICE '✓ 총 12개 품목이 등록되었습니다. (admin_id: %)', admin_id;
END $$;
