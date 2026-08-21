begin;

-- Run this migration only after creating at least one user in Supabase Auth.
-- The oldest existing Auth user becomes admin; later users default to staff.

create table if not exists public.warehouse_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

with ranked_users as (
  select id, row_number() over (order by created_at, id) as user_order
  from auth.users
)
insert into public.warehouse_user_roles (user_id, role)
select id, case when user_order = 1 then 'admin' else 'staff' end
from ranked_users
on conflict (user_id) do nothing;

create or replace function public.handle_new_warehouse_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.warehouse_user_roles (user_id, role)
  values (
    new.id,
    case when exists (select 1 from public.warehouse_user_roles) then 'staff' else 'admin' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists warehouse_user_role_on_signup on auth.users;
create trigger warehouse_user_role_on_signup
after insert on auth.users
for each row execute function public.handle_new_warehouse_user();

create or replace function public.warehouse_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.warehouse_user_roles where user_id = auth.uid();
$$;

alter table public.deposit_items
  add column if not exists is_demo boolean not null default false;

update public.deposit_items item
set is_demo = true
where item.item_code ilike 'MOCK-%'
   or item.item_code ilike 'DEMO-%'
   or exists (
     select 1 from public.deposits deposit
     where deposit.id = item.deposit_id
       and deposit.tracking_id ilike 'DEMO-%'
   );

update public.deposit_items
set detail = regexp_replace(detail, '\s*[·/]\s*(พาเลต|ช่องย่อย)\s*[0-9]+', '', 'g')
where is_demo and (detail like '%พาเลต%' or detail like '%ช่องย่อย%');

create index if not exists deposit_items_is_demo_idx
  on public.deposit_items(is_demo);

create unique index if not exists deposits_tracking_id_unique_idx
  on public.deposits(tracking_id);

alter table public.warehouse_zones
  add column if not exists is_archived boolean not null default false;

update public.warehouse_zones
set is_archived = true
where location_code not in ('S', 'R', 'L', 'N', 'A', 'B', 'C', 'D', 'E', 'F')
  and not exists (
    select 1 from public.deposit_items
    where warehouse_zone_id = warehouse_zones.id
  );

create index if not exists warehouse_zones_active_idx
  on public.warehouse_zones(is_archived, location_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposit_items_quantity_valid'
      and conrelid = 'public.deposit_items'::regclass
  ) then
    alter table public.deposit_items
      add constraint deposit_items_quantity_valid
      check (quantity > 0 and remaining_quantity >= 0 and remaining_quantity <= quantity);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'withdrawals_quantity_positive'
      and conrelid = 'public.withdrawals'::regclass
  ) then
    alter table public.withdrawals
      add constraint withdrawals_quantity_positive check (withdraw_quantity > 0);
  end if;
end;
$$;

create or replace function public.sync_deposit_item_storage_location()
returns trigger
language plpgsql
as $$
declare
  zone_record public.warehouse_zones%rowtype;
  rack_record public.warehouse_racks%rowtype;
  bin_record public.warehouse_bins%rowtype;
  rack_number integer;
begin
  if new.warehouse_zone_id is null then
    return new;
  end if;

  select * into zone_record from public.warehouse_zones where id = new.warehouse_zone_id;
  if not found then raise exception 'ไม่พบโซนที่เลือก'; end if;

  if new.warehouse_rack_id is null or new.warehouse_bin_id is null then
    new.storage_location = concat_ws(' / ', zone_record.location_code, zone_record.floor);
    return new;
  end if;

  select * into rack_record
  from public.warehouse_racks
  where id = new.warehouse_rack_id and zone_id = new.warehouse_zone_id;
  if not found then raise exception 'Rack ที่เลือกไม่ได้อยู่ในโซนนี้'; end if;

  select * into bin_record
  from public.warehouse_bins
  where id = new.warehouse_bin_id and rack_id = new.warehouse_rack_id;
  if not found then raise exception 'ชั้นที่เลือกไม่ได้อยู่ใน Rack นี้'; end if;

  rack_number = nullif(substring(rack_record.code from '-R0*([0-9]+)$'), '')::integer;
  new.storage_location = format(
    'ช่อง %s / ชั้น %s / Rack %s',
    zone_record.location_code,
    coalesce(bin_record.shelf_level, 1),
    coalesce(rack_number, 1)
  );
  return new;
end;
$$;

