-- Sales Report: CSO·품목별 월간 처방금액 집계
-- trend_prescriptions(39만행)을 매번 로드하지 않도록 DB에서 GROUP BY.
-- distinct cso≈30, 자사 품목 소수라 결과는 작다(수백 행).

create or replace function get_sales_report_rx()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'by_cso', coalesce((
      select json_agg(row_to_json(t))
      from (
        select cso_name, prescription_month as month, sum(prescription_amount)::bigint as amount
        from trend_prescriptions
        where cso_name is not null and prescription_month is not null
        group by cso_name, prescription_month
      ) t
    ), '[]'::json),
    'by_product', coalesce((
      select json_agg(row_to_json(t))
      from (
        select product_name, prescription_month as month, sum(prescription_amount)::bigint as amount
        from trend_prescriptions
        where product_name is not null and prescription_month is not null
        group by product_name, prescription_month
      ) t
    ), '[]'::json)
  );
$$;

grant execute on function get_sales_report_rx() to authenticated;
