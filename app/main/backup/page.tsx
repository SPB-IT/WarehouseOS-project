'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUTO_BACKUP_LAST_ERROR_KEY,
  AUTO_BACKUP_LAST_SUCCESS_KEY,
  AUTO_BACKUP_RETENTION_DAYS,
  BACKUP_TABLES,
  RESTORE_TABLES,
  StoredBrowserBackup,
  WarehouseBackupFile,
  backupTableCounts,
  countBackupRows,
  createWarehouseBackup,
  downloadWarehouseBackup,
  listAutomaticBackups,
  parseWarehouseBackup,
  restoreWarehouseBackup,
  saveAutomaticBackup,
} from '../../../lib/warehouseBackup';

const TABLE_LABELS: Record<(typeof BACKUP_TABLES)[number], string> = {
  warehouse_zones: 'โซนบนผัง',
  warehouse_racks: 'Rack',
  warehouse_bins: 'ชั้นวาง',
  deposits: 'รายการรับฝาก',
  deposit_items: 'สินค้า',
  withdrawals: 'รายการคืนสินค้า',
  warehouse_location_movements: 'ประวัติย้ายตำแหน่ง',
};

type BusyAction = 'download' | 'automatic' | 'restore' | null;

function Icon({ name, size = 22 }: { name: 'download' | 'clock' | 'upload' | 'restore' | 'file' | 'shield'; size?: number }) {
  const common = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, viewBox: '0 0 24 24' };
  if (name === 'download') return <svg {...common}><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3h16v-3"/></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (name === 'upload') return <svg {...common}><path d="M12 16V4m0 0 4 4m-4-4L8 8"/><path d="M4 17v3h16v-3"/></svg>;
  if (name === 'restore') return <svg {...common}><path d="M4 5v5h5"/><path d="M5.5 9a8 8 0 1 1-.8 6"/></svg>;
  if (name === 'shield') return <svg {...common}><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  return <svg {...common}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>;
}

function formatDate(value: string | null) {
  if (!value) return 'ยังไม่เคยสำรอง';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ไม่ทราบเวลา';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function backupSourceLabel(source: WarehouseBackupFile['source']) {
  return source === 'automatic' ? 'สำรองอัตโนมัติ' : 'สำรองด้วยตนเอง';
}

