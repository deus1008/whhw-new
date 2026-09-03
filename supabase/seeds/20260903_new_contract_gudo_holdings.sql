-- 신규계약 등록: 구도홀딩스 (담당자 이정원)
-- Supabase SQL Editor에서 실행. 동일 업체·동일 계약시작일 건이 있으면 건너뜀(멱등).

DO $$
DECLARE
  v_user_id    uuid;
  v_company_id uuid;
BEGIN
  -- 담당자(이정원) 계정 → 없으면 관리자 계정으로 대체
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE full_name = '이정원'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE role IN ('관리자', 'admin')
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '등록에 사용할 계정(이정원 또는 관리자)을 찾을 수 없습니다.';
  END IF;

  -- 위탁사(아주약품) 격리 컬럼
  SELECT id INTO v_company_id
  FROM public.client_companies
  WHERE name = '아주약품'
  LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM public.new_contracts
    WHERE company_name = '구도홀딩스' AND contract_start = DATE '2026-08-01'
  ) THEN
    RAISE NOTICE '이미 등록된 계약입니다 — 건너뜀 (구도홀딩스 / 2026-08-01)';
    RETURN;
  END IF;

  INSERT INTO public.new_contracts (
    manager, company_name, contract_type,
    contract_start, contract_end, auto_renewal,
    evidence, details,
    expected_month, expected_amount,
    hospitals,
    contact_name, contact_phone, contact_email,
    memo, user_id, company_id
  ) VALUES (
    '이정원',
    '구도홀딩스',
    '신규계약',
    DATE '2026-08-01',
    DATE '2027-07-31',
    true,                                    -- 연 단위 자동 갱신
    '전산자료 또는 객관적으로 양사가 인정하는 자료 (수기자료 인정 불가)',
    '당사의 판매대행 계약서 및 부대약정서에 준함',
    '8월 EDI부터 입력',
    '2,000만원 이상',
    '영남대영천병원',
    '김동현 대표',
    '010-6501-9269',
    'asanbios@naver.com',
    '대원제약출신 법인으로 영남대영천병원 아나퍼지 dc통과로 대조약 엑스포지 재고 소진후 처방예정 및 소속딜러 아사품목 처방 활동 예정.',
    v_user_id,
    v_company_id
  );

  RAISE NOTICE '신규계약 등록 완료 — 구도홀딩스 / 이정원';
END $$;
