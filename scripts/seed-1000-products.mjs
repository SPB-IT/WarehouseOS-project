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

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
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

const rackCodes = ['A', 'B', 'C', 'D', 'E', 'F'];
const { data: zones, error: zoneError } = await supabase
  .from('warehouse_zones')
  .select('id, location_code, floor')
  .in('location_code', rackCodes)
  .eq('floor', '4 ชั้น');
assertResult(zoneError, 'โหลดโซน A-F');

const zoneByCode = new Map((zones ?? []).map((zone) => [zone.location_code, zone]));
if (zoneByCode.size !== rackCodes.length) {
  throw new Error('ผัง A-F ยังไม่ครบ กรุณารัน seed-reference-layout.mjs ก่อน');
}

const zoneIds = [...zoneByCode.values()].map((zone) => zone.id);
const { data: racks, error: rackError } = await supabase
  .from('warehouse_racks')
  .select('id, zone_id, code')
  .in('zone_id', zoneIds)
  .in('code', rackCodes);
assertResult(rackError, 'โหลดชั้นวาง A-F');
const rackByCode = new Map((racks ?? []).map((rack) => [rack.code, rack]));

const rackIds = [...rackByCode.values()].map((rack) => rack.id);
const { data: bins, error: binError } = await supabase
  .from('warehouse_bins')
  .select('id, rack_id, code, shelf_level, col_no')
  .in('rack_id', rackIds)
  .order('code');
assertResult(binError, 'โหลดช่องเก็บสินค้า');
const binByCode = new Map((bins ?? []).map((bin) => [bin.code, bin]));
if (binByCode.size < 48) {
  throw new Error(`พบช่องเก็บเพียง ${binByCode.size} ช่อง ต้องมีอย่างน้อย 48 ช่อง`);
}

const trackingIds = Array.from(
  { length: 20 },
  (_, index) => `DEMO-BULK-${String(index + 1).padStart(3, '0')}`,
);
const { data: existingDeposits, error: depositLookupError } = await supabase
  .from('deposits')
  .select('id, tracking_id')
  .in('tracking_id', trackingIds);
assertResult(depositLookupError, 'ค้นหารายการฝากจำนวนมาก');

const depositByTracking = new Map(
  (existingDeposits ?? []).map((deposit) => [deposit.tracking_id, deposit]),
);
const missingDeposits = trackingIds
  .filter((trackingId) => !depositByTracking.has(trackingId))
  .map((trackingId, index) => ({
    tracking_id: trackingId,
    customer_name: `ลูกค้าตัวอย่าง ${String(index + 1).padStart(2, '0')}`,
    customer_phone: `080-000-${String(index + 1).padStart(4, '0')}`,
    deposit_date: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
    staff_received_name: ['กิตติ', 'วราภรณ์', 'ณัฐพล', 'พิมพ์ชนก'][index % 4],
  }));

if (missingDeposits.length > 0) {
  const { data: insertedDeposits, error } = await supabase
    .from('deposits')
    .insert(missingDeposits)
    .select('id, tracking_id');
  assertResult(error, 'สร้างรายการฝากตัวอย่าง 20 ชุด');
  for (const deposit of insertedDeposits ?? []) {
    depositByTracking.set(deposit.tracking_id, deposit);
  }
}

const categoryNames = {
  A: ['ตุ๊กตาหมี', 'ตัวต่อเสริมทักษะ', 'ชุดครัวเด็ก', 'บ้านตุ๊กตา', 'หุ่นยนต์ของเล่น', 'เกมกระดาน', 'ชุดระบายสี', 'ของเล่นอาบน้ำ'],
  B: ['รถบังคับ', 'รถของเล่น', 'เครื่องบินจำลอง', 'ชุดรถไฟ', 'ลูกข่าง', 'ปืนฉีดน้ำ', 'ของเล่นสนาม', 'ของเล่นดนตรี'],
  C: ['ลูกฟุตบอล', 'ลูกบาสเกตบอล', 'ไม้แบดมินตัน', 'เชือกกระโดด', 'เสื่อโยคะ', 'ดัมเบล', 'หมวกว่ายน้ำ', 'ถุงมือกีฬา'],
  D: ['กล่องจัดระเบียบ', 'ไม้แขวนเสื้อ', 'ตะกร้าพลาสติก', 'ที่หนีบผ้า', 'ถุงสุญญากาศ', 'พรมเช็ดเท้า', 'ชั้นวางอเนกประสงค์', 'กล่องเครื่องมือ'],
  E: ['ชุดจานเมลามีน', 'ขวดน้ำ', 'แก้วน้ำ', 'ถังขยะ', 'กล่องอาหาร', 'ผ้าเช็ดตัว', 'หมอนอิง', 'นาฬิกาแขวน'],
  F: ['หม้อสแตนเลส', 'กระทะเคลือบ', 'ตะหลิว', 'มีดทำครัว', 'เขียง', 'ชามผสม', 'กล่องเครื่องปรุง', 'กาต้มน้ำ'],
};
const colors = ['แดง', 'น้ำเงิน', 'เขียว', 'เหลือง', 'ชมพู', 'ดำ', 'ขาว', 'เทา'];
const sizes = ['XS', 'S', 'M', 'L', 'XL'];
const styles = ['รุ่นมาตรฐาน', 'รุ่นคลาสสิก', 'รุ่นพรีเมียม', 'รุ่นประหยัด', 'รุ่นใหม่'];
const unitsByRack = { A: 'ชิ้น', B: 'กล่อง', C: 'ชิ้น', D: 'ใบ', E: 'ชุด', F: 'ใบ' };

