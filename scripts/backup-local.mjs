import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const BACKUP_FORMAT = 'warehouseos-backup';
const BACKUP_VERSION = 1;
const RETENTION_DAYS = 7;
const PAGE_SIZE = 1000;
const FILE_PATTERN = /^warehouseos-backup-(\d{4}-\d{2}-\d{2})\.json$/;
const TABLES = [
  'warehouse_zones',
  'warehouse_racks',
  'warehouse_bins',
  'deposits',
  'deposit_items',
  'withdrawals',
  'warehouse_location_movements',
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');

function parseEnvFile(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchAllRows(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function pruneOldBackups(backupDirectory) {
  const backupFiles = (await readdir(backupDirectory))
    .filter((name) => FILE_PATTERN.test(name))
    .sort((left, right) => right.localeCompare(left));
  const expiredFiles = backupFiles.slice(RETENTION_DAYS);
  await Promise.all(expiredFiles.map((name) => unlink(join(backupDirectory, name))));
  return expiredFiles.length;
}

async function main() {
  const envFile = parseEnvFile(await readFile(join(projectDirectory, '.env.local'), 'utf8'));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envFile.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || envFile.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const warnings = [];
  const entries = await Promise.all(TABLES.map(async (table) => {
    try {
      return [table, await fetchAllRows(supabase, table)];
    } catch (error) {
      if (table !== 'warehouse_location_movements') throw error;
      warnings.push(error instanceof Error ? error.message : 'อ่านประวัติย้ายตำแหน่งไม่สำเร็จ');
      return [table, []];
    }
  }));

  const createdAt = new Date().toISOString();
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    source: 'automatic',
    tables: Object.fromEntries(entries),
    warnings,
  };
  const backupDirectory = process.env.WAREHOUSE_BACKUP_DIR || join(homedir(), 'WarehouseOS-Backups');
  await mkdir(backupDirectory, { recursive: true });
  const fileName = `warehouseos-backup-${localDateStamp()}.json`;
  const outputPath = join(backupDirectory, fileName);
  const temporaryPath = join(backupDirectory, `.${fileName}.${process.pid}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(backup, null, 2), 'utf8');
  await copyFile(temporaryPath, outputPath);
  await unlink(temporaryPath);
  const deletedFiles = await pruneOldBackups(backupDirectory);
  const rowCount = entries.reduce((total, [, rows]) => total + rows.length, 0);

  console.log(`WarehouseOS backup completed: ${outputPath}`);
  console.log(`Rows: ${rowCount} | Retained: ${RETENTION_DAYS} days | Removed: ${deletedFiles}`);
  if (warnings.length > 0) console.warn(`Warnings: ${warnings.join(' | ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
