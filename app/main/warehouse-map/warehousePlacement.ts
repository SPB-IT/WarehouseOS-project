import type { WarehouseBin, WarehouseRack, WarehouseZone } from './types';

export interface WarehousePlacementValue {
  warehouseZoneId: string;
  warehouseRackId: string;
  warehouseBinId: string;
}

export function getZoneRacks(racks: WarehouseRack[], zoneId: string) {
  return racks
    .filter((rack) => rack.zoneId === zoneId)
    .sort((a, b) => a.rackNumber - b.rackNumber);
}

export function getRackBins(bins: WarehouseBin[], rackId: string) {
  return bins
    .filter((bin) => bin.rackId === rackId)
    .sort((a, b) => a.shelfLevel - b.shelfLevel || a.palletNumber - b.palletNumber);
}

export function formatWarehousePlacement(
  zone: WarehouseZone | undefined,
  rack: WarehouseRack | undefined,
  bin: WarehouseBin | undefined,
) {
  if (!zone) return '';
  if (!rack || !bin) return [zone.locationCode, zone.floor].filter(Boolean).join(' / ');
  return `ช่อง ${zone.locationCode} / ชั้น ${bin.shelfLevel} / Rack ${rack.rackNumber} / พาเลต ${bin.palletNumber}`;
}
