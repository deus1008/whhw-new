-- 영업활동 관련제품을 행 단위로 저장하는 테이블
CREATE TABLE IF NOT EXISTS public.visit_products (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid        NOT NULL REFERENCES public.visit_records(id) ON DELETE CASCADE,
  product_name text        NOT NULL,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_products_visit ON public.visit_products(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_products_name  ON public.visit_products(product_name);

ALTER TABLE public.visit_products ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자: 조회
CREATE POLICY "visit_products_select" ON public.visit_products FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'));

-- 본인 방문 기록의 제품만 삽입
CREATE POLICY "visit_products_insert" ON public.visit_products FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM visit_records vr
    WHERE vr.id = visit_id AND (
      vr.user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('관리자','영업관리총괄','사업총괄'))
    )
  ));

-- 삭제 (CASCADE로 자동 처리되므로 직접 삭제도 허용)
CREATE POLICY "visit_products_delete" ON public.visit_products FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM visit_records vr
    WHERE vr.id = visit_id AND (
      vr.user_id = auth.uid() OR
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('관리자','영업관리총괄','사업총괄'))
    )
  ));
