import type { WarehouseZone } from './types';

export const WAREHOUSE_MAP_STORAGE_KEY = 'warehouseos:warehouse-map:v3-reference';

export const WAREHOUSE_ZONE_COLORS = [
  '#1e6bbf',
  '#0e7c3a',
  '#c8972a',
  '#c0392b',
  '#6d4bb4',
  '#c84f8c',
  '#168b8b',
  '#586b84',
];

export const DEFAULT_WAREHOUSE_ZONES: WarehouseZone[] = [
  {
    id: 'reference-s',
    name: 'ของใช้ในบ้าน / ของเล่น',
    locationCode: 'S',
    floor: 'แนวผนัง',
    posX: 100,
    posY: 80,
    width: 740,
    height: 60,
    color: '#6d4bb4',
  },
  {
    id: 'reference-r',
    name: 'ของเทศกาล',
    locationCode: 'R',
    floor: 'แนวผนัง',
    posX: 60,
    posY: 160,
    width: 60,
    height: 400,
    color: '#c84f8c',
  },
  {
    id: 'reference-l',
    name: 'ของเล่น',
    locationCode: 'L',
    floor: 'แนวผนัง',
    posX: 840,
    posY: 160,
    width: 60,
    height: 400,
    color: '#3f83cc',
  },
  {
    id: 'reference-f',
    name: 'ทั่วไป / เครื่องครัว',
    locationCode: 'F',
    floor: '4 ชั้น',
    posX: 240,
    posY: 180,
    width: 60,
    height: 340,
    color: '#c8972a',
  },
  {
    id: 'reference-e',
    name: 'เบ็ดเตล็ด',
    locationCode: 'E',
    floor: '4 ชั้น',
    posX: 300,
    posY: 180,
    width: 60,
    height: 340,
    color: '#168b8b',
  },
  {
    id: 'reference-d',
    name: 'เบ็ดเตล็ด',
    locationCode: 'D',
    floor: '4 ชั้น',
    posX: 460,
    posY: 180,
    width: 60,
    height: 340,
    color: '#168b8b',
  },
  {
    id: 'reference-c',
    name: 'อุปกรณ์กีฬา / เบ็ดเตล็ด',
    locationCode: 'C',
    floor: '4 ชั้น',
    posX: 520,
    posY: 180,
    width: 60,
    height: 340,
    color: '#0e7c3a',
  },
  {
    id: 'reference-b',
    name: 'ของเล่น',
    locationCode: 'B',
    floor: '4 ชั้น',
    posX: 680,
    posY: 180,
    width: 60,
    height: 340,
    color: '#1e6bbf',
  },
  {
    id: 'reference-a',
    name: 'ของเล่น',
    locationCode: 'A',
    floor: '4 ชั้น',
    posX: 740,
    posY: 180,
    width: 60,
    height: 340,
    color: '#164d86',
  },
  {
    id: 'reference-n-left',
    name: 'น้ำยา / ของใช้ในบ้าน',
    locationCode: 'N',
    floor: 'ฝั่งซ้าย',
    posX: 100,
    posY: 580,
    width: 420,
    height: 60,
    color: '#586b84',
  },
  {
    id: 'reference-n-right',
    name: 'กิ๊ฟช็อป',
    locationCode: 'N',
    floor: 'ฝั่งขวา',
    posX: 720,
    posY: 580,
    width: 180,
    height: 60,
    color: '#c84f8c',
  },
];

