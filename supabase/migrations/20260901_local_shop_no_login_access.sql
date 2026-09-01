begin;

-- WarehouseOS ชุดนี้ใช้งานภายในโรงงานโดยไม่ผ่านหน้าล็อกอิน
-- anonymous session จึงทำงานในระดับพนักงานได้ แต่ไม่เข้าถึงตารางบัญชีผู้ใช้
create or replace function public.warehouse_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'staff'
    else coalesce(
      (select role from public.warehouse_user_roles where user_id = auth.uid()),
      'staff'
    )
  end;
$$;

drop policy if exists deposits_no_login_access on public.deposits;
create policy deposits_no_login_access
on public.deposits for all
to anon
using (true)
with check (true);

drop policy if exists items_no_login_access on public.deposit_items;
create policy items_no_login_access
on public.deposit_items for all
to anon
using (true)
with check (true);

drop policy if exists withdrawals_no_login_access on public.withdrawals;
create policy withdrawals_no_login_access
on public.withdrawals for all
to anon
using (true)
with check (true);

drop policy if exists zones_no_login_access on public.warehouse_zones;
create policy zones_no_login_access
on public.warehouse_zones for all
to anon
using (true)
with check (true);

drop policy if exists racks_no_login_access on public.warehouse_racks;
create policy racks_no_login_access
on public.warehouse_racks for all
to anon
using (true)
with check (true);

drop policy if exists bins_no_login_access on public.warehouse_bins;
create policy bins_no_login_access
on public.warehouse_bins for all
to anon
using (true)
with check (true);

drop policy if exists movements_no_login_read on public.warehouse_location_movements;
create policy movements_no_login_read
on public.warehouse_location_movements for select
to anon
using (true);

grant select, insert, update, delete
on public.deposits, public.deposit_items, public.withdrawals,
   public.warehouse_zones, public.warehouse_racks, public.warehouse_bins
to anon;

grant select on public.warehouse_location_movements to anon;
grant usage, select on all sequences in schema public to anon;

grant execute on function public.create_warehouse_deposit(text,text,text,timestamptz,text,jsonb) to anon;
grant execute on function public.return_warehouse_items(jsonb,text,text) to anon;
grant execute on function public.update_warehouse_deposit(bigint,text,text,timestamptz,text,jsonb) to anon;
grant execute on function public.warehouse_dashboard_stats(boolean) to anon;

commit;