const targetCodes = Array.from(
  { length: 1000 },
  (_, index) => `MOCK-${String(index + 1).padStart(4, '0')}`,
);
const { data: existingItems, error: itemLookupError } = await supabase
  .from('deposit_items')
  .select('id, item_code')
  .like('item_code', 'MOCK-%')
  .range(0, 1999);
assertResult(itemLookupError, 'ค้นหาสินค้า MOCK เดิม');
const existingCodes = new Set((existingItems ?? []).map((item) => item.item_code));

const products = targetCodes.map((itemCode, index) => {
  const rackCode = rackCodes[index % rackCodes.length];
  const cycle = Math.floor(index / rackCodes.length);
  const level = cycle % 4 + 1;
  const pallet = Math.floor(cycle / 4) % 2 + 1;
  const binCode = `${rackCode}-L${level}-P${pallet}`;
  const zone = zoneByCode.get(rackCode);
  const rack = rackByCode.get(rackCode);
  const bin = binByCode.get(binCode);
  const trackingId = trackingIds[Math.floor(index / 50)];
  const deposit = depositByTracking.get(trackingId);
  if (!zone || !rack || !bin || !deposit) throw new Error(`พิกัดของ ${itemCode} ไม่ครบ`);

  const names = categoryNames[rackCode];
  const baseName = names[cycle % names.length];
  const color = colors[Math.floor(cycle / names.length) % colors.length];
  const size = sizes[Math.floor(cycle / (names.length * colors.length)) % sizes.length];
  const style = styles[Math.floor(cycle / (names.length * colors.length * sizes.length)) % styles.length];
  return {
    deposit_id: deposit.id,
    item_name: `${baseName} ${style} สี${color} ขนาด ${size} #${String(index + 1).padStart(4, '0')}`,
    item_code: itemCode,
    quantity: index * 7 % 120 + 1,
    remaining_quantity: index * 7 % 120 + 1,
    unit: unitsByRack[rackCode],
    status: 'กำลังฝาก',
    detail: `ข้อมูลจำลองชุดใหญ่ · ชั้นวาง ${rackCode} · ชั้น ${level} · พาเลต ${pallet}`,
    warehouse_zone_id: zone.id,
    warehouse_rack_id: rack.id,
    warehouse_bin_id: bin.id,
  };
});

const missingProducts = products.filter((product) => !existingCodes.has(product.item_code));
let insertedCount = 0;
for (const batch of chunks(missingProducts, 100)) {
  const { error } = await supabase.from('deposit_items').insert(batch);
  assertResult(error, `เพิ่มสินค้าชุด ${insertedCount + 1}-${insertedCount + batch.length}`);
  insertedCount += batch.length;
  console.log(`เพิ่มสินค้าแล้ว ${insertedCount}/${missingProducts.length}`);
}

const locationUpdates = [...binByCode.entries()].map(([binCode, bin]) => {
  const match = binCode.match(/^([A-F])-L([1-4])-P([1-2])$/);
  if (!match) return null;
  const [, rackCode, level, pallet] = match;
  return {
    binId: bin.id,
    storageLocation: `${rackCode} / ชั้น ${level} / ช่อง ${binCode} / พาเลต ${pallet}`,
  };
}).filter(Boolean);

for (const updateBatch of chunks(locationUpdates, 8)) {
  const results = await Promise.all(
    updateBatch.map((update) =>
      supabase
        .from('deposit_items')
        .update({ storage_location: update.storageLocation })
        .like('item_code', 'MOCK-%')
        .eq('warehouse_bin_id', update.binId),
    ),
  );
  results.forEach((result) => assertResult(result.error, 'อัปเดตข้อความพิกัดสินค้า'));
}

const { count, error: countError } = await supabase
  .from('deposit_items')
  .select('*', { count: 'exact', head: true })
  .like('item_code', 'MOCK-%');
assertResult(countError, 'นับสินค้าจำลอง');

console.log(`สินค้า MOCK ในระบบทั้งหมด ${count ?? 0} รายการ (เพิ่มใหม่ ${insertedCount} รายการ)`);
