begin;

-- คืนชื่อโซนจริง หากรอบทดสอบ Undo ถูกขัดจังหวะก่อนย้อนกลับสำเร็จ
update public.warehouse_zones
set name = 'ของใช้ในบ้าน / ของเล่น'
where location_code = 'S'
  and name = 'ทดสอบ Ctrl Z';

-- ลบเฉพาะโซนชั่วคราวที่เคยสร้างระหว่างพัฒนา
-- เงื่อนไขไม่ให้ลบโซนที่มีสินค้าอ้างอิงอยู่
delete from public.warehouse_zones as zone
where (
    zone.id in (
      'e75556cd-f97a-4c56-b446-be63825323af', -- G รุ่นทดลอง
      '25138ced-8edf-4169-9c6d-5db5db3d6204', -- B-2 รุ่นทดลอง
      '9a276fc3-6486-4be1-aff6-444c29f1c4df', -- A-2 รุ่นทดลอง
      '7edd69ee-061f-48f5-b5a8-e0337a95cf0a'  -- B-3 รุ่นทดลอง
    )
    or upper(trim(zone.location_code)) in ('ZZ', 'TEST', 'TMP')
    or zone.name in ('โซนทดสอบ Undo')
  )
  and not exists (
    select 1
    from public.deposit_items as item
    where item.warehouse_zone_id = zone.id
  );

commit;
