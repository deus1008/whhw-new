-- 일정 유형 테이블
CREATE TABLE IF NOT EXISTS schedule_categories (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  color      text NOT NULL DEFAULT '#94a3b8',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE schedule_categories ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 조회 가능
CREATE POLICY "schedule_categories_read" ON schedule_categories
  FOR SELECT TO authenticated USING (true);

-- 기본 카테고리 삽입 (기존 값 유지)
INSERT INTO schedule_categories (name, color, sort_order) VALUES
  ('학술대회',   '#a78bfa', 0),
  ('심포지엄',   '#22d3ee', 1),
  ('제품설명회', '#34d399', 2),
  ('영업관리',   '#fb923c', 3),
  ('영업미팅',   '#60a5fa', 4),
  ('기타',       '#94a3b8', 5)
ON CONFLICT (name) DO NOTHING;