const LEGACY_LOCATION_BY_ID: Record<string, Pick<WarehouseZone, 'locationCode' | 'floor'>> = {
  'sample-a': { locationCode: 'A5', floor: 'ชั้น 2' },
  'sample-b': { locationCode: 'B3', floor: 'ชั้น 2' },
  'sample-receiving': { locationCode: 'RECEIVE', floor: 'ชั้น 1' },
  'sample-dispatch': { locationCode: 'DISPATCH', floor: 'ชั้น 1' },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inferLocationCode(name: string) {
  const code = name.match(/[A-Za-z]+\s*-?\s*\d+/)?.[0];
  return code ? code.replace(/\s+/g, '').toUpperCase() : name.trim();
}

function normalizeZone(value: unknown): WarehouseZone | null {
  if (!value || typeof value !== 'object') return null;
  const zone = value as Record<string, unknown>;

  if (
    typeof zone.id !== 'string' ||
    typeof zone.name !== 'string' ||
    !isFiniteNumber(zone.posX) ||
    !isFiniteNumber(zone.posY) ||
    !isFiniteNumber(zone.width) ||
    !isFiniteNumber(zone.height) ||
    typeof zone.color !== 'string'
  ) {
    return null;
  }

  const legacyLocation = LEGACY_LOCATION_BY_ID[zone.id];
  const locationCode =
    typeof zone.locationCode === 'string' && zone.locationCode.trim()
      ? zone.locationCode.trim()
      : legacyLocation?.locationCode ?? inferLocationCode(zone.name);
  const floor =
    typeof zone.floor === 'string' && zone.floor.trim()
      ? zone.floor.trim()
      : legacyLocation?.floor ?? 'ชั้น 1';

  return {
    id: zone.id,
    name: zone.name,
    locationCode,
    floor,
    posX: zone.posX,
    posY: zone.posY,
    width: Math.max(zone.width, 40),
    height: Math.max(zone.height, 40),
    color: zone.color,
    rackLevels: isFiniteNumber(zone.rackLevels) ? Math.max(1, Math.round(zone.rackLevels)) : 4,
    palletsPerLevel: 1,
  };
}

export function cloneDefaultWarehouseZones() {
  return DEFAULT_WAREHOUSE_ZONES.map((zone) => ({
    ...zone,
    rackLevels: zone.rackLevels ?? 4,
    palletsPerLevel: 1,
  }));
}

function getReferenceLayoutKey(zone: WarehouseZone) {
  if (zone.locationCode === 'N') {
    return zone.floor.includes('ซ้าย') ? 'N-LEFT' : 'N-RIGHT';
  }
  return zone.locationCode.toUpperCase();
}

const REFERENCE_LAYOUT = new Map(
  DEFAULT_WAREHOUSE_ZONES.map((zone) => [
    getReferenceLayoutKey(zone),
    {
      posX: zone.posX,
      posY: zone.posY,
      width: zone.width,
      height: zone.height,
    },
  ]),
);

export function applyReferenceWarehouseLayout(zones: WarehouseZone[]) {
  return zones.map((zone) => {
    const layout = REFERENCE_LAYOUT.get(getReferenceLayoutKey(zone));
    return layout ? { ...zone, ...layout } : zone;
  });
}

export function parseWarehouseZones(value: unknown): WarehouseZone[] | null {
  const rawZones = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (value as { zones?: unknown }).zones
      : null;

  if (!Array.isArray(rawZones)) return null;
  const normalized = rawZones.map(normalizeZone);
  if (normalized.some((zone) => zone === null)) return null;
  return normalized as WarehouseZone[];
}

export function loadWarehouseZones() {
  try {
    const saved = window.localStorage.getItem(WAREHOUSE_MAP_STORAGE_KEY);
    if (!saved) return cloneDefaultWarehouseZones();
    return parseWarehouseZones(JSON.parse(saved)) ?? cloneDefaultWarehouseZones();
  } catch {
    return cloneDefaultWarehouseZones();
  }
}

export function saveWarehouseZones(zones: WarehouseZone[]) {
  window.localStorage.setItem(WAREHOUSE_MAP_STORAGE_KEY, JSON.stringify(zones));
}

function normalizeLocationText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('th-TH')
    .replace(/[\s\/\\,._()-]+/g, '');
}

export function extractFloorLabel(location: string | null | undefined) {
  if (!location) return '';
  const match = location.match(/ชั้น\s*([^\s/\\,|]+)/i);
  return match ? `ชั้น ${match[1].trim()}` : '';
}

export function extractLocationCode(location: string | null | undefined) {
  if (!location) return '';
  const code = location.match(/[A-Za-z]+\s*-?\s*\d+/)?.[0];
  return code ? code.replace(/\s+/g, '').toUpperCase() : '';
}

export function extractRackNumber(location: string | null | undefined) {
  if (!location) return null;
  const match = location.match(/Rack\s*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function zoneMatchesStorageLocation(
  zone: WarehouseZone,
  storageLocation: string | null | undefined,
) {
  if (!storageLocation?.trim()) return false;

  const normalizedLocation = normalizeLocationText(storageLocation);
  const normalizedCode = normalizeLocationText(zone.locationCode);
  const normalizedName = normalizeLocationText(zone.name);
  const codeMatches = normalizedCode.length >= 2 && normalizedLocation.includes(normalizedCode);
  const nameMatches = normalizedName.length >= 3 && normalizedLocation.includes(normalizedName);
  if (!codeMatches && !nameMatches) return false;

  const locationFloor = extractFloorLabel(storageLocation);
  if (!locationFloor || !zone.floor) return true;
  return normalizeLocationText(locationFloor) === normalizeLocationText(zone.floor);
}

export function formatZoneLocation(zone: WarehouseZone) {
  return [zone.locationCode, zone.floor].filter(Boolean).join(' · ');
}
