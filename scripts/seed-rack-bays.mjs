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

function pad2(value) {
  return String(value).padStart(2, '0');
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

const { data: zones, error: zoneError } = await supabase
  .from('warehouse_zones')
  .select('id, location_code, floor, width, height')
  .in('location_code', ['A', 'B', 'C', 'D', 'E', 'F', 'S', 'R', 'L', 'N']);
assertResult(zoneError, 'โหลดโซนผังอ้างอิง');
const zoneByKey = new Map((zones ?? []).map((zone) => [`${zone.location_code}|${zone.floor}`, zone]));

const zoneSpecs = [
  ...['A', 'B', 'C', 'D', 'E', 'F'].map((code) => ({ code, floor: '4 ชั้น', rackPrefix: code, bayCount: 6 })),
  { code: 'S', floor: 'แนวผนัง', rackPrefix: 'S', bayCount: 9 },
  { code: 'R', floor: 'แนวผนัง', rackPrefix: 'R', bayCount: 9 },
  { code: 'L', floor: 'แนวผนัง', rackPrefix: 'L', bayCount: 9 },
  { code: 'N', floor: 'ฝั่งซ้าย', rackPrefix: 'N-L', bayCount: 5 },
  { code: 'N', floor: 'ฝั่งขวา', rackPrefix: 'N-R', bayCount: 3 },
];

const rackSeed = zoneSpecs.flatMap((spec) => {
  const zone = zoneByKey.get(`${spec.code}|${spec.floor}`);
  if (!zone) throw new Error(`ไม่พบโซน ${spec.code} ${spec.floor}`);
  const vertical = Number(zone.height) > Number(zone.width) * 2;
  return Array.from({ length: spec.bayCount }, (_, index) => {
    const bay = index + 1;
    const code = `${spec.rackPrefix}-R${pad2(bay)}`;
    return {
      zone_id: zone.id,
      name: `Rack ${bay} · ${spec.code}`,
      code,
      pos_x: vertical ? 0 : Number(zone.width) * index / spec.bayCount,
      pos_y: vertical ? Number(zone.height) * index / spec.bayCount : 0,
      width: vertical ? Number(zone.width) : Number(zone.width) / spec.bayCount,
      height: vertical ? Number(zone.height) / spec.bayCount : Number(zone.height),
    };
  });
});

const racks = [];
for (const batch of chunks(rackSeed, 100)) {
  const { data, error } = await supabase
    .from('warehouse_racks')
    .upsert(batch, { onConflict: 'zone_id,code' })
    .select('id, zone_id, code');
  assertResult(error, 'สร้าง Rack ย่อย');
  racks.push(...(data ?? []));
}
const rackByCode = new Map(racks.map((rack) => [rack.code, rack]));

const binSeed = racks.flatMap((rack) =>
  [1, 2, 3, 4].flatMap((level) =>
    [1, 2].map((pallet) => ({
      rack_id: rack.id,
      code: `${rack.code}-L${level}-P${pallet}`,
      shelf_level: level,
      row_no: level,
      col_no: pallet,
    })),
  ),
);

const bins = [];
for (const batch of chunks(binSeed, 150)) {
  const { data, error } = await supabase
    .from('warehouse_bins')
    .upsert(batch, { onConflict: 'rack_id,code' })
    .select('id, rack_id, code');
  assertResult(error, 'สร้างช่องชั้นวาง');
  bins.push(...(data ?? []));
}
const binByCode = new Map(bins.map((bin) => [bin.code, bin]));
const centralZoneByCode = new Map(
  ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => [code, zoneByKey.get(`${code}|4 ชั้น`)]),
);

const { data: mockItems, error: mockItemError } = await supabase
  .from('deposit_items')
  .select('id, item_code')
  .like('item_code', 'MOCK-%')
  .range(0, 1999);
assertResult(mockItemError, 'โหลดสินค้า MOCK');

