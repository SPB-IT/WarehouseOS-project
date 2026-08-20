import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function readLocalEnv() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

function assertResult(error, action) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

const env = readLocalEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const zoneSeed = [
  { name: 'พื้นที่รับเข้า', location_code: 'RECEIVE', floor: 'ชั้น 1', pos_x: 30, pos_y: 210, width: 170, height: 100, color: '#c8972a' },
  { name: 'ชั้นวาง A5', location_code: 'A5', floor: 'ชั้น 1', pos_x: 250, pos_y: 70, width: 250, height: 100, color: '#3f83cc' },
  { name: 'ชั้นวาง A5', location_code: 'A5', floor: 'ชั้น 2', pos_x: 250, pos_y: 200, width: 250, height: 100, color: '#1e6bbf' },
  { name: 'ชั้นวาง A5', location_code: 'A5', floor: 'ชั้น 3', pos_x: 250, pos_y: 330, width: 250, height: 100, color: '#164d86' },
  { name: 'ชั้นวาง B3', location_code: 'B3', floor: 'ชั้น 1', pos_x: 560, pos_y: 70, width: 250, height: 100, color: '#48a36a' },
  { name: 'ชั้นวาง B3', location_code: 'B3', floor: 'ชั้น 2', pos_x: 560, pos_y: 200, width: 250, height: 100, color: '#0e7c3a' },
  { name: 'ชั้นวาง B3', location_code: 'B3', floor: 'ชั้น 3', pos_x: 560, pos_y: 330, width: 250, height: 100, color: '#075828' },
  { name: 'พื้นที่จ่ายออก', location_code: 'DISPATCH', floor: 'ชั้น 1', pos_x: 870, pos_y: 210, width: 190, height: 100, color: '#c0392b' },
];

const { data: zones, error: zoneError } = await supabase
  .from('warehouse_zones')
  .upsert(zoneSeed, { onConflict: 'location_code,floor' })
  .select('id, name, location_code, floor');
assertResult(zoneError, 'สร้างผังตัวอย่าง');

const { error: legacyZoneError } = await supabase
  .from('warehouse_zones')
  .update({
    name: 'พื้นที่เดิม โกดัง 6',
    pos_x: 870,
    pos_y: 350,
    width: 220,
    height: 100,
    color: '#6d4bb4',
  })
  .eq('location_code', 'โกดัง 6');
assertResult(legacyZoneError, 'จัดตำแหน่งโกดัง 6');

const zoneByLocation = new Map(
  (zones ?? []).map((zone) => [`${zone.location_code}|${zone.floor}`, zone]),
);

const rackSeed = ['A5', 'B3'].flatMap((locationCode) =>
  [1, 2, 3].map((level) => {
    const floor = `ชั้น ${level}`;
    const zone = zoneByLocation.get(`${locationCode}|${floor}`);
    if (!zone) throw new Error(`ไม่พบโซน ${locationCode} ${floor}`);
    return {
      zone_id: zone.id,
      name: `ชั้นวาง ${locationCode} ${floor}`,
      code: locationCode,
      pos_x: 12,
      pos_y: 12,
      width: 220,
      height: 70,
    };
  }),
);

const { data: racks, error: rackError } = await supabase
  .from('warehouse_racks')
  .upsert(rackSeed, { onConflict: 'zone_id,code' })
  .select('id, zone_id, code');
assertResult(rackError, 'สร้างชั้นวางตัวอย่าง');

const rackByZone = new Map((racks ?? []).map((rack) => [rack.zone_id, rack]));
const binSeed = ['A5', 'B3'].flatMap((locationCode) =>
  [1, 2, 3].map((level) => {
    const zone = zoneByLocation.get(`${locationCode}|ชั้น ${level}`);
    const rack = zone ? rackByZone.get(zone.id) : null;
    if (!zone || !rack) throw new Error(`ไม่พบชั้นวาง ${locationCode} ชั้น ${level}`);
    return {
      rack_id: rack.id,
      code: `${locationCode}-L${level}`,
      shelf_level: level,
      row_no: 1,
      col_no: 1,
    };
  }),
);

const { data: bins, error: binError } = await supabase
  .from('warehouse_bins')
  .upsert(binSeed, { onConflict: 'rack_id,code' })
  .select('id, rack_id, code');
assertResult(binError, 'สร้างช่องเก็บตัวอย่าง');

