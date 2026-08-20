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
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''),
        ];
      }),
  );
}

function assertResult(error, action) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

const env = readLocalEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('ไม่พบค่าเชื่อมต่อ Supabase ใน .env.local');
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const referenceZones = [
  { name: 'ของใช้ในบ้าน / ของเล่น', location_code: 'S', floor: 'แนวผนัง', pos_x: 120, pos_y: 35, width: 940, height: 60, color: '#6d4bb4' },
  { name: 'ของเทศกาล', location_code: 'R', floor: 'แนวผนัง', pos_x: 35, pos_y: 120, width: 80, height: 400, color: '#c84f8c' },
  { name: 'ของเล่น', location_code: 'L', floor: 'แนวผนัง', pos_x: 1085, pos_y: 120, width: 80, height: 400, color: '#3f83cc' },
  { name: 'ทั่วไป / เครื่องครัว', location_code: 'F', floor: '4 ชั้น', pos_x: 270, pos_y: 165, width: 70, height: 335, color: '#c8972a' },
  { name: 'เบ็ดเตล็ด', location_code: 'E', floor: '4 ชั้น', pos_x: 350, pos_y: 165, width: 70, height: 335, color: '#168b8b' },
  { name: 'เบ็ดเตล็ด', location_code: 'D', floor: '4 ชั้น', pos_x: 505, pos_y: 165, width: 70, height: 335, color: '#168b8b' },
  { name: 'อุปกรณ์กีฬา / เบ็ดเตล็ด', location_code: 'C', floor: '4 ชั้น', pos_x: 585, pos_y: 165, width: 70, height: 335, color: '#0e7c3a' },
  { name: 'ของเล่น', location_code: 'B', floor: '4 ชั้น', pos_x: 740, pos_y: 165, width: 70, height: 335, color: '#1e6bbf' },
  { name: 'ของเล่น', location_code: 'A', floor: '4 ชั้น', pos_x: 820, pos_y: 165, width: 70, height: 335, color: '#164d86' },
  { name: 'น้ำยา / ของใช้ในบ้าน', location_code: 'N', floor: 'ฝั่งซ้าย', pos_x: 120, pos_y: 535, width: 450, height: 65, color: '#586b84' },
  { name: 'กิ๊ฟช็อป', location_code: 'N', floor: 'ฝั่งขวา', pos_x: 790, pos_y: 535, width: 275, height: 65, color: '#c84f8c' },
];

const { data: zones, error: zoneError } = await supabase
  .from('warehouse_zones')
  .upsert(referenceZones, { onConflict: 'location_code,floor' })
  .select('id, location_code, floor');
assertResult(zoneError, 'สร้างผังอ้างอิง');

const zoneByCode = new Map((zones ?? []).map((zone) => [zone.location_code, zone]));
const rackCodes = ['A', 'B', 'C', 'D', 'E', 'F'];
const rackSeed = rackCodes.map((code) => {
  const zone = zoneByCode.get(code);
  if (!zone) throw new Error(`ไม่พบโซน ${code}`);
  return {
    zone_id: zone.id,
    name: `ชั้นวาง ${code} · 4 ชั้น · 2 พาเลตต่อชั้น`,
    code,
    pos_x: 0,
    pos_y: 0,
    width: 70,
    height: 335,
  };
});

const { data: racks, error: rackError } = await supabase
  .from('warehouse_racks')
  .upsert(rackSeed, { onConflict: 'zone_id,code' })
  .select('id, zone_id, code');
assertResult(rackError, 'สร้างชั้นวาง A-F');

const rackByCode = new Map((racks ?? []).map((rack) => [rack.code, rack]));
const binSeed = rackCodes.flatMap((code) => {
  const rack = rackByCode.get(code);
  if (!rack) throw new Error(`ไม่พบชั้นวาง ${code}`);
  return [1, 2, 3, 4].flatMap((level) =>
    [1, 2].map((pallet) => ({
      rack_id: rack.id,
      code: `${code}-L${level}-P${pallet}`,
      shelf_level: level,
      row_no: level,
      col_no: pallet,
    })),
  );
});

const { data: bins, error: binError } = await supabase
  .from('warehouse_bins')
  .upsert(binSeed, { onConflict: 'rack_id,code' })
  .select('id, rack_id, code, shelf_level, col_no');
assertResult(binError, 'สร้างช่องชั้นวาง 48 ช่อง');
const binByCode = new Map((bins ?? []).map((bin) => [bin.code, bin]));

const { data: existingDeposit, error: findDepositError } = await supabase
  .from('deposits')
  .select('id')
  .eq('tracking_id', 'DEMO-WH-001')
  .maybeSingle();
