import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWarehousePlacement, getRackBins, getZoneRacks } from '../app/main/warehouse-map/warehousePlacement.ts';
import type { WarehouseBin, WarehouseRack, WarehouseZone } from '../app/main/warehouse-map/types.ts';

const zone: WarehouseZone = { id: 'z', name: 'โซน D', locationCode: 'D', floor: '4 ชั้น', posX: 0, posY: 0, width: 60, height: 100, color: '#000' };
const racks: WarehouseRack[] = [
  { id: 'r2', zoneId: 'z', name: 'Rack 2', code: 'D-R02', posX: 0, posY: 0, width: 80, height: 40, rotation: 0, rackNumber: 2 },
  { id: 'r1', zoneId: 'z', name: 'Rack 1', code: 'D-R01', posX: 0, posY: 0, width: 80, height: 40, rotation: 0, rackNumber: 1 },
];
const bins: WarehouseBin[] = [
  { id: 'b2', rackId: 'r1', code: 'D-R01-L2-P1', shelfLevel: 2, palletNumber: 1 },
  { id: 'b1', rackId: 'r1', code: 'D-R01-L1-P2', shelfLevel: 1, palletNumber: 2 },
  { id: 'b3', rackId: 'r1', code: 'D-R01-L1-P1', shelfLevel: 1, palletNumber: 1 },
];

test('sorts racks and exposes one storage position per shelf', () => {
  assert.deepEqual(getZoneRacks(racks, 'z').map((rack) => rack.rackNumber), [1, 2]);
  assert.deepEqual(getRackBins(bins, 'r1').map((bin) => bin.id), ['b3', 'b2']);
});

test('formats the exact warehouse position at shelf level', () => {
  assert.equal(formatWarehousePlacement(zone, racks[1], bins[1]), 'ช่อง D / ชั้น 1 / Rack 1');
  assert.equal(formatWarehousePlacement(zone, undefined, undefined), 'D / 4 ชั้น');
});
