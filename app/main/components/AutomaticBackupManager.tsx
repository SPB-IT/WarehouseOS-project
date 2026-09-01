'use client';

import { useEffect } from 'react';
import {
  AUTO_BACKUP_LAST_ERROR_KEY,
  AUTO_BACKUP_LAST_SUCCESS_KEY,
  createWarehouseBackup,
  saveAutomaticBackup,
} from '../../../lib/warehouseBackup';

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AUTO_BACKUP_RUNNING_KEY = 'warehouseos:auto-backup:running';

export default function AutomaticBackupManager() {
  useEffect(() => {
    const lastSuccess = window.localStorage.getItem(AUTO_BACKUP_LAST_SUCCESS_KEY);
    if (lastSuccess && Date.now() - new Date(lastSuccess).getTime() < AUTO_BACKUP_INTERVAL_MS) return;
    if (window.sessionStorage.getItem(AUTO_BACKUP_RUNNING_KEY) === '1') return;

    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(AUTO_BACKUP_RUNNING_KEY, '1');
      void createWarehouseBackup('automatic')
        .then(async (backup) => {
          await saveAutomaticBackup(backup);
          window.localStorage.setItem(AUTO_BACKUP_LAST_SUCCESS_KEY, backup.createdAt);
          window.localStorage.removeItem(AUTO_BACKUP_LAST_ERROR_KEY);
          window.dispatchEvent(new CustomEvent('warehouseos:auto-backup-updated'));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'สำรองข้อมูลอัตโนมัติไม่สำเร็จ';
          window.localStorage.setItem(AUTO_BACKUP_LAST_ERROR_KEY, message);
        })
        .finally(() => window.sessionStorage.removeItem(AUTO_BACKUP_RUNNING_KEY));
    }, 2500);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
