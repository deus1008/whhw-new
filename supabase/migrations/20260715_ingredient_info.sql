-- 성분 설명(질환학습 '작용기전' 대체)
--   1) drug_permit 에 식약처 공식 효능효과 + 한글 주성분 보관
--   2) 성분별 설명 캐시 테이블

-- ── 1. 허가상세에서 추가로 받아 둘 필드 ─────────────────────────────
alter table drug_permit
  add column if not exists efficacy      text,  -- EE_DOC_DATA(효능효과) 평문
  add column if not exists main_ingr_kor text;  -- MAIN_ITEM_INGR 에서 [코드] 제거한 한글 주성분

-- 성분 → 허가품목 매칭용 (접두 검색)
create index if not exists drug_permit_main_ingr_kor_idx
  on drug_permit (main_ingr_kor text_pattern_ops);

-- ── 2. 성분 설명 캐시 ──────────────────────────────────────────────
create table if not exists ingredient_info (
  ingredient_name text primary key,          -- disease_drugs.ingredient_name 과 동일 표기
  description     text not null,             -- 화면에 보여줄 2~3문장 설명
  drug_class      text,                      -- 계열 (예: HMG-CoA 환원효소 억제제)
  grounded        boolean not null default false,  -- true = 식약처 효능효과 근거, false = 일반지식만
  permit_samples  int  not null default 0,   -- 근거로 쓴 허가품목 수
  reviewed        boolean not null default false,  -- 관리자 검수 완료 여부
  updated_at      timestamptz not null default now()
);

alter table ingredient_info enable row level security;

-- 승인 사용자는 읽기만. 쓰기는 service_role(서버 스크립트/라우트) 전용.
drop policy if exists ingredient_info_read on ingredient_info;
create policy ingredient_info_read on ingredient_info
  for select to authenticated
  using (exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.status = 'approved'
  ));
