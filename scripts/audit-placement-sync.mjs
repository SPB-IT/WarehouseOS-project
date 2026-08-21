import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

async function fetchAllActiveItems() {
  const items = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('deposit_items')
      .select('id, storage_location, warehouse_zone_id, warehouse_rack_id, warehouse_bin_id')
      .neq('status', 'คืนแล้ว')
      .gt('remaining_quantity', 0)
      .range(start, start + 999);
    if (error) throw error;
    items.push(...(data ?? []));
    if ((data ?? []).length < 1000) return items;
  }
}

const [items, zonesResult, racksResult, binsResult] = await Promise.all([
  fetchAllActiveItems(),
  supabase.from('warehouse_zones').select('id, location_code'),
  supabase.from('warehouse_racks').select('id, zone_id, code'),
  supabase.from('warehouse_bins').select('id, rack_id, shelf_level, col_no'),
]);

for (const result of [zonesResult, racksResult, binsResult]) {
  if (result.error) throw result.error;
}

const zones = new Map((zonesResult.data ?? []).map((zone) => [zone.id, zone]));
const racks = new Map((racksResult.data ?? []).map((rack) => [rack.id, rack]));
const bins = new Map((binsResult.data ?? []).map((bin) => [bin.id, bin]));
let missingIds = 0;
let relationshipMismatch = 0;
let locationMismatch = 0;

for (const item of items) {
  const zone = zones.get(item.warehouse_zone_id);
  const rack = racks.get(item.warehouse_rack_id);
  const bin = bins.get(item.warehouse_bin_id);
  if (!zone || !rack || !bin) {
    missingIds += 1;
    continue;
  }
  if (rack.zone_id !== zone.id || bin.rack_id !== rack.id) relationshipMismatch += 1;
  const rackNumber = Number(rack.code.match(/-R0*(\d+)$/i)?.[1] ?? 0);
  const exactLocation = `ช่อง ${zone.location_code} / ชั้น ${bin.shelf_level ?? 1} / Rack ${rackNumber}`;
  const normalizedLocation = item.storage_location?.replace(/\s*\/\s*(?:ช่องย่อย|พาเลต)\s*\d+\s*$/i, '').trim();
  if (normalizedLocation !== exactLocation) locationMismatch += 1;
}

console.log(JSON.stringify({
  activeItems: items.length,
  missingIds,
  relationshipMismatch,
  locationMismatch,
}));
