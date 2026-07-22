-- SF 신규발매 출시 유형(same/formulation/salt/other) 저장
alter table sales_forecasts
  add column if not exists launch_type text default 'same';

notify pgrst, 'reload schema';