-- หนึ่ง Rack มีหนึ่งตำแหน่งต่อชั้น: รวมสินค้าจากช่องย่อยเดิมเข้าชั้นเดียวกัน
with ranked_bins as (
  select
    id,
    first_value(id) over (
      partition by rack_id, shelf_level
      order by coalesce(col_no, 1), id
    ) as canonical_id
  from public.warehouse_bins
)
update public.deposit_items item
set warehouse_bin_id = ranked_bins.canonical_id
from ranked_bins
where item.warehouse_bin_id = ranked_bins.id
  and item.warehouse_bin_id is distinct from ranked_bins.canonical_id;

with ranked_bins as (
  select
    id,
    row_number() over (
      partition by rack_id, shelf_level
      order by coalesce(col_no, 1), id
    ) as position_rank
  from public.warehouse_bins
)
delete from public.warehouse_bins bin
using ranked_bins
where bin.id = ranked_bins.id
  and ranked_bins.position_rank > 1
  and not exists (
    select 1 from public.deposit_items item where item.warehouse_bin_id = bin.id
  );

update public.warehouse_bins set col_no = 1 where coalesce(col_no, 1) <> 1;
update public.warehouse_zones set pallets_per_level = 1 where coalesce(pallets_per_level, 1) <> 1;

update public.deposit_items
set warehouse_bin_id = warehouse_bin_id
where warehouse_zone_id is not null;