const binByCode = new Map((bins ?? []).map((bin) => [bin.code, bin]));
const products = [
  { item_name: 'กล่องพัสดุ Size M', item_code: 'DEMO-001', quantity: 120, unit: 'กล่อง', detail: 'สินค้าตัวอย่างสำหรับ A5 ชั้น 1', locationCode: 'A5', level: 1 },
  { item_name: 'เทปกาวใส 48 มม.', item_code: 'DEMO-002', quantity: 48, unit: 'ม้วน', detail: 'สินค้าตัวอย่างสำหรับ A5 ชั้น 2', locationCode: 'A5', level: 2 },
  { item_name: 'ริบบอนดำ Wax 110 มม.', item_code: 'DEMO-003', quantity: 24, unit: 'ม้วน', detail: 'สินค้าตัวอย่างสำหรับ A5 ชั้น 3', locationCode: 'A5', level: 3 },
  { item_name: 'ถุงซิปล็อก 20x30 ซม.', item_code: 'DEMO-004', quantity: 75, unit: 'แพ็ก', detail: 'สินค้าตัวอย่างสำหรับ B3 ชั้น 1', locationCode: 'B3', level: 1 },
  { item_name: 'สติกเกอร์ FRAGILE', item_code: 'DEMO-005', quantity: 36, unit: 'ม้วน', detail: 'สินค้าตัวอย่างสำหรับ B3 ชั้น 2', locationCode: 'B3', level: 2 },
  { item_name: 'เครื่องสแกนบาร์โค้ด', item_code: 'DEMO-006', quantity: 6, unit: 'เครื่อง', detail: 'สินค้าตัวอย่างสำหรับ B3 ชั้น 3', locationCode: 'B3', level: 3 },
];

const { data: existingDeposit, error: findDepositError } = await supabase
  .from('deposits')
  .select('id')
  .eq('tracking_id', 'DEMO-WH-001')
  .maybeSingle();
assertResult(findDepositError, 'ค้นหารายการฝากตัวอย่าง');

let depositId = existingDeposit?.id;
if (depositId) {
  const { error } = await supabase
    .from('deposits')
    .update({
      customer_name: 'ข้อมูลตัวอย่าง WarehouseOS',
      customer_phone: '000-000-0000',
      deposit_date: new Date().toISOString(),
      staff_received_name: 'พนักงานตัวอย่าง',
    })
    .eq('id', depositId);
  assertResult(error, 'อัปเดตรายการฝากตัวอย่าง');
} else {
  const { data, error } = await supabase
    .from('deposits')
    .insert({
      tracking_id: 'DEMO-WH-001',
      customer_name: 'ข้อมูลตัวอย่าง WarehouseOS',
      customer_phone: '000-000-0000',
      deposit_date: new Date().toISOString(),
      staff_received_name: 'พนักงานตัวอย่าง',
    })
    .select('id')
    .single();
  assertResult(error, 'สร้างรายการฝากตัวอย่าง');
  depositId = data.id;
}

const { data: existingItems, error: findItemError } = await supabase
  .from('deposit_items')
  .select('id, item_code')
  .eq('deposit_id', depositId)
  .like('item_code', 'DEMO-%');
assertResult(findItemError, 'ค้นหาสินค้าตัวอย่าง');
const existingItemByCode = new Map((existingItems ?? []).map((item) => [item.item_code, item]));

for (const product of products) {
  const zone = zoneByLocation.get(`${product.locationCode}|ชั้น ${product.level}`);
  const rack = zone ? rackByZone.get(zone.id) : null;
  const bin = binByCode.get(`${product.locationCode}-L${product.level}`);
  if (!zone || !rack || !bin) throw new Error(`พิกัดของ ${product.item_code} ไม่ครบ`);

  const payload = {
    deposit_id: depositId,
    item_name: product.item_name,
    item_code: product.item_code,
    quantity: product.quantity,
    remaining_quantity: product.quantity,
    unit: product.unit,
    status: 'กำลังฝาก',
    detail: product.detail,
    warehouse_zone_id: zone.id,
    warehouse_rack_id: rack.id,
    warehouse_bin_id: bin.id,
  };
  const existingItem = existingItemByCode.get(product.item_code);
  const result = existingItem
    ? await supabase.from('deposit_items').update(payload).eq('id', existingItem.id)
    : await supabase.from('deposit_items').insert(payload);
  assertResult(result.error, `บันทึก ${product.item_code}`);
}

console.log(`เพิ่มผัง ${zones?.length ?? 0} โซน และสินค้าเดโม ${products.length} รายการเรียบร้อย`);