const assignmentByItemId = new Map();
for (const item of mockItems ?? []) {
  const number = Number(item.item_code?.match(/^MOCK-(\d{4})$/)?.[1]);
  if (!number) continue;
  const index = number - 1;
  const zoneCode = ['A', 'B', 'C', 'D', 'E', 'F'][index % 6];
  const rackNumber = Math.floor(index / 6) % 6 + 1;
  const level = Math.floor(index / 36) % 4 + 1;
  const pallet = Math.floor(index / 144) % 2 + 1;
  assignmentByItemId.set(item.id, { zoneCode, rackNumber, level, pallet });
}

const namedPlacements = [
  { itemCode: 'DEMO-001', zoneCode: 'A', rackNumber: 1, level: 2, pallet: 1 },
  { itemCode: 'DEMO-002', zoneCode: 'B', rackNumber: 5, level: 2, pallet: 1 },
  { itemCode: 'DEMO-003', zoneCode: 'C', rackNumber: 3, level: 2, pallet: 1 },
  { itemCode: 'DEMO-004', zoneCode: 'D', rackNumber: 4, level: 4, pallet: 1 },
  { itemCode: 'DEMO-005', zoneCode: 'E', rackNumber: 2, level: 3, pallet: 2 },
  { itemCode: 'DEMO-006', zoneCode: 'F', rackNumber: 6, level: 1, pallet: 1 },
  { itemCode: 'P20-00774', zoneCode: 'E', rackNumber: 1, level: 1, pallet: 1 },
  { itemCode: 'P20-00815', zoneCode: 'E', rackNumber: 2, level: 2, pallet: 1 },
];
const { data: namedItems, error: namedItemError } = await supabase
  .from('deposit_items')
  .select('id, item_code')
  .in('item_code', namedPlacements.map((placement) => placement.itemCode));
assertResult(namedItemError, 'โหลดสินค้าชุดตัวอย่าง');
const placementByCode = new Map(namedPlacements.map((placement) => [placement.itemCode, placement]));
for (const item of namedItems ?? []) {
  const placement = placementByCode.get(item.item_code);
  if (placement) assignmentByItemId.set(item.id, placement);
}

const groups = new Map();
for (const [itemId, assignment] of assignmentByItemId) {
  const rackCode = `${assignment.zoneCode}-R${pad2(assignment.rackNumber)}`;
  const binCode = `${rackCode}-L${assignment.level}-P${assignment.pallet}`;
  const zone = centralZoneByCode.get(assignment.zoneCode);
  const rack = rackByCode.get(rackCode);
  const bin = binByCode.get(binCode);
  if (!zone || !rack || !bin) throw new Error(`พิกัด ${binCode} ไม่ครบ`);
  const storageLocation = `ช่อง ${assignment.zoneCode} / ชั้น ${assignment.level} / Rack ${assignment.rackNumber} / พาเลต ${assignment.pallet}`;
  const groupKey = `${zone.id}|${rack.id}|${bin.id}|${storageLocation}`;
  const group = groups.get(groupKey) ?? {
    itemIds: [],
    zoneId: zone.id,
    rackId: rack.id,
    binId: bin.id,
    storageLocation,
  };
  group.itemIds.push(itemId);
  groups.set(groupKey, group);
}

let updatedCount = 0;
for (const groupBatch of chunks([...groups.values()], 12)) {
  await Promise.all(groupBatch.map(async (group) => {
    const { error } = await supabase
      .from('deposit_items')
      .update({
        warehouse_zone_id: group.zoneId,
        warehouse_rack_id: group.rackId,
        warehouse_bin_id: group.binId,
      })
      .in('id', group.itemIds);
    assertResult(error, 'ผูกสินค้าเข้ากับ Rack');

    const { error: locationError } = await supabase
      .from('deposit_items')
      .update({ storage_location: group.storageLocation })
      .in('id', group.itemIds);
    assertResult(locationError, 'บันทึกข้อความพิกัด Rack');
    updatedCount += group.itemIds.length;
  }));
  console.log(`ผูกพิกัดแล้ว ${updatedCount}/${assignmentByItemId.size}`);
}

console.log(`สร้าง Rack ย่อย ${racks.length} Rack, ${bins.length} ช่องชั้นวาง และอัปเดตสินค้า ${updatedCount} รายการเรียบร้อย`);