create or replace function public.create_warehouse_deposit(
  p_tracking_id text,
  p_customer_name text,
  p_customer_phone text,
  p_deposit_date timestamptz,
  p_staff_received_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_deposit_id bigint;
  first_item_id bigint;
  item jsonb;
  item_quantity integer;
  new_item_id bigint;
begin
  if public.warehouse_current_role() not in ('admin', 'staff') then
    raise exception 'ไม่มีสิทธิ์รับฝากสินค้า';
  end if;
  if nullif(trim(p_customer_name), '') is null then raise exception 'กรุณาระบุชื่อผู้ฝาก'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  insert into public.deposits (
    tracking_id, customer_name, customer_phone, deposit_date, staff_received_name
  ) values (
    p_tracking_id, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
    coalesce(p_deposit_date, now()), nullif(trim(p_staff_received_name), '')
  ) returning id into new_deposit_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity = coalesce((item ->> 'quantity')::integer, 0);
    if nullif(trim(item ->> 'item_name'), '') is null or item_quantity <= 0 then
      raise exception 'ชื่อสินค้าและจำนวนต้องถูกต้อง';
    end if;

    insert into public.deposit_items (
      deposit_id, item_name, item_code, quantity, remaining_quantity, unit, status,
      warehouse_zone_id, warehouse_rack_id, warehouse_bin_id,
      detail, item_image_url, is_demo
    ) values (
      new_deposit_id,
      trim(item ->> 'item_name'),
      nullif(trim(item ->> 'item_code'), ''),
      item_quantity,
      item_quantity,
      coalesce(nullif(trim(item ->> 'unit'), ''), 'ชิ้น'),
      'กำลังฝาก',
      nullif(item ->> 'warehouse_zone_id', '')::uuid,
      nullif(item ->> 'warehouse_rack_id', '')::uuid,
      nullif(item ->> 'warehouse_bin_id', '')::uuid,
      nullif(trim(item ->> 'detail'), ''),
      nullif(trim(item ->> 'item_image_url'), ''),
      coalesce((item ->> 'is_demo')::boolean, false)
    ) returning id into new_item_id;

    first_item_id = coalesce(first_item_id, new_item_id);
  end loop;

  return jsonb_build_object(
    'deposit_id', new_deposit_id,
    'tracking_id', p_tracking_id,
    'first_item_id', first_item_id
  );
end;
$$;

create or replace function public.return_warehouse_items(
  p_items jsonb,
  p_staff_name text,
  p_remark text default null
)
returns table (withdrawal_id bigint, deposit_item_id bigint, remaining_quantity integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_item jsonb;
  current_item public.deposit_items%rowtype;
  return_quantity integer;
  new_remaining integer;
  new_withdrawal_id bigint;
begin
  if public.warehouse_current_role() not in ('admin', 'staff') then
    raise exception 'ไม่มีสิทธิ์คืนสินค้า';
  end if;
  if nullif(trim(p_staff_name), '') is null then raise exception 'กรุณาระบุชื่อพนักงาน'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'กรุณาเลือกสินค้าที่ต้องการคืน';
  end if;

  for request_item in select value from jsonb_array_elements(p_items)
  loop
    select * into current_item
    from public.deposit_items
    where id = (request_item ->> 'deposit_item_id')::bigint
    for update;

    if not found then raise exception 'ไม่พบสินค้าที่เลือก'; end if;
    return_quantity = coalesce((request_item ->> 'quantity')::integer, 0);
    if return_quantity <= 0 or return_quantity > current_item.remaining_quantity then
      raise exception 'จำนวนคืนของสินค้า % ไม่ถูกต้อง', current_item.item_name;
    end if;

    insert into public.withdrawals (
      deposit_item_id, withdraw_quantity, staff_signature_name, remark, status
    ) values (
      current_item.id, return_quantity, trim(p_staff_name),
      coalesce(nullif(trim(p_remark), ''), 'คืนสินค้าเรียบร้อยแล้ว'), 'completed'
    ) returning id into new_withdrawal_id;

    new_remaining = current_item.remaining_quantity - return_quantity;
    update public.deposit_items
    set remaining_quantity = new_remaining,
        status = case when new_remaining <= 0 then 'คืนแล้ว' else 'กำลังฝาก' end
    where id = current_item.id;

    withdrawal_id = new_withdrawal_id;
    deposit_item_id = current_item.id;
    remaining_quantity = new_remaining;
    return next;
  end loop;
end;
$$;

create or replace function public.update_warehouse_deposit(
  p_deposit_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_deposit_date timestamptz,
  p_staff_received_name text,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_deposit public.deposits%rowtype;
  item jsonb;
  item_quantity integer;
begin
  if public.warehouse_current_role() not in ('admin', 'staff') then
    raise exception 'ไม่มีสิทธิ์แก้ไขใบรับฝาก';
  end if;

  select * into current_deposit
  from public.deposits
  where id = p_deposit_id
  for update;
  if not found then raise exception 'ไม่พบใบรับฝาก'; end if;
  if nullif(trim(p_customer_name), '') is null then raise exception 'กรุณาระบุชื่อผู้ฝาก'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'รูปแบบสินค้าไม่ถูกต้อง'; end if;

  update public.deposits
  set customer_name = trim(p_customer_name),
      customer_phone = nullif(trim(p_customer_phone), ''),
      deposit_date = coalesce(p_deposit_date, deposit_date),
      staff_received_name = nullif(trim(p_staff_received_name), '')
  where id = p_deposit_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity = coalesce((item ->> 'quantity')::integer, 0);
    if nullif(trim(item ->> 'item_name'), '') is null or item_quantity <= 0 then
      raise exception 'ชื่อสินค้าและจำนวนต้องถูกต้อง';
    end if;
    insert into public.deposit_items (
      deposit_id, item_name, item_code, quantity, remaining_quantity, unit, status,
      warehouse_zone_id, warehouse_rack_id, warehouse_bin_id, detail, item_image_url, is_demo
    ) values (
      p_deposit_id, trim(item ->> 'item_name'), nullif(trim(item ->> 'item_code'), ''),
      item_quantity, item_quantity, coalesce(nullif(trim(item ->> 'unit'), ''), 'ชิ้น'), 'กำลังฝาก',
      nullif(item ->> 'warehouse_zone_id', '')::uuid,
      nullif(item ->> 'warehouse_rack_id', '')::uuid,
      nullif(item ->> 'warehouse_bin_id', '')::uuid,
      nullif(trim(item ->> 'detail'), ''), nullif(trim(item ->> 'item_image_url'), ''), false
    );
  end loop;

  return jsonb_build_object('deposit_id', p_deposit_id, 'tracking_id', current_deposit.tracking_id);
end;
$$;

create or replace function public.warehouse_dashboard_stats(p_include_demo boolean default true)
returns table (
  total_deposits bigint,
  total_items bigint,
  total_quantity bigint,
  total_remaining bigint,
  active_items bigint,
  returned_items bigint,
  total_withdrawals bigint,
  demo_items bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.warehouse_current_role() not in ('admin', 'staff') then
    raise exception 'ไม่มีสิทธิ์ดูข้อมูลคลัง';
  end if;

  return query
  select
    (select count(*) from public.deposits),
    count(item.id),
    coalesce(sum(item.quantity), 0)::bigint,
    coalesce(sum(item.remaining_quantity), 0)::bigint,
    count(*) filter (where item.status <> 'คืนแล้ว' and item.remaining_quantity > 0),
    count(*) filter (where item.status = 'คืนแล้ว' or item.remaining_quantity <= 0),
    (select count(*) from public.withdrawals),
    count(*) filter (where item.is_demo)
  from public.deposit_items item
  where p_include_demo or not item.is_demo;
end;
$$;

alter table public.warehouse_user_roles enable row level security;
alter table public.deposits enable row level security;
alter table public.deposit_items enable row level security;
alter table public.withdrawals enable row level security;
alter table public.warehouse_zones enable row level security;
alter table public.warehouse_racks enable row level security;
alter table public.warehouse_bins enable row level security;
alter table public.warehouse_location_movements enable row level security;

do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'warehouse_user_roles', 'deposits', 'deposit_items', 'withdrawals',
        'warehouse_zones', 'warehouse_racks', 'warehouse_bins', 'warehouse_location_movements'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end;
$$;

create policy warehouse_roles_read_own on public.warehouse_user_roles
for select to authenticated
using (user_id = auth.uid() or public.warehouse_current_role() = 'admin');
create policy warehouse_roles_admin_manage on public.warehouse_user_roles
for all to authenticated
using (public.warehouse_current_role() = 'admin')
with check (public.warehouse_current_role() = 'admin');

create policy deposits_staff_read on public.deposits for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));
create policy deposits_staff_insert on public.deposits for insert to authenticated
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy deposits_staff_update on public.deposits for update to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'))
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy deposits_admin_delete on public.deposits for delete to authenticated
using (public.warehouse_current_role() = 'admin');

create policy items_staff_read on public.deposit_items for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));
create policy items_staff_insert on public.deposit_items for insert to authenticated
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy items_staff_update on public.deposit_items for update to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'))
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy items_admin_delete on public.deposit_items for delete to authenticated
using (public.warehouse_current_role() = 'admin');

