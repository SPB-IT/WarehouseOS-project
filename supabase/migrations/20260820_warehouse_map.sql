begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.warehouse_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_code text not null,
  floor text not null default 'ชั้น 1',
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  width double precision not null default 160 check (width >= 40),
  height double precision not null default 100 check (height >= 40),
  color text not null default '#1e6bbf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_code, floor)
);

create table if not exists public.warehouse_racks (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.warehouse_zones(id) on delete cascade,
  name text not null,
  code text not null,
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  width double precision not null default 80 check (width >= 20),
  height double precision not null default 40 check (height >= 20),
  rotation double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, code)
);

create table if not exists public.warehouse_bins (
  id uuid primary key default gen_random_uuid(),
  rack_id uuid not null references public.warehouse_racks(id) on delete cascade,
  code text not null,
  shelf_level integer,
  row_no integer,
  col_no integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rack_id, code)
);

alter table public.deposit_items
  add column if not exists warehouse_zone_id uuid
  references public.warehouse_zones(id) on delete set null;

alter table public.deposit_items
  add column if not exists warehouse_rack_id uuid
  references public.warehouse_racks(id) on delete set null;

alter table public.deposit_items
  add column if not exists warehouse_bin_id uuid
  references public.warehouse_bins(id) on delete set null;

create index if not exists warehouse_racks_zone_id_idx
  on public.warehouse_racks(zone_id);
create index if not exists warehouse_bins_rack_id_idx
  on public.warehouse_bins(rack_id);
create index if not exists deposit_items_warehouse_zone_id_idx
  on public.deposit_items(warehouse_zone_id);
create index if not exists deposit_items_warehouse_rack_id_idx
  on public.deposit_items(warehouse_rack_id);
create index if not exists deposit_items_warehouse_bin_id_idx
  on public.deposit_items(warehouse_bin_id);

drop trigger if exists warehouse_zones_set_updated_at on public.warehouse_zones;
create trigger warehouse_zones_set_updated_at
before update on public.warehouse_zones
for each row execute function public.set_updated_at();

drop trigger if exists warehouse_racks_set_updated_at on public.warehouse_racks;
create trigger warehouse_racks_set_updated_at
before update on public.warehouse_racks
for each row execute function public.set_updated_at();

drop trigger if exists warehouse_bins_set_updated_at on public.warehouse_bins;
create trigger warehouse_bins_set_updated_at
before update on public.warehouse_bins
for each row execute function public.set_updated_at();

create or replace function public.sync_deposit_item_storage_location()
returns trigger
language plpgsql
as $$
declare
  zone_record public.warehouse_zones%rowtype;
begin
  if new.warehouse_zone_id is not null then
    select * into zone_record
    from public.warehouse_zones
    where id = new.warehouse_zone_id;

    if found then
      new.storage_location = concat_ws(' / ', zone_record.location_code, zone_record.floor);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deposit_items_sync_storage_location on public.deposit_items;
create trigger deposit_items_sync_storage_location
before insert or update of warehouse_zone_id on public.deposit_items
for each row execute function public.sync_deposit_item_storage_location();

alter table public.warehouse_zones enable row level security;
alter table public.warehouse_racks enable row level security;
alter table public.warehouse_bins enable row level security;

drop policy if exists "warehouse_zones_public_access" on public.warehouse_zones;
create policy "warehouse_zones_public_access"
on public.warehouse_zones for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "warehouse_racks_public_access" on public.warehouse_racks;
create policy "warehouse_racks_public_access"
on public.warehouse_racks for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "warehouse_bins_public_access" on public.warehouse_bins;
create policy "warehouse_bins_public_access"
on public.warehouse_bins for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.warehouse_zones to anon, authenticated;
grant select, insert, update, delete on public.warehouse_racks to anon, authenticated;
grant select, insert, update, delete on public.warehouse_bins to anon, authenticated;

insert into public.warehouse_zones
  (id, name, location_code, floor, pos_x, pos_y, width, height, color, created_at)
