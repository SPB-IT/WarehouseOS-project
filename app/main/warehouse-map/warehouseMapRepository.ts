import { supabase } from '../../../lib/supabase';
import type { WarehouseBin, WarehouseRack, WarehouseZone } from './types';

interface WarehouseZoneRow {
  id: string;
  name: string;
  location_code: string;
  floor: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  color: string;
  rack_levels?: number | null;
  pallets_per_level?: number | null;
  is_archived?: boolean | null;
}

interface WarehouseRackRow {
  id: string;
  zone_id: string;
  name: string;
  code: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
}

interface WarehouseBinRow {
  id: string;
  rack_id: string;
  code: string;
  shelf_level: number | null;
  col_no: number | null;
}

function extractRackNumberFromCode(code: string) {
  return Number(code.match(/-R0*(\d+)$/i)?.[1] ?? 0);
}

function fromRackRow(row: WarehouseRackRow): WarehouseRack {
  return {
    id: row.id,
    zoneId: row.zone_id,
    name: row.name,
    code: row.code,
    posX: row.pos_x,
    posY: row.pos_y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    rackNumber: extractRackNumberFromCode(row.code),
  };
}

function fromBinRow(row: WarehouseBinRow): WarehouseBin {
  return {
    id: row.id,
    rackId: row.rack_id,
    code: row.code,
    shelfLevel: row.shelf_level ?? 1,
    palletNumber: row.col_no ?? 1,
  };
}

function getRackPrefix(zone: WarehouseZone, existingRacks: WarehouseRack[]) {
  const existingPrefix = existingRacks[0]?.code.replace(/-R0*\d+$/i, '');
  if (existingPrefix) return existingPrefix;
  if (zone.locationCode === 'N') {
    return zone.floor.includes('ซ้าย') ? 'N-L' : 'N-R';
  }
  return zone.locationCode.replace(/\s+/g, '-').toUpperCase();
}

export type WarehouseZoneDraft = Omit<WarehouseZone, 'id'>;

const ZONE_COLUMNS = 'id, name, location_code, floor, pos_x, pos_y, width, height, color, rack_levels, pallets_per_level, is_archived';
const LEGACY_ZONE_COLUMNS = 'id, name, location_code, floor, pos_x, pos_y, width, height, color';

function isMissingZoneConfig(error: { message?: string } | null) {
  return Boolean(error?.message && /rack_levels|pallets_per_level|is_archived/i.test(error.message));
}

function fromRow(row: WarehouseZoneRow): WarehouseZone {
  return {
    id: row.id,
    name: row.name,
    locationCode: row.location_code,
    floor: row.floor,
    posX: row.pos_x,
    posY: row.pos_y,
    width: row.width,
    height: row.height,
    color: row.color,
    rackLevels: row.rack_levels ?? 4,
    palletsPerLevel: 1,
    isArchived: row.is_archived ?? false,
  };
}

function toRow(zone: WarehouseZone | WarehouseZoneDraft) {
  return {
    ...('id' in zone ? { id: zone.id } : {}),
    name: zone.name,
    location_code: zone.locationCode,
    floor: zone.floor,
    pos_x: zone.posX,
    pos_y: zone.posY,
    width: zone.width,
    height: zone.height,
    color: zone.color,
    rack_levels: zone.rackLevels ?? 4,
    pallets_per_level: 1,
    is_archived: zone.isArchived ?? false,
  };
}

function toLegacyRow(zone: WarehouseZone | WarehouseZoneDraft) {
  const row: Partial<ReturnType<typeof toRow>> = { ...toRow(zone) };
  delete row.rack_levels;
  delete row.pallets_per_level;
  delete row.is_archived;
  return row;
}

