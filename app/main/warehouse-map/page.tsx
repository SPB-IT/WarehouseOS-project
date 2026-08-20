'use client';

import dynamic from 'next/dynamic';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { WarehouseZone, ZonePositionUpdate } from './types';
import {
  applyReferenceWarehouseLayout,
  cloneDefaultWarehouseZones,
  loadWarehouseZones,
  parseWarehouseZones,
  saveWarehouseZones,
  WAREHOUSE_ZONE_COLORS,
} from './warehouseMapData';
import {
  addWarehouseRack,
  createWarehouseZone,
  deleteWarehouseZone,
  fetchWarehouseRackCounts,
  fetchWarehouseZones,
  removeLastWarehouseRack,
  subscribeToWarehouseRacks,
  subscribeToWarehouseZones,
  updateWarehouseZone,
  upsertWarehouseZones,
} from './warehouseMapRepository';

const WarehouseMapCanvas = dynamic(() => import('./WarehouseMapCanvas'), {
  ssr: false,
  loading: () => <div className="wm-canvas-loading">กำลังเปิดพื้นที่วาดผัง...</div>,
});

function createZoneId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `zone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function WarehouseMapPage() {
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncMode, setSyncMode] = useState<'loading' | 'supabase' | 'browser'>('loading');
  const [saving, setSaving] = useState(false);
  const [rackSaving, setRackSaving] = useState(false);
  const [rackCounts, setRackCounts] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<WarehouseZone | null>(null);
  const [formName, setFormName] = useState('');
  const [formLocationCode, setFormLocationCode] = useState('');
  const [formFloor, setFormFloor] = useState('ชั้น 1');
  const [formColor, setFormColor] = useState(WAREHOUSE_ZONE_COLORS[0]);
  const [formRackLevels, setFormRackLevels] = useState(4);
  const [formPalletsPerLevel, setFormPalletsPerLevel] = useState(2);
  const [formInitialRackCount, setFormInitialRackCount] = useState(1);
  const [notice, setNotice] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    let unsubscribeRacks: () => void = () => undefined;

    const loadZones = async () => {
      try {
        const [remoteZones, remoteRackCounts] = await Promise.all([
          fetchWarehouseZones(),
          fetchWarehouseRackCounts(),
        ]);
        if (!active) return;
        setZones(remoteZones);
        setRackCounts(remoteRackCounts);
        setSyncMode('supabase');
        unsubscribe = subscribeToWarehouseZones(async () => {
          try {
            const nextZones = await fetchWarehouseZones();
            if (active) setZones(nextZones);
          } catch {
            // รักษาผังล่าสุดไว้ หาก realtime สะดุดชั่วคราว
          }
        });
        unsubscribeRacks = subscribeToWarehouseRacks(async () => {
          try {
            const nextRackCounts = await fetchWarehouseRackCounts();
            if (active) setRackCounts(nextRackCounts);
          } catch {
            // รักษาจำนวน Rack ล่าสุดไว้ หาก realtime สะดุดชั่วคราว
          }
        });
      } catch {
        if (!active) return;
        setZones(loadWarehouseZones());
        setSyncMode('browser');
        setNotice('ยังไม่พบตาราง Supabase — ใช้ข้อมูลในเบราว์เซอร์ชั่วคราว');
      } finally {
        if (active) setHydrated(true);
      }
    };

    const frame = window.requestAnimationFrame(() => void loadZones());
    return () => {
      active = false;
      unsubscribe();
      unsubscribeRacks();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const refreshRackCounts = async () => {
    const nextCounts = await fetchWarehouseRackCounts();
    setRackCounts(nextCounts);
  };

  const selectedZone = selectedIds.length === 1
    ? zones.find((zone) => zone.id === selectedIds[0]) ?? null
    : null;
  const selectedRackCount = selectedZone ? rackCounts[selectedZone.id] ?? 1 : 0;
  const totalRackCount = Object.values(rackCounts).reduce((sum, count) => sum + count, 0);

  const addRackToSelectedZone = async () => {
    if (!selectedZone || syncMode !== 'supabase') return;
    setRackSaving(true);
    try {
      const rack = await addWarehouseRack(selectedZone);
      await refreshRackCounts();
      setNotice(`เพิ่ม Rack ${rack.rackNumber} ในช่อง ${selectedZone.locationCode} แล้ว`);
    } catch {
      setNotice('เพิ่ม Rack ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setRackSaving(false);
    }
  };

  const removeRackFromSelectedZone = async () => {
    if (!selectedZone || syncMode !== 'supabase') return;
    if (selectedRackCount <= 1) {
      setNotice('แต่ละโซนต้องมีอย่างน้อย 1 Rack');
      return;
    }
    if (!window.confirm(`ลบ Rack ${selectedRackCount} ของช่อง ${selectedZone.locationCode} หรือไม่?`)) return;

    setRackSaving(true);
    try {
      const rack = await removeLastWarehouseRack(selectedZone.id);
      await refreshRackCounts();
      setNotice(`ลบ Rack ${rack.rackNumber} แล้ว`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('RACK_NOT_EMPTY:')) {
        const itemCount = message.split(':')[1] ?? '0';
        setNotice(`ลบไม่ได้: Rack นี้มีประวัติสินค้า ${itemCount} รายการ`);
      } else if (message === 'MINIMUM_RACK') {
        setNotice('แต่ละโซนต้องมีอย่างน้อย 1 Rack');
      } else {
        setNotice('ลบ Rack ไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setRackSaving(false);
    }
  };

  useEffect(() => {
    if (!hydrated || syncMode !== 'browser') return;
    saveWarehouseZones(zones);
  }, [hydrated, syncMode, zones]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const message =
      selectedIds.length === 1
        ? 'ลบโซนที่เลือกออกจากผังหรือไม่?'
        : `ลบ ${selectedIds.length} โซนที่เลือกออกจากผังหรือไม่?`;
    if (!window.confirm(message)) return;

    setSaving(true);
    try {
      if (syncMode === 'supabase') {
        await Promise.all(selectedIds.map((id) => deleteWarehouseZone(id)));
      }
      setZones((current) => current.filter((zone) => !selectedIds.includes(zone.id)));
      setSelectedIds([]);
      setNotice('ลบโซนออกจากผังแล้ว');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('ZONE_NOT_EMPTY:')) {
        const itemCount = message.split(':')[1] ?? '0';
        setNotice(`ลบไม่ได้: โซนนี้มีประวัติสินค้า ${itemCount} รายการ`);
      } else {
        setNotice('ลบโซนไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setSaving(false);
    }
  }, [selectedIds, syncMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalOpen) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length > 0) {
        event.preventDefault();
        void deleteSelected();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedIds(zones.map((zone) => zone.id));
      } else if (event.key === 'Escape') {
        setSelectedIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, modalOpen, selectedIds.length, zones]);

  const openCreateModal = () => {
    setEditingZone(null);
    setFormName('');
    setFormLocationCode('');
    setFormFloor('ชั้น 1');
    setFormColor(WAREHOUSE_ZONE_COLORS[zones.length % WAREHOUSE_ZONE_COLORS.length]);
    setFormRackLevels(4);
    setFormPalletsPerLevel(2);
    setFormInitialRackCount(1);
    setModalOpen(true);
  };

  const openEditModal = (id: string) => {
    const zone = zones.find((candidate) => candidate.id === id);
    if (!zone) return;
    setEditingZone(zone);
    setFormName(zone.name);
    setFormLocationCode(zone.locationCode);
    setFormFloor(zone.floor);
    setFormColor(zone.color);
    setFormRackLevels(zone.rackLevels ?? 4);
    setFormPalletsPerLevel(zone.palletsPerLevel ?? 2);
    setFormInitialRackCount(rackCounts[zone.id] ?? 1);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingZone(null);
  };

  const saveZone = async () => {
    const name = formName.trim();
    const locationCode = formLocationCode.trim().toUpperCase();
    const floor = formFloor.trim();
    if (!name || !locationCode || !floor) return;
    const rackLevels = Math.min(Math.max(Math.round(formRackLevels), 1), 20);
    const palletsPerLevel = Math.min(Math.max(Math.round(formPalletsPerLevel), 1), 10);
    const initialRackCount = Math.min(Math.max(Math.round(formInitialRackCount), 1), 20);

    setSaving(true);
    try {
      if (editingZone) {
        const patch = { name, locationCode, floor, color: formColor, rackLevels, palletsPerLevel };
        if (syncMode === 'supabase') await updateWarehouseZone(editingZone.id, patch);
        setZones((current) =>
          current.map((zone) => zone.id === editingZone.id ? { ...zone, ...patch } : zone),
        );
        setNotice('อัปเดตโซนและซิงก์แล้ว');
      } else {
        const offset = (zones.length % 8) * 20;
        const draft = {
          name,
          locationCode,
          floor,
          posX: 40 + offset,
          posY: 40 + offset,
          width: 180,
          height: 120,
          color: formColor,
          rackLevels,
          palletsPerLevel,
        };
        const createdZone: WarehouseZone = syncMode === 'supabase'
          ? await createWarehouseZone(draft)
          : { id: createZoneId(), ...draft };
        const zone = { ...createdZone, rackLevels, palletsPerLevel };
        if (syncMode === 'supabase') {
          for (let index = 0; index < initialRackCount; index += 1) {
            await addWarehouseRack(zone);
          }
          await refreshRackCounts();
        } else {
          setRackCounts((current) => ({ ...current, [zone.id]: initialRackCount }));
        }
        setZones((current) => [...current, zone]);
        setSelectedIds([zone.id]);
        setNotice(`เพิ่มโซนพร้อม ${initialRackCount} Rack · ${rackLevels} ชั้น × ${palletsPerLevel} พาเลตแล้ว`);
      }
      closeModal();
    } catch {
      setNotice('บันทึกโซนไม่สำเร็จ ตรวจสอบรหัสตำแหน่งและชั้นว่าไม่ซ้ำ');
    } finally {
      setSaving(false);
    }
  };

  const updateZonePosition = (id: string, posX: number, posY: number) => {
    setZones((current) =>
      current.map((zone) => (zone.id === id ? { ...zone, posX, posY } : zone)),
    );
    if (syncMode === 'supabase') {
      setSaving(true);
      void updateWarehouseZone(id, { posX, posY })
        .catch(() => setNotice('ซิงก์ตำแหน่งไม่สำเร็จ'))
        .finally(() => setSaving(false));
    }
  };

  const updateZonesBulk = (updates: ZonePositionUpdate[]) => {
    const updatesById = new Map(updates.map((update) => [update.id, update]));
    setZones((current) =>
      current.map((zone) => {
        const update = updatesById.get(zone.id);
        return update ? { ...zone, posX: update.posX, posY: update.posY } : zone;
      }),
    );
    if (syncMode === 'supabase') {
      setSaving(true);
      void Promise.all(updates.map((update) => updateWarehouseZone(update.id, update)))
        .catch(() => setNotice('ซิงก์ตำแหน่งหลายโซนไม่สำเร็จ'))
        .finally(() => setSaving(false));
    }
  };

  const updateZoneSize = (
    id: string,
    posX: number,
    posY: number,
    width: number,
    height: number,
  ) => {
    setZones((current) =>
      current.map((zone) =>
        zone.id === id ? { ...zone, posX, posY, width, height } : zone,
      ),
    );
    if (syncMode === 'supabase') {
      setSaving(true);
      void updateWarehouseZone(id, { posX, posY, width, height })
        .catch(() => setNotice('ซิงก์ขนาดโซนไม่สำเร็จ'))
        .finally(() => setSaving(false));
    }
  };

  const exportLayout = () => {
    const payload = JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), zones },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `warehouse-layout-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('ส่งออกไฟล์ผังแล้ว');
  };

  const importLayout = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const importedZones = parseWarehouseZones(JSON.parse(await file.text()));
      if (!importedZones) {
        throw new Error('Invalid warehouse layout');
      }

      if (syncMode === 'supabase') await upsertWarehouseZones(importedZones);
      setZones(importedZones);
      setSelectedIds([]);
      setNotice('นำเข้าไฟล์ผังสำเร็จ');
    } catch {
      window.alert('ไฟล์นี้ไม่ใช่ไฟล์ผังคลังที่ระบบรองรับ');
    }
  };

  const resetToSample = () => {
    if (syncMode === 'supabase') {
      setNotice('โหมด Supabase: ใช้ปุ่มนำเข้าเพื่อแทนผังด้วยไฟล์ที่มี UUID');
      return;
    }
    if (!window.confirm('แทนที่ผังปัจจุบันด้วยผังตัวอย่างหรือไม่?')) return;
    setZones(cloneDefaultWarehouseZones());
    setSelectedIds([]);
    setNotice('คืนค่าผังตัวอย่างแล้ว');
  };

  const applyReferencePlan = async () => {
    const nextZones = applyReferenceWarehouseLayout(zones);
    const changedZones = nextZones.filter((zone, index) => {
      const current = zones[index];
      return current && (
        current.posX !== zone.posX ||
        current.posY !== zone.posY ||
        current.width !== zone.width ||
        current.height !== zone.height
      );
    });

    setSaving(true);
    try {
      if (syncMode === 'supabase') {
        await Promise.all(changedZones.map((zone) => updateWarehouseZone(zone.id, {
          posX: zone.posX,
          posY: zone.posY,
          width: zone.width,
          height: zone.height,
        })));
      }
      setZones(nextZones);
      setSelectedIds([]);
      setNotice('จัดผังตามแปลนคลัง 24 × 25 เมตรแล้ว');
    } catch {
      setNotice('จัดผังตามแปลนไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wh-page wm-page">
      <style>{`
        .wm-page { max-width: 1440px; }
        .wm-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:1.25rem; }
        .wm-header .wh-page-header { margin-bottom:0; }
        .wm-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .wm-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:1rem; }
        .wm-summary-card { background:#fff; border:1px solid var(--sp-border); border-radius:12px; padding:12px 15px; box-shadow:var(--sp-shadow); }
        .wm-summary-label { display:block; color:var(--sp-text3); font-size:11.5px; font-weight:700; margin-bottom:4px; }
        .wm-summary-value { color:var(--sp-navy); font-size:19px; font-weight:800; }
        .wm-summary-note { color:var(--sp-text2); font-size:12px; font-weight:600; }
        .wm-workspace { display:grid; grid-template-columns:250px minmax(0,1fr); gap:14px; align-items:start; }
        .wm-sidebar { background:#fff; border:1px solid var(--sp-border); border-radius:14px; box-shadow:var(--sp-shadow); overflow:hidden; }
        .wm-sidebar-head { padding:14px 15px; border-bottom:1px solid var(--sp-bg2); display:flex; align-items:center; justify-content:space-between; }
        .wm-sidebar-title { margin:0; color:var(--sp-navy); font-size:13px; font-weight:800; }
        .wm-zone-list { max-height:620px; overflow:auto; padding:8px; }
        .wm-zone-item { width:100%; border:1px solid transparent; background:transparent; border-radius:9px; padding:9px; display:flex; align-items:center; gap:9px; text-align:left; color:var(--sp-text2); font-family:inherit; cursor:pointer; transition:var(--sp-transition); }
        .wm-zone-item:hover { background:var(--sp-bg); border-color:var(--sp-border); }
        .wm-zone-item.active { background:#eef4fb; border-color:#a9c8ea; color:var(--sp-navy); }
        .wm-zone-color { width:14px; height:14px; border-radius:4px; flex:0 0 auto; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08); }
        .wm-zone-copy { min-width:0; flex:1; }
        .wm-zone-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:700; }
        .wm-zone-size { display:block; color:var(--sp-text3); font-size:10.5px; margin-top:2px; }
        .wm-empty-list { padding:28px 12px; text-align:center; color:var(--sp-text3); font-size:12px; }
        .wm-map-card { min-width:0; background:#fff; border:1px solid var(--sp-border); border-radius:14px; box-shadow:var(--sp-shadow); overflow:hidden; }
        .wm-map-toolbar { min-height:50px; padding:9px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-bottom:1px solid var(--sp-border); background:linear-gradient(90deg,#f9fbfe,#eef4fb); }
        .wm-map-toolbar-left { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .wm-selection-pill { background:#deeafa; color:var(--sp-blue); border:1px solid #b9d2ef; border-radius:99px; padding:5px 10px; font-size:11.5px; font-weight:800; }
        .wm-rack-control { display:flex; align-items:center; gap:5px; padding:3px 5px 3px 9px; border:1px solid #bfd2e7; border-radius:9px; background:#fff; color:var(--sp-navy); font-size:11px; font-weight:800; }
        .wm-rack-control button { width:27px; height:27px; padding:0; border:1px solid var(--sp-border); border-radius:7px; background:#f7faff; color:var(--sp-blue); font:800 16px 'Sarabun',sans-serif; cursor:pointer; }
        .wm-rack-control button:hover:not(:disabled) { border-color:var(--sp-blue-md); background:#eef5fd; }
        .wm-rack-control button:disabled { opacity:.4; cursor:not-allowed; }
        .wm-autosave { display:flex; align-items:center; gap:6px; color:var(--sp-success); font-size:11.5px; font-weight:700; white-space:nowrap; }
        .wm-autosave::before { content:''; width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 3px #dcfce7; }
        .wm-canvas-shell { position:relative; background:#f8fafc; }
        .wm-canvas-scroll { overflow:auto; width:100%; min-height:700px; }
        .wm-canvas-loading { height:700px; display:grid; place-items:center; color:var(--sp-text3); font-size:14px; background:#f8fafc; }
        .wm-zoom-controls { position:absolute; right:14px; top:14px; z-index:10; display:flex; gap:6px; }
        .wm-zoom-controls button { min-width:34px; height:34px; padding:0 10px; border:1px solid var(--sp-border); border-radius:8px; background:rgba(255,255,255,.94); color:var(--sp-navy); font:700 14px 'Sarabun',sans-serif; cursor:pointer; box-shadow:0 3px 10px rgba(14,48,96,.12); }
        .wm-zoom-controls button:hover { border-color:var(--sp-blue-md); background:#fff; }
        .wm-zoom-controls .wm-reset-view { font-size:11px; }
        .wm-help { display:flex; align-items:flex-start; gap:8px; margin:12px 3px 0; color:var(--sp-text3); font-size:11.5px; line-height:1.65; }
        .wm-help strong { color:var(--sp-text2); }
        .wm-location-fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .wm-storage-config { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; padding:12px; margin-bottom:15px; border:1px solid var(--sp-border); border-radius:10px; background:var(--sp-bg); }
        .wm-storage-config .wm-modal-field { margin-bottom:0; }
        .wm-config-note { grid-column:1 / -1; color:var(--sp-text3); font-size:10.5px; line-height:1.5; }
        .wm-modal-field { margin-bottom:15px; }
        .wm-color-list { display:flex; flex-wrap:wrap; gap:8px; }
        .wm-color-option { width:34px; height:34px; border-radius:50%; border:3px solid #fff; cursor:pointer; box-shadow:0 0 0 1px var(--sp-border); transition:transform .15s; }
        .wm-color-option:hover { transform:scale(1.08); }
        .wm-color-option.active { box-shadow:0 0 0 2px var(--sp-navy); }
        .wm-color-custom { width:100%; height:38px; margin-top:10px; padding:3px; border:1px solid var(--sp-border); border-radius:8px; background:#fff; cursor:pointer; }
        .wm-modal-actions { display:flex; gap:9px; margin-top:20px; }
        .wm-modal-actions .wh-btn { flex:1; }
        .wm-notice { position:fixed; right:20px; top:78px; z-index:450; padding:11px 15px; border-left:4px solid #22c55e; border-radius:10px; background:#f0fdf4; color:#0e7c3a; font-size:13px; font-weight:700; box-shadow:0 8px 24px rgba(8,20,48,.18); animation:toastIn .25s ease; }
        .wm-file-input { display:none; }
        @media (max-width:1000px) { .wm-workspace { grid-template-columns:1fr; } .wm-zone-list { max-height:180px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:700px) { .wm-summary { grid-template-columns:1fr; } .wm-zone-list { grid-template-columns:1fr; } .wm-map-toolbar { align-items:flex-start; flex-direction:column; } .wm-autosave { margin-left:4px; } .wm-actions { width:100%; } .wm-actions .wh-btn { flex:1; } .wm-location-fields,.wm-storage-config { grid-template-columns:1fr; gap:8px; } .wm-config-note { grid-column:auto; } }
      `}</style>

      <div className="wm-header">
        <div className="wh-page-header">
          <h1 className="wh-page-title">ผังคลังสินค้า</h1>
          <p className="wh-page-sub">ออกแบบตำแหน่งโซนและพื้นที่ใช้งานภายในคลัง</p>
        </div>

        <div className="wm-actions">
          <input
            ref={importInputRef}
            className="wm-file-input"
            type="file"
            accept="application/json,.json"
            onChange={importLayout}
          />
          <button type="button" className="wh-btn wh-btn-gold" onClick={() => void applyReferencePlan()} disabled={!hydrated || saving}>
            <Icon><path d="M3 6h18M3 18h18M6 3v18M18 3v18"/><path d="M10 10h4v4h-4z"/></Icon>
            จัดตามแปลน 24×25 ม.
          </button>
          <button type="button" className="wh-btn wh-btn-ghost" onClick={() => importInputRef.current?.click()}>
            <Icon><path d="M12 3v12m0-12-4 4m4-4 4 4"/><path d="M5 14v5h14v-5"/></Icon>
            นำเข้า
          </button>
          <button type="button" className="wh-btn wh-btn-ghost" onClick={exportLayout} disabled={!hydrated}>
            <Icon><path d="M12 15V3m0 12-4-4m4 4 4-4"/><path d="M5 14v5h14v-5"/></Icon>
            ส่งออก
          </button>
          <button type="button" className="wh-btn wh-btn-primary" onClick={openCreateModal}>
            <Icon><path d="M12 5v14M5 12h14"/></Icon>
            เพิ่มโซน
          </button>
        </div>
      </div>

      <section className="wm-summary" aria-label="สรุปผังคลัง">
        <div className="wm-summary-card">
          <span className="wm-summary-label">จำนวนโซนทั้งหมด</span>
          <span className="wm-summary-value">{zones.length}</span>
        </div>
        <div className="wm-summary-card">
          <span className="wm-summary-label">กำลังเลือก</span>
          <span className="wm-summary-value">{selectedIds.length}</span>
          <span className="wm-summary-note"> โซน</span>
        </div>
        <div className="wm-summary-card">
          <span className="wm-summary-label">จำนวน Rack ทั้งหมด</span>
          <span className="wm-summary-value">{totalRackCount}</span>
        </div>
        <div className="wm-summary-card">
          <span className="wm-summary-label">การบันทึก</span>
          <span className="wm-summary-value" style={{ fontSize: 15 }}>
            {syncMode === 'supabase' ? 'Supabase' : syncMode === 'browser' ? 'ชั่วคราว' : 'กำลังเชื่อมต่อ'}
          </span>
          <span className="wm-summary-note">
            {syncMode === 'supabase' ? ' · ทุกเครื่อง' : syncMode === 'browser' ? ' · เบราว์เซอร์นี้' : ''}
          </span>
        </div>
      </section>

      <div className="wm-workspace">
        <aside className="wm-sidebar">
          <div className="wm-sidebar-head">
            <h2 className="wm-sidebar-title">รายการโซน</h2>
            <button type="button" className="wh-btn wh-btn-ghost" onClick={resetToSample} style={{ padding: '5px 9px', fontSize: 11 }}>
              ผังตัวอย่าง
            </button>
          </div>
          <div className="wm-zone-list">
            {zones.length === 0 ? (
              <div className="wm-empty-list">ยังไม่มีโซน<br />กด “เพิ่มโซน” เพื่อเริ่มวางผัง</div>
            ) : (
              zones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  className={`wm-zone-item${selectedIds.includes(zone.id) ? ' active' : ''}`}
                  onClick={(event) => {
                    if (event.shiftKey) {
                      setSelectedIds((current) =>
                        current.includes(zone.id)
                          ? current.filter((id) => id !== zone.id)
                          : [...current, zone.id],
                      );
                    } else {
                      setSelectedIds([zone.id]);
                    }
                  }}
                  onDoubleClick={() => openEditModal(zone.id)}
                >
                  <span className="wm-zone-color" style={{ backgroundColor: zone.color }} />
                  <span className="wm-zone-copy">
                    <span className="wm-zone-name">{zone.name}</span>
                    <span className="wm-zone-size">
                      {zone.locationCode} · {rackCounts[zone.id] ?? 0} Rack · {zone.rackLevels ?? 4} ชั้น × {zone.palletsPerLevel ?? 2} พาเลต
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="wm-map-card">
          <div className="wm-map-toolbar">
            <div className="wm-map-toolbar-left">
              <span className="wm-selection-pill">
                {selectedIds.length > 0 ? `เลือกแล้ว ${selectedIds.length} โซน` : 'ยังไม่ได้เลือกโซน'}
              </span>
              {selectedIds.length === 1 && (
                <button type="button" className="wh-btn wh-btn-ghost" onClick={() => openEditModal(selectedIds[0])}>
                  <Icon><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/></Icon>
                  แก้ไข
                </button>
              )}
              {selectedZone && (
                <div className="wm-rack-control" title="เพิ่มหรือลด Rack ในโซนที่เลือก">
                  <span>Rack {selectedRackCount}</span>
                  <button
                    type="button"
                    onClick={() => void removeRackFromSelectedZone()}
                    disabled={rackSaving || syncMode !== 'supabase' || selectedRackCount <= 1}
                    aria-label={`ลด Rack ในช่อง ${selectedZone.locationCode}`}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => void addRackToSelectedZone()}
                    disabled={rackSaving || syncMode !== 'supabase' || selectedRackCount >= 20}
                    aria-label={`เพิ่ม Rack ในช่อง ${selectedZone.locationCode}`}
                  >
                    +
                  </button>
                </div>
              )}
              {selectedIds.length > 0 && (
                <button type="button" className="wh-btn wh-btn-danger" onClick={() => void deleteSelected()} disabled={saving}>
                  <Icon><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/></Icon>
                  ลบที่เลือก
                </button>
              )}
            </div>
            <span className="wm-autosave">
              {saving
                ? 'กำลังซิงก์...'
                : syncMode === 'supabase'
                  ? 'ซิงก์กับ Supabase'
                  : 'บันทึกในเบราว์เซอร์'}
            </span>
          </div>

          {hydrated ? (
            <WarehouseMapCanvas
              zones={zones}
              selectedIds={selectedIds}
              slotCounts={rackCounts}
              onSelectIds={setSelectedIds}
              onDragEnd={updateZonePosition}
              onBulkDragEnd={updateZonesBulk}
              onResize={updateZoneSize}
              onEdit={openEditModal}
            />
          ) : (
            <div className="wm-canvas-loading">กำลังโหลดผังคลัง...</div>
          )}
        </section>
      </div>

      <p className="wm-help">
        <Icon><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></Icon>
        <span>
          <strong>วิธีใช้:</strong> คลิกและลากโซนเพื่อย้าย · ดับเบิลคลิกเพื่อแก้ไข · Shift+คลิกหรือลากครอบเพื่อเลือกหลายโซน · ลูกกลิ้งเมาส์ใช้ซูม
          <br />
          เลือก 1 โซนแล้วใช้ปุ่ม − / + เพื่อปรับจำนวน Rack (ระบบจะไม่ยอมลบ Rack ที่มีสินค้า) · คีย์ลัด: Delete = ลบ · Ctrl+A = เลือกทั้งหมด · Esc = ยกเลิกการเลือก
        </span>
      </p>

      {modalOpen && (
        <div className="wh-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <div className="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wm-modal-title">
            <div className="wh-modal-title" id="wm-modal-title">
              {editingZone ? 'แก้ไขโซน' : 'เพิ่มโซนใหม่'}
              <button type="button" className="wh-modal-close" onClick={closeModal} aria-label="ปิด">×</button>
            </div>

            <div className="wm-modal-field">
              <label className="wh-label" htmlFor="wm-zone-name">ชื่อโซน</label>
              <input
                id="wm-zone-name"
                className="wh-input"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') saveZone(); }}
                placeholder="เช่น โซน A, จุดรับเข้า"
                autoFocus
              />
            </div>

            <div className="wm-location-fields">
              <div className="wm-modal-field">
                <label className="wh-label" htmlFor="wm-location-code">รหัสตำแหน่ง</label>
                <input
                  id="wm-location-code"
                  className="wh-input"
                  value={formLocationCode}
                  onChange={(event) => setFormLocationCode(event.target.value)}
                  placeholder="เช่น A5"
                />
              </div>
              <div className="wm-modal-field">
                <label className="wh-label" htmlFor="wm-floor">คำอธิบายตำแหน่ง</label>
                <input
                  id="wm-floor"
                  className="wh-input"
                  value={formFloor}
                  onChange={(event) => setFormFloor(event.target.value)}
                  placeholder="เช่น 4 ชั้น, แนวผนัง, ฝั่งซ้าย"
                />
              </div>
            </div>

            <div className="wm-storage-config">
              <div className="wm-modal-field">
                <label className="wh-label" htmlFor="wm-rack-levels">จำนวนชั้น / Rack</label>
                <input
                  id="wm-rack-levels"
                  className="wh-input"
                  type="number"
                  min={1}
                  max={20}
                  value={formRackLevels}
                  onChange={(event) => setFormRackLevels(Number(event.target.value) || 1)}
                />
              </div>
              <div className="wm-modal-field">
                <label className="wh-label" htmlFor="wm-pallets-level">พาเลต / ชั้น</label>
                <input
                  id="wm-pallets-level"
                  className="wh-input"
                  type="number"
                  min={1}
                  max={10}
                  value={formPalletsPerLevel}
                  onChange={(event) => setFormPalletsPerLevel(Number(event.target.value) || 1)}
                />
              </div>
              <div className="wm-modal-field">
                <label className="wh-label" htmlFor="wm-initial-racks">จำนวน Rack เริ่มต้น</label>
                <input
                  id="wm-initial-racks"
                  className="wh-input"
                  type="number"
                  min={1}
                  max={20}
                  value={formInitialRackCount}
                  onChange={(event) => setFormInitialRackCount(Number(event.target.value) || 1)}
                  disabled={Boolean(editingZone)}
                />
              </div>
              <div className="wm-config-note">
                รวม {formRackLevels * formPalletsPerLevel} ช่องต่อ Rack
                {editingZone ? ' · การแก้จำนวนชั้นมีผลกับ Rack ที่เพิ่มใหม่ ส่วน Rack เดิมและสินค้าจะไม่ถูกลบ' : ''}
              </div>
            </div>

            <div className="wm-modal-field">
              <span className="wh-label">สีประจำโซน</span>
              <div className="wm-color-list">
                {WAREHOUSE_ZONE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`wm-color-option${formColor === color ? ' active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                    aria-label={`เลือกสี ${color}`}
                  />
                ))}
              </div>
              <input
                className="wm-color-custom"
                type="color"
                value={formColor}
                onChange={(event) => setFormColor(event.target.value)}
                aria-label="เลือกสีอื่น"
              />
            </div>

            <div className="wm-modal-actions">
              <button type="button" className="wh-btn wh-btn-ghost" onClick={closeModal}>ยกเลิก</button>
              <button
                type="button"
                className="wh-btn wh-btn-primary"
                onClick={() => void saveZone()}
                disabled={saving || !formName.trim() || !formLocationCode.trim() || !formFloor.trim()}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกโซน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="wm-notice">{notice}</div>}
    </div>
  );
}
