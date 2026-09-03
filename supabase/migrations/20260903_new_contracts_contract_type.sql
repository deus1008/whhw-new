-- new_contracts.contract_type — 앱 코드(ContractsClient / contracts actions)는 이미 사용 중이나
-- 마이그레이션에 누락되어 있어 보강. 이미 존재하면 no-op.
ALTER TABLE public.new_contracts
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT '신규계약';

UPDATE public.new_contracts
SET contract_type = '신규계약'
WHERE contract_type IS NULL;