export default function BackupPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [automaticBackups, setAutomaticBackups] = useState<StoredBrowserBackup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<WarehouseBackupFile | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [lastAutomaticAt, setLastAutomaticAt] = useState<string | null>(null);
  const [automaticError, setAutomaticError] = useState('');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [restoredRows, setRestoredRows] = useState(0);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshAutomaticBackups = useCallback(async () => {
    try {
      const snapshots = await listAutomaticBackups();
      setAutomaticBackups(snapshots);
      setLastAutomaticAt(window.localStorage.getItem(AUTO_BACKUP_LAST_SUCCESS_KEY));
      setAutomaticError(window.localStorage.getItem(AUTO_BACKUP_LAST_ERROR_KEY) ?? '');
    } catch (error) {
      setAutomaticError(error instanceof Error ? error.message : 'อ่านข้อมูลสำรองอัตโนมัติไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refreshAutomaticBackups();
    const onAutomaticBackup = () => void refreshAutomaticBackups();
    window.addEventListener('warehouseos:auto-backup-updated', onAutomaticBackup);
    return () => window.removeEventListener('warehouseos:auto-backup-updated', onAutomaticBackup);
  }, [refreshAutomaticBackups]);

  const selectedCounts = useMemo(
    () => selectedBackup ? backupTableCounts(selectedBackup) : null,
    [selectedBackup],
  );

  const downloadCurrentData = async () => {
    setBusy('download');
    setNotice(null);
    try {
      const backup = await createWarehouseBackup('manual');
      downloadWarehouseBackup(backup);
      setNotice({ type: 'success', text: `ดาวน์โหลด Backup แล้ว ${countBackupRows(backup).toLocaleString('th-TH')} รายการ` });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'สร้างไฟล์ Backup ไม่สำเร็จ' });
    } finally {
      setBusy(null);
    }
  };

  const createAutomaticSnapshot = async () => {
    setBusy('automatic');
    setNotice(null);
    try {
      const backup = await createWarehouseBackup('automatic');
      await saveAutomaticBackup(backup);
      window.localStorage.setItem(AUTO_BACKUP_LAST_SUCCESS_KEY, backup.createdAt);
      window.localStorage.removeItem(AUTO_BACKUP_LAST_ERROR_KEY);
      await refreshAutomaticBackups();
      setNotice({ type: 'success', text: 'สำรองข้อมูลลงเบราว์เซอร์เครื่องนี้เรียบร้อยแล้ว' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'สำรองข้อมูลไม่สำเร็จ';
      window.localStorage.setItem(AUTO_BACKUP_LAST_ERROR_KEY, message);
      setAutomaticError(message);
      setNotice({ type: 'error', text: message });
    } finally {
      setBusy(null);
    }
  };

  const selectStoredBackup = (stored: StoredBrowserBackup) => {
    setSelectedBackup(stored.backup);
    setSelectedFileName(`สำรองอัตโนมัติ · ${formatDate(stored.createdAt)}`);
    setRestoredRows(0);
    setNotice(null);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const readBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice(null);
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const backup = parseWarehouseBackup(raw);
      setSelectedBackup(backup);
      setSelectedFileName(file.name);
      setRestoredRows(0);
    } catch (error) {
      setSelectedBackup(null);
      setSelectedFileName('');
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'อ่านไฟล์ Backup ไม่สำเร็จ' });
    }
  };

  const restoreSelectedBackup = async () => {
    if (!selectedBackup) return;
    const confirmed = window.confirm(
      'ยืนยันกู้คืนข้อมูลจาก Backup นี้?\n\nระบบจะเพิ่มข้อมูลที่หายและอัปเดตรายการเดิมตามรหัส โดยไม่ลบข้อมูลใหม่ที่มีอยู่',
    );
    if (!confirmed) return;

    setBusy('restore');
    setRestoredRows(0);
    setNotice(null);
    try {
      const total = await restoreWarehouseBackup(selectedBackup, ({ restored }) => setRestoredRows(restored));
      setNotice({ type: 'success', text: `กู้คืนข้อมูลสำเร็จ ${total.toLocaleString('th-TH')} รายการ` });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'กู้คืนข้อมูลไม่สำเร็จ' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="backup-page">
      <style>{`
        .backup-page{min-height:calc(100vh - 64px);padding:30px 22px 64px;background:linear-gradient(180deg,#f5f9fd 0,#fffaf1 48%,#f7f9fc 100%);color:var(--sp-navy);font-family:'Sarabun','Noto Sans Thai',sans-serif}
        .backup-shell{width:min(1120px,100%);margin:0 auto}
        .backup-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:20px;padding:2px 3px}
        .backup-kicker{display:flex;align-items:center;gap:7px;color:var(--sp-orange-dark);font-size:11px;font-weight:900;letter-spacing:.9px;text-transform:uppercase}
        .backup-hero h1{margin:5px 0 4px;font-size:clamp(25px,3vw,34px);letter-spacing:-.7px}.backup-hero p{margin:0;color:var(--sp-text3);font-size:13px}
        .backup-safe{display:flex;align-items:center;gap:9px;padding:9px 13px;border:1px solid #bee1d1;border-radius:12px;background:#ebf8f2;color:#116c49;font-size:12px;font-weight:800;white-space:nowrap}
        .backup-notice{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;padding:12px 15px;border-radius:11px;font-size:13px;font-weight:700}.backup-notice.success{background:#eaf8f1;border:1px solid #bfe4d2;color:#116c49}.backup-notice.error{background:#fff0eb;border:1px solid #f0c5b7;color:#9e3d26}.backup-notice button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:17px}
        .backup-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.backup-card{background:rgba(255,253,248,.96);border:1px solid #d9e3ee;border-radius:17px;box-shadow:0 10px 30px rgba(23,63,122,.08);overflow:hidden}.backup-card-head{display:flex;align-items:flex-start;gap:12px;padding:18px 19px 12px}.backup-icon{width:43px;height:43px;display:grid;place-items:center;flex:0 0 43px;border-radius:12px;background:#eaf3fd;color:var(--sp-blue)}.backup-icon.gold{background:#fff3cc;color:#b67800}.backup-card h2{margin:1px 0 2px;font-size:17px}.backup-card-head p,.backup-muted{margin:0;color:var(--sp-text3);font-size:11.5px;line-height:1.5}.backup-card-body{padding:0 19px 19px}.backup-action{width:100%;min-height:43px;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;background:linear-gradient(135deg,var(--sp-blue),#3975b9);color:#fff;font:800 13px inherit;cursor:pointer;box-shadow:0 5px 12px rgba(38,105,179,.18)}.backup-action.gold{background:linear-gradient(135deg,#e2ad25,#efc64f);color:#173f7a}.backup-action.outline{background:#fff;border:1px solid #cbd9e8;color:var(--sp-navy);box-shadow:none}.backup-action.restore{background:linear-gradient(135deg,#b9472b,#d26743)}.backup-action:disabled{cursor:wait;opacity:.58;box-shadow:none}
        .backup-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:13px 0}.backup-fact{padding:9px;border-radius:9px;background:#f1f6fb;border:1px solid #e0e9f2;text-align:center}.backup-fact strong{display:block;font-size:15px}.backup-fact span{display:block;margin-top:1px;color:var(--sp-text3);font-size:10px}
        .auto-status{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 11px;margin-bottom:10px;border-radius:10px;background:#f2f7fc;border:1px solid #dce8f3}.auto-status span{font-size:10.5px;color:var(--sp-text3)}.auto-status strong{display:block;margin-top:1px;font-size:12px}.auto-error{margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#fff0eb;color:#9e3d26;font-size:11px}
        .snapshot-list{display:grid;gap:7px;margin-top:11px}.snapshot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid #e0e7ef;border-radius:10px;background:#fff}.snapshot strong{display:block;font-size:11.5px}.snapshot span{display:block;font-size:10px;color:var(--sp-text3)}.snapshot-actions{display:flex;gap:5px}.snapshot-actions button{border:1px solid #d7e1eb;background:#f8fbfe;color:var(--sp-blue);border-radius:7px;padding:6px 8px;cursor:pointer;font:700 10.5px inherit}.snapshot-empty{padding:13px;text-align:center;border:1px dashed #cbd9e8;border-radius:10px;color:var(--sp-text3);font-size:11px}
        .upload-zone{display:grid;place-items:center;min-height:124px;padding:18px;border:1.5px dashed #c4d5e7;border-radius:12px;background:#f8fbfe;text-align:center;cursor:pointer;transition:.15s}.upload-zone:hover{border-color:var(--sp-blue);background:#eef6fd}.upload-zone strong{display:block;margin:7px 0 2px;font-size:13px}.upload-zone span{font-size:10.5px;color:var(--sp-text3)}
        .backup-local,.backup-summary{grid-column:1/-1}.local-layout{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,150px);gap:10px;align-items:stretch}.local-path{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid #c8dfd4;border-radius:10px;background:#edf8f3;color:#116c49}.local-path strong{display:block;font-size:11.5px}.local-path code{display:block;margin-top:2px;color:#315b4b;font:600 10.5px Consolas,monospace;word-break:break-all}.local-detail{display:grid;place-items:center;padding:9px;border:1px solid #e0e7ef;border-radius:10px;background:#fff;text-align:center}.local-detail strong{display:block;font-size:13px}.local-detail span{display:block;margin-top:1px;color:var(--sp-text3);font-size:9.5px}.summary-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px}.selected-file{display:flex;gap:11px;align-items:center;padding:11px 12px;margin-bottom:12px;border-radius:10px;background:#eef5fc;color:var(--sp-blue)}.selected-file strong{display:block;font-size:12px;word-break:break-word}.selected-file span{font-size:10.5px;color:var(--sp-text3)}.count-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.count-item{padding:9px;border:1px solid #e1e8f0;border-radius:9px;background:#fff}.count-item span{display:block;color:var(--sp-text3);font-size:10px}.count-item strong{display:block;margin-top:1px;font-size:15px}.restore-panel{display:flex;flex-direction:column;justify-content:center;padding:15px;border:1px solid #f0d7ca;border-radius:12px;background:#fff7f1}.restore-panel p{margin:0 0 11px;font-size:11px;line-height:1.55;color:var(--sp-text3)}.restore-progress{margin:0 0 8px;color:var(--sp-orange-dark);font-size:11px;font-weight:800}.backup-warning{display:flex;gap:10px;margin-top:16px;padding:13px 15px;border:1px solid #efd9a6;border-radius:12px;background:#fff8e6;color:#6d5420;font-size:11.5px;line-height:1.55}.backup-warning svg{flex:0 0 auto}.backup-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.45);border-top-color:currentColor;border-radius:50%;animation:backup-spin .7s linear infinite}@keyframes backup-spin{to{transform:rotate(360deg)}}
        @media(max-width:760px){.backup-page{padding:22px 12px 45px}.backup-hero{align-items:flex-start;flex-direction:column;gap:10px}.backup-grid{grid-template-columns:1fr}.backup-local,.backup-summary{grid-column:auto}.local-layout,.summary-layout{grid-template-columns:1fr}.count-grid{grid-template-columns:repeat(2,1fr)}.backup-safe{white-space:normal}.snapshot{grid-template-columns:1fr}.snapshot-actions button{flex:1}.snapshot-actions{width:100%}}
      `}</style>

      <div className="backup-shell">
        <header className="backup-hero">
          <div>
            <div className="backup-kicker"><Icon name="shield" size={15}/> DATA SAFETY</div>
            <h1>สำรองและกู้คืนข้อมูล</h1>
            <p>เก็บสำเนาข้อมูลคลังไว้ เผื่อลบผิด เครื่องเสีย หรืออยากย้ายข้อมูล</p>
          </div>
          <div className="backup-safe"><Icon name="shield" size={18}/> กู้คืนแบบรวมข้อมูล ไม่ลบรายการใหม่</div>
        </header>

        {notice && (
          <div className={`backup-notice ${notice.type}`} role="status">
            <span>{notice.text}</span><button type="button" aria-label="ปิดข้อความ" onClick={() => setNotice(null)}>×</button>
          </div>
        )}

        <section className="backup-grid">
          <article className="backup-card">
            <div className="backup-card-head"><span className="backup-icon"><Icon name="download"/></span><div><h2>ดาวน์โหลด Backup</h2><p>รวมข้อมูลคลังทั้งหมดเป็นไฟล์ JSON เก็บไว้นอกระบบ</p></div></div>
            <div className="backup-card-body">
              <div className="backup-facts"><div className="backup-fact"><strong>7</strong><span>ชุดข้อมูล</span></div><div className="backup-fact"><strong>JSON</strong><span>เปิดกู้คืนได้</span></div><div className="backup-fact"><strong>ทันที</strong><span>ข้อมูลล่าสุด</span></div></div>
              <button type="button" className="backup-action" disabled={busy !== null} onClick={() => void downloadCurrentData()}>{busy === 'download' ? <span className="backup-spinner"/> : <Icon name="download" size={17}/>} {busy === 'download' ? 'กำลังรวบรวมข้อมูล…' : 'ดาวน์โหลดข้อมูลปัจจุบัน'}</button>
            </div>
          </article>

          <article className="backup-card">
            <div className="backup-card-head"><span className="backup-icon gold"><Icon name="clock"/></span><div><h2>สำรองอัตโนมัติ</h2><p>สำรองวันละครั้งเมื่อเปิดเว็บ และเก็บ 7 วันล่าสุดในเบราว์เซอร์เครื่องนี้</p></div></div>
            <div className="backup-card-body">
              <div className="auto-status"><div><span>สำรองล่าสุด</span><strong>{formatDate(lastAutomaticAt)}</strong></div><span>เก็บ {AUTO_BACKUP_RETENTION_DAYS} วัน</span></div>
              {automaticError && <p className="auto-error">ครั้งล่าสุดไม่สำเร็จ: {automaticError}</p>}
              <button type="button" className="backup-action gold" disabled={busy !== null} onClick={() => void createAutomaticSnapshot()}>{busy === 'automatic' ? <span className="backup-spinner"/> : <Icon name="clock" size={17}/>} {busy === 'automatic' ? 'กำลังสำรอง…' : 'สำรองตอนนี้'}</button>
              <div className="snapshot-list">
                {automaticBackups.length === 0 ? <div className="snapshot-empty">ยังไม่มีสำเนาอัตโนมัติบนเครื่องนี้</div> : automaticBackups.map((stored) => (
                  <div className="snapshot" key={stored.id}><div><strong>{formatDate(stored.createdAt)}</strong><span>{countBackupRows(stored.backup).toLocaleString('th-TH')} รายการ</span></div><div className="snapshot-actions"><button type="button" onClick={() => downloadWarehouseBackup(stored.backup)}>ดาวน์โหลด</button><button type="button" onClick={() => selectStoredBackup(stored)}>เลือกกู้คืน</button></div></div>
                ))}
              </div>
            </div>
          </article>

          <article className="backup-card backup-local">
            <div className="backup-card-head"><span className="backup-icon"><Icon name="file"/></span><div><h2>ไฟล์สำรองอัตโนมัติในเครื่องหลัก</h2><p>Windows สร้างไฟล์จริงให้ทุกวันโดยไม่ต้องเปิดหน้าเว็บ และเก็บย้อนหลัง 7 วัน</p></div></div>
            <div className="backup-card-body local-layout">
              <div className="local-path"><Icon name="shield" size={21}/><div><strong>เปิดใช้งานแล้ว</strong><code>C:\Users\Nexok\WarehouseOS-Backups</code></div></div>
              <div className="local-detail"><div><strong>20:00 น.</strong><span>สำรองทุกวัน</span></div></div>
              <div className="local-detail"><div><strong>7 ไฟล์</strong><span>ย้อนหลังสูงสุด</span></div></div>
              <div className="local-detail"><div><strong>เปิดเครื่องครั้งถัดไป</strong><span>ทำงานชดเชยหากพลาดเวลา</span></div></div>
            </div>
          </article>

          <article className="backup-card">
            <div className="backup-card-head"><span className="backup-icon"><Icon name="upload"/></span><div><h2>เลือกไฟล์ Backup</h2><p>อัปโหลดไฟล์ที่เคยดาวน์โหลดไว้ ระบบจะตรวจสอบก่อนกู้คืน</p></div></div>
            <div className="backup-card-body">
              <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void readBackupFile(event)}/>
              <button type="button" className="upload-zone" onClick={() => fileInputRef.current?.click()}><Icon name="upload" size={27}/><strong>คลิกเพื่อเลือกไฟล์ .json</strong><span>ระบบยังไม่แก้ข้อมูลจนกว่าจะกดยืนยันกู้คืน</span></button>
            </div>
          </article>

          <article className="backup-card">
            <div className="backup-card-head"><span className="backup-icon gold"><Icon name="file"/></span><div><h2>วิธีเก็บ Backup ที่แนะนำ</h2><p>ไฟล์สำรองควรอยู่นอกเครื่องที่เปิดระบบคลัง</p></div></div>
            <div className="backup-card-body">
              <div className="backup-facts"><div className="backup-fact"><strong>1</strong><span>เก็บในเครื่อง</span></div><div className="backup-fact"><strong>1</strong><span>เก็บ Flash Drive</span></div><div className="backup-fact"><strong>1</strong><span>เก็บ Cloud</span></div></div>
              <p className="backup-muted">แนะนำดาวน์โหลดเองทุกสัปดาห์ เพราะสำรองอัตโนมัติจะหายหากล้างข้อมูลเบราว์เซอร์หรือเครื่องเสีย</p>
            </div>
          </article>

          {selectedBackup && selectedCounts && (
            <article className="backup-card backup-summary">
              <div className="backup-card-head"><span className="backup-icon gold"><Icon name="restore"/></span><div><h2>ตรวจสอบก่อนกู้คืน</h2><p>ไฟล์ผ่านการตรวจสอบรูปแบบแล้ว เลือกกู้คืนเมื่อข้อมูลถูกต้อง</p></div></div>
              <div className="backup-card-body summary-layout">
                <div>
                  <div className="selected-file"><Icon name="file" size={24}/><div><strong>{selectedFileName}</strong><span>{backupSourceLabel(selectedBackup.source)} · {formatDate(selectedBackup.createdAt)} · รวม {countBackupRows(selectedBackup).toLocaleString('th-TH')} รายการ</span></div></div>
                  <div className="count-grid">{BACKUP_TABLES.map((table) => <div className="count-item" key={table}><span>{TABLE_LABELS[table]}</span><strong>{selectedCounts[table].toLocaleString('th-TH')}</strong></div>)}</div>
                </div>
                <aside className="restore-panel">
                  <p>กู้คืนตามลำดับ โซน → Rack → ชั้นวาง → รายการสินค้า และจะไม่ลบข้อมูลที่สร้างหลังวันสำรอง</p>
                  {busy === 'restore' && <div className="restore-progress">กู้คืนแล้ว {restoredRows.toLocaleString('th-TH')} รายการ…</div>}
                  <button type="button" className="backup-action restore" disabled={busy !== null} onClick={() => void restoreSelectedBackup()}>{busy === 'restore' ? <span className="backup-spinner"/> : <Icon name="restore" size={17}/>} {busy === 'restore' ? 'กำลังกู้คืน…' : `กู้คืน ${RESTORE_TABLES.length} ชุดข้อมูล`}</button>
                </aside>
              </div>
            </article>
          )}
        </section>

        <div className="backup-warning"><Icon name="shield" size={19}/><span><strong>ไฟล์ Backup มีข้อมูลผู้ฝากและเบอร์โทรศัพท์</strong><br/>เก็บไฟล์ให้เฉพาะคนในร้านที่ได้รับอนุญาต ส่วนประวัติการย้ายตำแหน่งจะส่งออกไว้เป็นหลักฐาน แต่ไม่เขียนย้อนกลับเพื่อป้องกันประวัติซ้ำ</span></div>
      </div>
    </main>
  );
}
