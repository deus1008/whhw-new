-- SF 시장분석 전용 UBIST 테이블
-- 종합 export(다년 연간 + 월별)를 담는다. 운영용 ubist_data(월별, D1 파일)와
-- 기간이 겹쳐 이중집계될 수 있어 별도 테이블로 분리한다.
--   · SF 시장분석/실적비교만 이 테이블을 읽는다.
--   · disease-learning·시장분석 등 기존 기능은 ubist_data 그대로 사용(무영향).

create table if not exists ubist_market (
  id               bigint generated always as identity primary key,
  source_file      text not null,
  period           text not null,          -- 연간 'YYYY' 또는 월별 'YYYY-MM'
  atc_code         text,
  seller           text,                   -- 판매사(마케팅사, 수수료 대상)
  manufacturer     text,                   -- 제조사(제조원)
  product_name     text,
  brand            text,
  price            integer,                -- 약가(파일 표기)
  ingredient       text,                   -- 성분(영문)
  ingredient_name  text,                   -- 성분용량 = ubist_data.ingredient_name 포맷 '[...ATB]'
  insurance_code   text,                   -- 약품코드(9자리)
  is_original      boolean,                -- Generic 컬럼: Original→true
  prescription_amount bigint,              -- 처방조제액(원)
  created_at       timestamptz not null default now()
);

create index if not exists ubist_market_ingredient_idx on ubist_market (ingredient_name);
create index if not exists ubist_market_code_idx       on ubist_market (insurance_code);
create index if not exists ubist_market_source_idx     on ubist_market (source_file);

alter table ubist_market enable row level security;
drop policy if exists ubist_market_read on ubist_market;
create policy ubist_market_read on ubist_market
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));