values
  ('2c33d56c-2529-49c5-8ccf-4414d58de151', 'A', 'A', 'ชั้น 1', 50, 50, 150, 100, '#f59e0b', '2026-08-19T03:36:23.872+00:00'),
  ('ba3fb60a-0269-4fe3-8d11-de900c830754', 'B', 'B', 'ชั้น 1', 80, 70, 150, 100, '#8b5cf6', '2026-08-19T03:38:08.436+00:00'),
  ('bb6b7ef5-0093-42ba-8329-4b71e51168d2', 'C', 'C', 'ชั้น 1', 110, 90, 150, 100, '#22c55e', '2026-08-19T03:42:43.010+00:00'),
  ('4e0dcc59-4890-445d-9dc8-f6f528da3a93', 'D', 'D', 'ชั้น 1', 140, 110, 150, 100, '#8b5cf6', '2026-08-19T03:42:58.293+00:00'),
  ('53309675-5549-40ab-9d16-553c41541ce2', 'E', 'E', 'ชั้น 1', 170, 130, 150, 100, '#ef4444', '2026-08-19T03:43:00.391+00:00'),
  ('f08e0a24-8744-47c0-89c6-db8618c63907', 'F', 'F', 'ชั้น 1', 200, 150, 150, 100, '#3b82f6', '2026-08-19T03:43:02.758+00:00'),
  ('e75556cd-f97a-4c56-b446-be63825323af', 'G', 'G', 'ชั้น 1', 230, 170, 150, 100, '#22c55e', '2026-08-19T03:43:05.376+00:00'),
  ('25138ced-8edf-4169-9c6d-5db5db3d6204', 'ฺB', 'B-2', 'ชั้น 1', 260, 190, 150, 100, '#22c55e', '2026-08-19T03:50:41.874+00:00'),
  ('9a276fc3-6486-4be1-aff6-444c29f1c4df', 'A', 'A-2', 'ชั้น 1', 40, 40, 160, 100, '#ec4899', '2026-08-19T03:59:49.527+00:00'),
  ('7edd69ee-061f-48f5-b5a8-e0337a95cf0a', 'B', 'B-3', 'ชั้น 1', 40, 40, 160, 100, '#ef4444', '2026-08-19T04:00:41.148+00:00')
on conflict (id) do update set
  name = excluded.name,
  location_code = excluded.location_code,
  floor = excluded.floor,
  pos_x = excluded.pos_x,
  pos_y = excluded.pos_y,
  width = excluded.width,
  height = excluded.height,
  color = excluded.color;

-- สร้างโซนเพิ่มจากพิกัดสินค้าเดิมที่ยังไม่มีในผัง เพื่อไม่ให้ข้อมูลเก่าหลุดการเชื่อมโยง
with unmapped_locations as (
  select distinct trim(item.storage_location) as storage_location
  from public.deposit_items as item
  where item.storage_location is not null
    and trim(item.storage_location) <> ''
    and not exists (
      select 1
      from public.warehouse_zones as zone
      where (
        length(regexp_replace(lower(zone.location_code), '[[:space:]/\\,._()-]+', '', 'g')) >= 2
        and regexp_replace(lower(item.storage_location), '[[:space:]/\\,._()-]+', '', 'g')
          like '%' || regexp_replace(lower(zone.location_code), '[[:space:]/\\,._()-]+', '', 'g') || '%'
      )
    )
), numbered_locations as (
  select storage_location, row_number() over (order by storage_location) as row_no
  from unmapped_locations
)
insert into public.warehouse_zones
  (name, location_code, floor, pos_x, pos_y, width, height, color)
select
  'ตำแหน่ง ' || storage_location,
  storage_location,
  'ชั้น 1',
  400 + mod((row_no - 1)::integer, 3) * 220,
  40 + floor((row_no - 1) / 3.0) * 140,
  180,
  110,
  '#1e6bbf'
from numbered_locations
on conflict (location_code, floor) do nothing;

update public.deposit_items as item
set warehouse_zone_id = zone.id
from public.warehouse_zones as zone
where item.warehouse_zone_id is null
  and item.storage_location is not null
  and item.storage_location <> ''
  and (
    length(regexp_replace(lower(zone.location_code), '[[:space:]/\\,._()-]+', '', 'g')) >= 2
    and regexp_replace(lower(item.storage_location), '[[:space:]/\\,._()-]+', '', 'g')
      like '%' || regexp_replace(lower(zone.location_code), '[[:space:]/\\,._()-]+', '', 'g') || '%'
    or length(regexp_replace(lower(zone.name), '[[:space:]/\\,._()-]+', '', 'g')) >= 3
    and regexp_replace(lower(item.storage_location), '[[:space:]/\\,._()-]+', '', 'g')
      like '%' || regexp_replace(lower(zone.name), '[[:space:]/\\,._()-]+', '', 'g') || '%'
  )
  and (
    item.storage_location not like '%ชั้น%'
    or regexp_replace(lower(item.storage_location), '[[:space:]/\\,._()-]+', '', 'g')
      like '%' || regexp_replace(lower(zone.floor), '[[:space:]/\\,._()-]+', '', 'g') || '%'
  );

commit;
