-- ข้อมูลตัวอย่าง WarehouseOS
-- ให้รันไฟล์ 20260820_warehouse_map.sql ก่อน แล้วจึงรันไฟล์นี้

begin;

-- ผังตัวอย่าง: พื้นที่รับเข้า, A5/B3 ชั้น 1-3, พื้นที่จ่ายออก
insert into public.warehouse_zones
  (name, location_code, floor, pos_x, pos_y, width, height, color)
values
  ('พื้นที่รับเข้า', 'RECEIVE', 'ชั้น 1', 30, 210, 170, 100, '#c8972a'),
  ('ชั้นวาง A5', 'A5', 'ชั้น 1', 250, 70, 250, 100, '#3f83cc'),
  ('ชั้นวาง A5', 'A5', 'ชั้น 2', 250, 200, 250, 100, '#1e6bbf'),
  ('ชั้นวาง A5', 'A5', 'ชั้น 3', 250, 330, 250, 100, '#164d86'),
  ('ชั้นวาง B3', 'B3', 'ชั้น 1', 560, 70, 250, 100, '#48a36a'),
  ('ชั้นวาง B3', 'B3', 'ชั้น 2', 560, 200, 250, 100, '#0e7c3a'),
  ('ชั้นวาง B3', 'B3', 'ชั้น 3', 560, 330, 250, 100, '#075828'),
  ('พื้นที่จ่ายออก', 'DISPATCH', 'ชั้น 1', 870, 210, 190, 100, '#c0392b')
on conflict (location_code, floor) do update set
  name = excluded.name,
  pos_x = excluded.pos_x,
  pos_y = excluded.pos_y,
  width = excluded.width,
  height = excluded.height,
  color = excluded.color;

-- จัดตำแหน่งข้อมูลเก่า "โกดัง 6" ให้อยู่เป็นสัดส่วน หากมีอยู่แล้ว
update public.warehouse_zones
set
  name = 'พื้นที่เดิม โกดัง 6',
  pos_x = 870,
  pos_y = 350,
  width = 220,
  height = 100,
  color = '#6d4bb4'
where location_code = 'โกดัง 6';

-- สร้างชั้นวางจริงในแต่ละโซน เพื่อรองรับการขยายเป็นช่องเก็บภายหลัง
with rack_seed(location_code, floor, rack_name, rack_code) as (
  values
    ('A5', 'ชั้น 1', 'ชั้นวาง A5 ชั้น 1', 'A5'),
    ('A5', 'ชั้น 2', 'ชั้นวาง A5 ชั้น 2', 'A5'),
    ('A5', 'ชั้น 3', 'ชั้นวาง A5 ชั้น 3', 'A5'),
    ('B3', 'ชั้น 1', 'ชั้นวาง B3 ชั้น 1', 'B3'),
    ('B3', 'ชั้น 2', 'ชั้นวาง B3 ชั้น 2', 'B3'),
    ('B3', 'ชั้น 3', 'ชั้นวาง B3 ชั้น 3', 'B3')
)
insert into public.warehouse_racks
  (zone_id, name, code, pos_x, pos_y, width, height)
select zone.id, rack_seed.rack_name, rack_seed.rack_code, 12, 12, 220, 70
from rack_seed
join public.warehouse_zones as zone
  on zone.location_code = rack_seed.location_code
 and zone.floor = rack_seed.floor
on conflict (zone_id, code) do update set
  name = excluded.name,
  pos_x = excluded.pos_x,
  pos_y = excluded.pos_y,
  width = excluded.width,
  height = excluded.height;

-- ช่องเก็บหนึ่งช่องต่อหนึ่งระดับชั้นสำหรับชุดสาธิต
with bin_seed(location_code, floor, rack_code, bin_code, shelf_level) as (
  values
    ('A5', 'ชั้น 1', 'A5', 'A5-L1', 1),
    ('A5', 'ชั้น 2', 'A5', 'A5-L2', 2),
    ('A5', 'ชั้น 3', 'A5', 'A5-L3', 3),
    ('B3', 'ชั้น 1', 'B3', 'B3-L1', 1),
    ('B3', 'ชั้น 2', 'B3', 'B3-L2', 2),
    ('B3', 'ชั้น 3', 'B3', 'B3-L3', 3)
)
insert into public.warehouse_bins (rack_id, code, shelf_level, row_no, col_no)
select rack.id, bin_seed.bin_code, bin_seed.shelf_level, 1, 1
from bin_seed
join public.warehouse_zones as zone
  on zone.location_code = bin_seed.location_code
 and zone.floor = bin_seed.floor