assertResult(findDepositError, 'ค้นหาชุดข้อมูลจำลอง');

let depositId = existingDeposit?.id;
if (!depositId) {
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
  assertResult(error, 'สร้างชุดข้อมูลจำลอง');
  depositId = data.id;
}

const demoProducts = [
  { item_code: 'DEMO-001', item_name: 'ตุ๊กตาหมีขนาดกลาง', quantity: 40, unit: 'ตัว', detail: 'ของเล่น · ชั้นวาง A', rack: 'A', level: 2, pallet: 1 },
  { item_code: 'DEMO-002', item_name: 'รถบังคับวิทยุ', quantity: 24, unit: 'กล่อง', detail: 'ของเล่น · ชั้นวาง B', rack: 'B', level: 3, pallet: 2 },
  { item_code: 'DEMO-003', item_name: 'ลูกฟุตบอล เบอร์ 5', quantity: 36, unit: 'ลูก', detail: 'อุปกรณ์กีฬา · ชั้นวาง C', rack: 'C', level: 2, pallet: 1 },
  { item_code: 'DEMO-004', item_name: 'กล่องจัดระเบียบอเนกประสงค์', quantity: 60, unit: 'ใบ', detail: 'สินค้าเบ็ดเตล็ด · ชั้นวาง D', rack: 'D', level: 4, pallet: 1 },
  { item_code: 'DEMO-005', item_name: 'ชุดจานเมลามีน 12 ชิ้น', quantity: 30, unit: 'ชุด', detail: 'ของใช้ในบ้าน · ชั้นวาง E', rack: 'E', level: 3, pallet: 2 },
  { item_code: 'DEMO-006', item_name: 'หม้อสแตนเลส 24 ซม.', quantity: 20, unit: 'ใบ', detail: 'เครื่องครัว · ชั้นวาง F', rack: 'F', level: 1, pallet: 1 },
];

const { data: existingDemoItems, error: demoItemError } = await supabase
  .from('deposit_items')
  .select('id, item_code')
  .eq('deposit_id', depositId)
  .like('item_code', 'DEMO-%');
assertResult(demoItemError, 'ค้นหาสินค้าจำลอง');
const demoItemByCode = new Map((existingDemoItems ?? []).map((item) => [item.item_code, item]));

async function saveProduct(product, existingId) {
  const zone = zoneByCode.get(product.rack);
  const rack = rackByCode.get(product.rack);
  const binCode = `${product.rack}-L${product.level}-P${product.pallet}`;
  const bin = binByCode.get(binCode);
  if (!zone || !rack || !bin) throw new Error(`พิกัด ${binCode} ไม่ครบ`);

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
  const result = existingId
    ? await supabase.from('deposit_items').update(payload).eq('id', existingId).select('id').single()
    : await supabase.from('deposit_items').insert(payload).select('id').single();
  assertResult(result.error, `บันทึก ${product.item_code}`);

  const { error: locationError } = await supabase
    .from('deposit_items')
    .update({ storage_location: `${product.rack} / ชั้น ${product.level} / ช่อง ${binCode}` })
    .eq('id', result.data.id);
  assertResult(locationError, `บันทึกข้อความพิกัด ${product.item_code}`);
}

for (const product of demoProducts) {
  await saveProduct(product, demoItemByCode.get(product.item_code)?.id);
}

const realItemPlacement = [
  { itemCode: 'P20-00774', rack: 'E', level: 1, pallet: 1 },
  { itemCode: 'P20-00815', rack: 'E', level: 2, pallet: 1 },
];

for (const placement of realItemPlacement) {
  const zone = zoneByCode.get(placement.rack);
  const rack = rackByCode.get(placement.rack);
  const binCode = `${placement.rack}-L${placement.level}-P${placement.pallet}`;
  const bin = binByCode.get(binCode);
  if (!zone || !rack || !bin) continue;

  const { error } = await supabase
    .from('deposit_items')
    .update({
      warehouse_zone_id: zone.id,
      warehouse_rack_id: rack.id,
      warehouse_bin_id: bin.id,
    })
    .eq('item_code', placement.itemCode);
  assertResult(error, `ย้าย ${placement.itemCode}`);

  const { error: locationError } = await supabase
    .from('deposit_items')
    .update({ storage_location: `${placement.rack} / ชั้น ${placement.level} / ช่อง ${binCode}` })
    .eq('item_code', placement.itemCode);
  assertResult(locationError, `บันทึกพิกัด ${placement.itemCode}`);
}

console.log('จัดผัง S/R/L/N และชั้นวาง A-F พร้อมสินค้า 8 รายการเรียบร้อย โดยเก็บโซนรุ่นก่อนไว้');
