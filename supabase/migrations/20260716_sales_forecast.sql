-- Sales Forecast (SF) 자동 산출
-- 품목별 매출예측 저장. 시장 landscape·실적은 ubist_data 등에서 실시간 계산하므로
-- 이 테이블은 '사람이 확정한 예측 입력값 + AI 근거 + 산출 스냅샷'만 보관한다.

create table if not exists sales_forecasts (
  id               uuid primary key default gen_random_uuid(),

  -- 시장 정의 단위: ubist_data.ingredient_name (예: 'finasteride 1mg [159001ATB]')
  ingredient_key   text not null,
  product_name     text not null,          -- 당사 예정/기존 품목명
  insurance_code   text,                   -- 실적(UBIST) 매칭용 9자리(있으면)

  -- 입력값
  launch_price     integer,                -- 발매예상약가(원)
  insurance_price  integer,                -- 약가(원)
  price_factor     numeric(6,4) default 0.93,   -- 순공급가 계수(부가세 후 할인)
  cost_ratio       numeric(6,4),           -- 원가율 (0~1)
  commission_rate  numeric(6,4),           -- 수수료율 (0~1)
  pack_units       jsonb default '[]'::jsonb,   -- [{"label":"30T","tabsPerBox":30}, ...]
  manufacturing_lot integer,               -- 제조단위(정)
  dev_cost         bigint,                 -- 개발비(원) — 회수기간 계산용

  -- 예측: [{"y":1,"amount":200000000,"growth":null}, {"y":2,"amount":260000000,"growth":0.30}, ...]
  years            jsonb not null default '[]'::jsonb,

  ai_rationale     text,                   -- AI 근거 서술
  market_snapshot  jsonb,                  -- 산출 시점 시장표(재현성)
  status           text not null default 'draft',   -- draft | confirmed

  created_by       uuid references auth.users(id),
  company_id       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists sales_forecasts_ingredient_idx on sales_forecasts (ingredient_key);
create index if not exists sales_forecasts_created_idx     on sales_forecasts (created_at desc);

alter table sales_forecasts enable row level security;

-- 승인 사용자는 읽기. 쓰기는 서비스롤(서버 액션)에서만 → 정책 미부여.
drop policy if exists sales_forecasts_read on sales_forecasts;
create policy sales_forecasts_read on sales_forecasts
  for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.status = 'approved'
  ));