export async function fetchWarehouseZones() {
  const response = await supabase
    .from('warehouse_zones')
    .select(ZONE_COLUMNS)
    .order('floor', { ascending: true })
    .order('location_code', { ascending: true });

  let rows: WarehouseZoneRow[];
  if (isMissingZoneConfig(response.error)) {
    const legacyResponse = await supabase
      .from('warehouse_zones')
      .select(LEGACY_ZONE_COLUMNS)
      .order('floor', { ascending: true })
      .order('location_code', { ascending: true });
    if (legacyResponse.error) throw legacyResponse.error;
    rows = (legacyResponse.data ?? []) as unknown as WarehouseZoneRow[];
  } else {
    if (response.error) throw response.error;
    rows = (response.data ?? []) as unknown as WarehouseZoneRow[];
  }

  const zones = rows.map(fromRow).filter((zone) => !zone.isArchived);
  const referenceCodes = new Set(['S', 'R', 'L', 'N', 'A', 'B', 'C', 'D', 'E', 'F']);
  const hasReferenceLayout = ['S', 'R', 'L', 'A', 'B', 'C', 'D', 'E', 'F']
    .every((code) => zones.some((zone) => zone.locationCode === code));

  // เก็บโซนรุ่นก่อนไว้ในฐานข้อมูล แต่แสดงผังอ้างอิงชุดล่าสุดเมื่อสร้างครบแล้ว
  return hasReferenceLayout
    ? zones.filter((zone) => referenceCodes.has(zone.locationCode))
    : zones;
}

export async function createWarehouseZone(zone: WarehouseZoneDraft) {
  const response = await supabase
    .from('warehouse_zones')
    .insert(toRow(zone))
    .select(ZONE_COLUMNS)
    .single();

  if (isMissingZoneConfig(response.error)) {
    const legacyResponse = await supabase
      .from('warehouse_zones')
      .insert(toLegacyRow(zone))
      .select(LEGACY_ZONE_COLUMNS)
      .single();
    if (legacyResponse.error) throw legacyResponse.error;
    return fromRow(legacyResponse.data as unknown as WarehouseZoneRow);
  }

  if (response.error) throw response.error;
  return fromRow(response.data as unknown as WarehouseZoneRow);
}

export async function updateWarehouseZone(
  id: string,
  patch: Partial<WarehouseZoneDraft>,
) {
  const rowPatch: Record<string, string | number | boolean> = {};
  if (patch.name !== undefined) rowPatch.name = patch.name;
  if (patch.locationCode !== undefined) rowPatch.location_code = patch.locationCode;
  if (patch.floor !== undefined) rowPatch.floor = patch.floor;
  if (patch.posX !== undefined) rowPatch.pos_x = patch.posX;
  if (patch.posY !== undefined) rowPatch.pos_y = patch.posY;
  if (patch.width !== undefined) rowPatch.width = patch.width;
  if (patch.height !== undefined) rowPatch.height = patch.height;
  if (patch.color !== undefined) rowPatch.color = patch.color;
  if (patch.rackLevels !== undefined) rowPatch.rack_levels = patch.rackLevels;
  if (patch.palletsPerLevel !== undefined) rowPatch.pallets_per_level = patch.palletsPerLevel;
  if (patch.isArchived !== undefined) rowPatch.is_archived = patch.isArchived;

  let response = await supabase.from('warehouse_zones').update(rowPatch).eq('id', id);
  if (isMissingZoneConfig(response.error)) {
    const legacyPatch = { ...rowPatch };
    delete legacyPatch.rack_levels;
    delete legacyPatch.pallets_per_level;
    delete legacyPatch.is_archived;
    response = await supabase.from('warehouse_zones').update(legacyPatch).eq('id', id);
  }
  if (response.error) throw response.error;
}

