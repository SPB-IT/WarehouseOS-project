import { supabase } from './supabase';
import { fetchAllSupabaseRows } from './supabasePagination';

export const WAREHOUSE_BACKUP_FORMAT = 'warehouseos-backup';
export const WAREHOUSE_BACKUP_VERSION = 1;
export const AUTO_BACKUP_RETENTION_DAYS = 7;
export const AUTO_BACKUP_LAST_SUCCESS_KEY = 'warehouseos:auto-backup:last-success';
export const AUTO_BACKUP_LAST_ERROR_KEY = 'warehouseos:auto-backup:last-error';

export const BACKUP_TABLES = [
  'warehouse_zones',
  'warehouse_racks',
  'warehouse_bins',
  'deposits',
  'deposit_items',
  'withdrawals',
  'warehouse_location_movements',
] as const;

export const RESTORE_TABLES = [
  'warehouse_zones',
  'warehouse_racks',
  'warehouse_bins',
  'deposits',
  'deposit_items',
  'withdrawals',
] as const;

export type BackupTable = typeof BACKUP_TABLES[number];
export type BackupSource = 'manual' | 'automatic';
export type BackupRow = Record<string, unknown>;

export interface WarehouseBackupFile {
  format: typeof WAREHOUSE_BACKUP_FORMAT;
  version: typeof WAREHOUSE_BACKUP_VERSION;
  createdAt: string;
  source: BackupSource;
  tables: Record<BackupTable, BackupRow[]>;
  warnings: string[];
}

export interface StoredBrowserBackup {
  id: string;
  createdAt: string;
  backup: WarehouseBackupFile;
}

export interface RestoreProgress {
  table: typeof RESTORE_TABLES[number];
  restored: number;
}

const BACKUP_DB_NAME = 'warehouseos-backups';
const BACKUP_DB_VERSION = 1;
const BACKUP_STORE_NAME = 'snapshots';
const UPSERT_CHUNK_SIZE = 250;

async function fetchTableRows(table: BackupTable) {
  return fetchAllSupabaseRows<BackupRow>(async (from, to) => {
    const result = await supabase.from(table).select('*').range(from, to);
    return result as { data: BackupRow[] | null; error: { message: string; code?: string } | null };
  });
}

export async function createWarehouseBackup(source: BackupSource = 'manual'): Promise<WarehouseBackupFile> {
  const warnings: string[] = [];
  const tableEntries = await Promise.all(BACKUP_TABLES.map(async (table) => {
    try {
      return [table, await fetchTableRows(table)] as const;
    } catch (error) {
      if (table !== 'warehouse_location_movements') throw error;
      const message = error instanceof Error ? error.message : 'ไม่สามารถอ่านประวัติการย้ายตำแหน่งได้';
      warnings.push(`warehouse_location_movements: ${message}`);
      return [table, []] as const;
    }
  }));

  return {
    format: WAREHOUSE_BACKUP_FORMAT,
    version: WAREHOUSE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    source,
    tables: Object.fromEntries(tableEntries) as Record<BackupTable, BackupRow[]>,
    warnings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseWarehouseBackup(value: unknown): WarehouseBackupFile {
  if (!isRecord(value)) throw new Error('ไฟล์ Backup ไม่ถูกต้อง');
  if (value.format !== WAREHOUSE_BACKUP_FORMAT || value.version !== WAREHOUSE_BACKUP_VERSION) {
    throw new Error('ไฟล์นี้ไม่ใช่ Backup ของ WarehouseOS รุ่นที่รองรับ');
  }
  if (typeof value.createdAt !== 'string' || !isRecord(value.tables)) {
    throw new Error('ไฟล์ Backup ขาดข้อมูลสำคัญ');
  }

  const tables = {} as Record<BackupTable, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    const rows = value.tables[table];
    if (!Array.isArray(rows) || rows.some((row) => !isRecord(row))) {
      throw new Error(`ข้อมูลตาราง ${table} ไม่ถูกต้อง`);
    }
    tables[table] = rows as BackupRow[];
  }

  return {
    format: WAREHOUSE_BACKUP_FORMAT,
    version: WAREHOUSE_BACKUP_VERSION,
    createdAt: value.createdAt,
    source: value.source === 'automatic' ? 'automatic' : 'manual',
    tables,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

export function countBackupRows(backup: WarehouseBackupFile) {
  return BACKUP_TABLES.reduce((total, table) => total + backup.tables[table].length, 0);
}

export function backupTableCounts(backup: WarehouseBackupFile) {
  return Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, backup.tables[table].length]),
  ) as Record<BackupTable, number>;
}

export function downloadWarehouseBackup(backup: WarehouseBackupFile) {
  const timestamp = backup.createdAt.replace(/[:.]/g, '-');
  const fileName = `warehouseos-backup-${timestamp}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function restoreWarehouseBackup(
  backup: WarehouseBackupFile,
  onProgress?: (progress: RestoreProgress) => void,
) {
  let restored = 0;
  for (const table of RESTORE_TABLES) {
    const rows = backup.tables[table];
    for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
      restored += chunk.length;
      onProgress?.({ table, restored });
    }
  }
  return restored;
}

function openBackupDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        database.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('เปิดพื้นที่สำรองในเบราว์เซอร์ไม่สำเร็จ'));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('อ่านข้อมูลสำรองไม่สำเร็จ'));
  });
}

export async function listAutomaticBackups() {
  const database = await openBackupDatabase();
  try {
    const transaction = database.transaction(BACKUP_STORE_NAME, 'readonly');
    const records = await requestResult(
      transaction.objectStore(BACKUP_STORE_NAME).getAll() as IDBRequest<StoredBrowserBackup[]>,
    );
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } finally {
    database.close();
  }
}

export async function saveAutomaticBackup(backup: WarehouseBackupFile) {
  const database = await openBackupDatabase();
  try {
    const id = `automatic-${backup.createdAt.slice(0, 10)}`;
    const writeTransaction = database.transaction(BACKUP_STORE_NAME, 'readwrite');
    await requestResult(writeTransaction.objectStore(BACKUP_STORE_NAME).put({
      id,
      createdAt: backup.createdAt,
      backup,
    } as StoredBrowserBackup));

    const readTransaction = database.transaction(BACKUP_STORE_NAME, 'readonly');
    const records = await requestResult(
      readTransaction.objectStore(BACKUP_STORE_NAME).getAll() as IDBRequest<StoredBrowserBackup[]>,
    );
    const expiredRecords = records
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(AUTO_BACKUP_RETENTION_DAYS);
    if (expiredRecords.length > 0) {
      const deleteTransaction = database.transaction(BACKUP_STORE_NAME, 'readwrite');
      expiredRecords.forEach((record) => deleteTransaction.objectStore(BACKUP_STORE_NAME).delete(record.id));
    }
  } finally {
    database.close();
  }
}