join public.warehouse_racks as rack
  on rack.zone_id = zone.id
 and rack.code = bin_seed.rack_code
on conflict (rack_id, code) do update set
  shelf_level = excluded.shelf_level,
  row_no = excluded.row_no,
  col_no = excluded.col_no;

do $$
declare
  demo_deposit_id public.deposits.id%type;
begin
  select id into demo_deposit_id
  from public.deposits
  where tracking_id = 'DEMO-WH-001'
  limit 1;

  if demo_deposit_id is null then
    insert into public.deposits
      (tracking_id, customer_name, customer_phone, deposit_date, staff_received_name)
    values
      ('DEMO-WH-001', 'ข้อมูลตัวอย่าง WarehouseOS', '000-000-0000', current_date, 'พนักงานตัวอย่าง')
    returning id into demo_deposit_id;
  else
    update public.deposits
    set
      customer_name = 'ข้อมูลตัวอย่าง WarehouseOS',
      customer_phone = '000-000-0000',
      deposit_date = current_date,
      staff_received_name = 'พนักงานตัวอย่าง'
    where id = demo_deposit_id;
  end if;

  -- ทำให้ไฟล์นี้รันซ้ำได้ โดยรีเซ็ตเฉพาะประวัติและสินค้าที่มีรหัส DEMO-
  delete from public.withdrawals
  where deposit_item_id in (
    select id
    from public.deposit_items
    where deposit_id = demo_deposit_id
      and item_code like 'DEMO-%'
  );

  delete from public.deposit_items
  where deposit_id = demo_deposit_id
    and item_code like 'DEMO-%';

  insert into public.deposit_items
    (
      deposit_id,
      item_name,
      item_code,
      quantity,
      remaining_quantity,
      unit,
      status,
      detail,
      warehouse_zone_id,
      warehouse_rack_id,
      warehouse_bin_id
    )
  select
    demo_deposit_id,
    product.item_name,
    product.item_code,
    product.quantity,
    product.quantity,
    product.unit,
    'กำลังฝาก',
    product.detail,
    zone.id,
    rack.id,
    bin.id
  from (
    values
      ('กล่องพัสดุ Size M', 'DEMO-001', 120, 'กล่อง', 'สินค้าตัวอย่างสำหรับ A5 ชั้น 1', 'A5', 'ชั้น 1', 'A5-L1'),
      ('เทปกาวใส 48 มม.', 'DEMO-002', 48, 'ม้วน', 'สินค้าตัวอย่างสำหรับ A5 ชั้น 2', 'A5', 'ชั้น 2', 'A5-L2'),
      ('ริบบอนดำ Wax 110 มม.', 'DEMO-003', 24, 'ม้วน', 'สินค้าตัวอย่างสำหรับ A5 ชั้น 3', 'A5', 'ชั้น 3', 'A5-L3'),
      ('ถุงซิปล็อก 20x30 ซม.', 'DEMO-004', 75, 'แพ็ก', 'สินค้าตัวอย่างสำหรับ B3 ชั้น 1', 'B3', 'ชั้น 1', 'B3-L1'),
      ('สติกเกอร์ FRAGILE', 'DEMO-005', 36, 'ม้วน', 'สินค้าตัวอย่างสำหรับ B3 ชั้น 2', 'B3', 'ชั้น 2', 'B3-L2'),
      ('เครื่องสแกนบาร์โค้ด', 'DEMO-006', 6, 'เครื่อง', 'สินค้าตัวอย่างสำหรับ B3 ชั้น 3', 'B3', 'ชั้น 3', 'B3-L3')
  ) as product(item_name, item_code, quantity, unit, detail, location_code, floor, bin_code)
  join public.warehouse_zones as zone
    on zone.location_code = product.location_code
   and zone.floor = product.floor
  join public.warehouse_racks as rack
    on rack.zone_id = zone.id
   and rack.code = product.location_code
  join public.warehouse_bins as bin
    on bin.rack_id = rack.id
   and bin.code = product.bin_code;
end;
$$;

commit;

-- ค้นหาทดสอบได้ด้วย: DEMO-001, DEMO-002, ... DEMO-006
