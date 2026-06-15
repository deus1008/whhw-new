'use server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import type { StockAlertItem } from '@/lib/inventory/parse';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Result = { error?: string };

export async function createInventoryItem(data: StockAlertItem): Promise<Result> {
  const svc = getSvc();
  const { error } = await svc.from('inventory_items').insert([{
    alert_type:     data.alert_type,
    product_code:   data.product_code,
    product_name:   data.product_name,
    sales_3m:       data.sales_3m,
    sales_month:    data.sales_month,
    stock_amount:   data.stock_amount,
    stock_days:     data.stock_days,
    stockout_start: data.stockout_start,
    supply_date:    data.supply_date,
    stockout_days:  data.stockout_days,
    manufacturer:   data.manufacturer,
    cause:          data.cause,
  }]);
  if (error) return { error: error.message };
  revalidatePath('/inventory');
  return {};
}

export async function updateInventoryItem(id: string, data: StockAlertItem): Promise<Result> {
  const svc = getSvc();
  const { error } = await svc.from('inventory_items').update({
    alert_type:     data.alert_type,
    product_code:   data.product_code,
    product_name:   data.product_name,
    sales_3m:       data.sales_3m,
    sales_month:    data.sales_month,
    stock_amount:   data.stock_amount,
    stock_days:     data.stock_days,
    stockout_start: data.stockout_start,
    supply_date:    data.supply_date,
    stockout_days:  data.stockout_days,
    manufacturer:   data.manufacturer,
    cause:          data.cause,
    updated_at:     new Date().toISOString(),
  }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/inventory');
  return {};
}

export async function deleteInventoryItem(id: string): Promise<Result> {
  const svc = getSvc();
  const { error } = await svc.from('inventory_items').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/inventory');
  return {};
}
