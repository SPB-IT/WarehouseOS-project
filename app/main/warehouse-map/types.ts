export interface WarehouseZone {
  id: string;
  name: string;
  locationCode: string;
  floor: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  color: string;
  rackLevels?: number;
  palletsPerLevel?: number;
}

export interface ZonePositionUpdate {
  id: string;
  posX: number;
  posY: number;
}

export interface WarehouseRack {
  id: string;
  zoneId: string;
  name: string;
  code: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  rackNumber: number;
}

export interface WarehouseBin {
  id: string;
  rackId: string;
  code: string;
  shelfLevel: number;
  palletNumber: number;
}