create policy withdrawals_staff_read on public.withdrawals for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));
create policy withdrawals_staff_insert on public.withdrawals for insert to authenticated
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy withdrawals_admin_update on public.withdrawals for update to authenticated
using (public.warehouse_current_role() = 'admin')
with check (public.warehouse_current_role() = 'admin');
create policy withdrawals_admin_delete on public.withdrawals for delete to authenticated
using (public.warehouse_current_role() = 'admin');

create policy zones_staff_read on public.warehouse_zones for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));
create policy zones_staff_write on public.warehouse_zones for insert to authenticated
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy zones_staff_update on public.warehouse_zones for update to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'))
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy zones_admin_delete on public.warehouse_zones for delete to authenticated
using (public.warehouse_current_role() = 'admin');

create policy racks_staff_read on public.warehouse_racks for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));
create policy racks_staff_write on public.warehouse_racks for insert to authenticated
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy racks_staff_update on public.warehouse_racks for update to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'))
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy racks_admin_delete on public.warehouse_racks for delete to authenticated
using (public.warehouse_current_role() = 'admin');

create policy bins_staff_read on public.warehouse_bins for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));
create policy bins_staff_write on public.warehouse_bins for insert to authenticated
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy bins_staff_update on public.warehouse_bins for update to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'))
with check (public.warehouse_current_role() in ('admin', 'staff'));
create policy bins_admin_delete on public.warehouse_bins for delete to authenticated
using (public.warehouse_current_role() = 'admin');

create policy movements_staff_read on public.warehouse_location_movements for select to authenticated
using (public.warehouse_current_role() in ('admin', 'staff'));

revoke all on public.warehouse_user_roles, public.deposits, public.deposit_items,
  public.withdrawals, public.warehouse_zones, public.warehouse_racks,
  public.warehouse_bins, public.warehouse_location_movements from anon;

grant select on public.warehouse_user_roles to authenticated;
grant select, insert, update, delete on public.deposits, public.deposit_items to authenticated;
grant select, insert, update, delete on public.withdrawals to authenticated;
grant select, insert, update, delete on public.warehouse_zones, public.warehouse_racks, public.warehouse_bins to authenticated;
grant select on public.warehouse_location_movements to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.create_warehouse_deposit(text,text,text,timestamptz,text,jsonb) from public, anon;
revoke all on function public.return_warehouse_items(jsonb,text,text) from public, anon;
revoke all on function public.update_warehouse_deposit(bigint,text,text,timestamptz,text,jsonb) from public, anon;
revoke all on function public.warehouse_dashboard_stats(boolean) from public, anon;
grant execute on function public.create_warehouse_deposit(text,text,text,timestamptz,text,jsonb) to authenticated;
grant execute on function public.return_warehouse_items(jsonb,text,text) to authenticated;
grant execute on function public.update_warehouse_deposit(bigint,text,text,timestamptz,text,jsonb) to authenticated;
grant execute on function public.warehouse_dashboard_stats(boolean) to authenticated;

commit;
