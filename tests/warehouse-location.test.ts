import assert from 'node:assert/strict';
import test from 'node:test';
import { displayItemDetail, displayStorageLocation } from '../lib/warehouseLocation.ts';

test('hides legacy sub-slot labels from stored warehouse locations', () => {
  assert.equal(
    displayStorageLocation('ช่อง B / ชั้น 2 / Rack 5 / ช่องย่อย 2'),
    'ช่อง B / ชั้น 2 / Rack 5',
  );
  assert.equal(
    displayStorageLocation('ช่อง B / ชั้น 2 / Rack 5 / พาเลต 1'),
    'ช่อง B / ชั้น 2 / Rack 5',
  );
});

test('hides legacy sub-slot text from demo item details', () => {
  assert.equal(
    displayItemDetail('ข้อมูลจำลองชุดใหญ่ · ชั้นวาง B · ชั้น 2 · พาเลต 2'),
    'ข้อมูลจำลองชุดใหญ่ · ชั้นวาง B · ชั้น 2',
  );
});
