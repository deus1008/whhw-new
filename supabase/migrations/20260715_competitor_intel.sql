-- CSO 경쟁사 동향 인텔리전스
--   competitor_companies : 대상 경쟁사 (추가/삭제 가능)
--   media_sources        : 뉴스 매체 (추가/삭제 가능, 크롤링 검색 URL 포함)
--   competitor_trends    : 동향 항목 (기사/현장청취/보완) — 회사별 시계열

CREATE TABLE IF NOT EXISTS competitor_companies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text UNIQUE NOT NULL,
  display_order int DEFAULT 0,
  active        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE competitor_companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS media_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text UNIQUE NOT NULL,
  base_url      text,
  search_url    text,              -- 크롤링용 검색 URL 템플릿({q} = 검색어)
  active        boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE media_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS competitor_trends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,               -- 대상 경쟁사명
  trend_type   text DEFAULT '기타',          -- 신제품출시 | 정책변경 | 이슈사항 | 현장동향 | 기타
  title        text NOT NULL,
  summary      text,                         -- 핵심 요약(AI/수동)
  content      text,                         -- 상세 내용
  source_name  text,                         -- 매체명 또는 '현장청취'
  url          text,                         -- 기사 링크
  event_date   date,                         -- 기사/이벤트 일자
  is_field     boolean DEFAULT false,        -- 지역장 현장청취 여부
  supplement   text,                         -- 보완내용(추가 파악·확인 못한 내용)
  author_id    uuid,                         -- 작성자(profiles.id)
  author_name  text,                         -- 작성자명
  crawled      boolean DEFAULT false,        -- 자동수집 여부
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ci_trends_company ON competitor_trends(company_name);
CREATE INDEX IF NOT EXISTS idx_ci_trends_date    ON competitor_trends(event_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ci_trends_url ON competitor_trends(url) WHERE url IS NOT NULL;
ALTER TABLE competitor_trends ENABLE ROW LEVEL SECURITY;

-- 대상 경쟁사 시드
INSERT INTO competitor_companies (name, display_order) VALUES
  ('대웅바이오', 1), ('셀트리온제약', 2), ('안국약품', 3), ('동구바이오제약', 4),
  ('마더스제약', 5), ('경동제약', 6), ('휴온스', 7), ('테라젠이텍스', 8)
ON CONFLICT (name) DO NOTHING;

-- 뉴스 매체 시드
INSERT INTO media_sources (name, base_url, display_order) VALUES
  ('데일리팜',  'https://www.dailypharm.com/', 1),
  ('약업신문',  'https://www.yakup.com/',      2),
  ('약사공론',  'https://www.kpanews.co.kr/',  3),
  ('의학신문',  'https://www.bosa.co.kr/',     4),
  ('메디파나',  'https://www.medipana.com/',   5),
  ('약국신문',  'https://www.pharm21.com/',    6)
ON CONFLICT (name) DO NOTHING;