export async function deleteWarehouseZone(id: string) {
  const { count, error: countError } = await supabase
    .from('deposit_items')
    .select('id', { count: 'exact', head: true })
    .eq('warehouse_zone_id', id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) throw new Error(`ZONE_NOT_EMPTY:${count}`);

  const { error } = await supabase.from('warehouse_zones').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertWarehouseZones(zones: WarehouseZone[]) {
  let response = await supabase
    .from('warehouse_zones')
    .upsert(zones.map(toRow), { onConflict: 'id' });
  if (isMissingZoneConfig(response.error)) {
    response = await supabase
      .from('warehouse_zones')
      .upsert(zones.map(toLegacyRow), { onConflict: 'id' });
  }
  if (response.error) throw response.error;
}

export function subscribeToWarehouseZones(onChange: () => void) {
  const channel = supabase
    .channel(`warehouse-zones-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'warehouse_zones' },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function fetchWarehouseRacks(zoneId?: string) {
  let query = supabase
    .from('warehouse_racks')
    .select('id, zone_id, name, code, pos_x, pos_y, width, height, rotation');
  if (zoneId) query = query.eq('zone_id', zoneId);

  const { data, error } = await query.order('code', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as WarehouseRackRow[])
    .map(fromRackRow)
    .filter((rack) => rack.rackNumber > 0)
    .sort((a, b) => a.rackNumber - b.rackNumber);
}

export async function fetchWarehouseRackCounts() {
  const racks = await fetchWarehouseRacks();
  return racks.reduce<Record<string, number>>((counts, rack) => {
    counts[rack.zoneId] = Math.max(counts[rack.zoneId] ?? 0, rack.rackNumber);
    return counts;
  }, {});
}

export async function fetchWarehouseBins(rackId?: string) {
  let query = supabase
    .from('warehouse_bins')
    .select('id, rack_id, code, shelf_level, col_no');
  if (rackId) query = query.eq('rack_id', rackId);

  const { data, error } = await query
    .order('shelf_level', { ascending: true })
    .order('col_no', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as WarehouseBinRow[]).map(fromBinRow);
}

export async function addWarehouseRack(zone: WarehouseZone) {
  const existingRacks = await fetchWarehouseRacks(zone.id);
  const rackNumber = Math.max(0, ...existingRacks.map((rack) => rack.rackNumber)) + 1;
  const prefix = getRackPrefix(zone, existingRacks);
  const code = `${prefix}-R${String(rackNumber).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('warehouse_racks')
    .insert({
      zone_id: zone.id,
      name: `Rack ${rackNumber} · ${zone.locationCode}`,
      code,
      pos_x: Math.max((rackNumber - 1) * 80, 0),
      pos_y: 0,
      width: 80,
      height: 40,
      rotation: 0,
    })
    .select('id, zone_id, name, code, pos_x, pos_y, width, height, rotation')
    .single();
  if (error) throw error;

  const rack = fromRackRow(data as WarehouseRackRow);
  const rackLevels = Math.min(Math.max(Math.round(zone.rackLevels ?? 4), 1), 20);
  const bins = Array.from({ length: rackLevels }, (_, levelIndex) => levelIndex + 1)
    .map((level) => ({
      rack_id: rack.id,
      code: `${rack.code}-L${level}-P1`,
      shelf_level: level,
      row_no: 1,
      col_no: 1,
    }));
  const { error: binError } = await supabase.from('warehouse_bins').insert(bins);
  if (binError) {
    await supabase.from('warehouse_racks').delete().eq('id', rack.id);
    throw binError;
  }
  return rack;
}

export async function removeLastWarehouseRack(zoneId: string) {
  const racks = await fetchWarehouseRacks(zoneId);
  if (racks.length <= 1) throw new Error('MINIMUM_RACK');
  const rack = racks[racks.length - 1];
  const [byRackId, byLocation] = await Promise.all([
    supabase
      .from('deposit_items')
      .select('id', { count: 'exact', head: true })
      .eq('warehouse_rack_id', rack.id),
    supabase
      .from('deposit_items')
      .select('id', { count: 'exact', head: true })
      .eq('warehouse_zone_id', zoneId)
      .ilike('storage_location', `%Rack ${rack.rackNumber}%`),
  ]);
  if (byRackId.error) throw byRackId.error;
  if (byLocation.error) throw byLocation.error;
  const itemCount = Math.max(byRackId.count ?? 0, byLocation.count ?? 0);
  if (itemCount > 0) throw new Error(`RACK_NOT_EMPTY:${itemCount}`);

  const { error } = await supabase.from('warehouse_racks').delete().eq('id', rack.id);
  if (error) throw error;
  return rack;
}

export function subscribeToWarehouseRacks(onChange: () => void) {
  const channel = supabase
    .channel(`warehouse-racks-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'warehouse_racks' },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
