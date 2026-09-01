'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { WarehouseBin, WarehouseRack, WarehouseZone } from '../warehouse-map/types';
import {
  formatWarehousePlacement,
  getRackBins,
  getZoneRacks,
} from '../warehouse-map/warehousePlacement';

const WarehouseMapCanvas = dynamic(() => import('../warehouse-map/WarehouseMapCanvas'), {
  ssr: false,
  loading: () => <div className="wlp-loading">กำลังเปิดแผนผัง...</div>,
});

export interface WarehouseLocationSelection {
  warehouseZoneId: string;
  warehouseRackId: string;
  warehouseBinId: string;
}

interface WarehouseLocationPickerProps {
  open: boolean;
  zones: WarehouseZone[];
  racks: WarehouseRack[];
  bins: WarehouseBin[];
  initialValue: WarehouseLocationSelection;
  onClose: () => void;
  onConfirm: (selection: WarehouseLocationSelection) => void;
}

export default function WarehouseLocationPicker({
  open,
  zones,
  racks,
  bins,
  initialValue,
  onClose,
  onConfirm,
}: WarehouseLocationPickerProps) {
  const [zoneId, setZoneId] = useState('');
  const [rackId, setRackId] = useState('');
  const [binId, setBinId] = useState('');

  useEffect(() => {
    if (!open) return;
    setZoneId(initialValue.warehouseZoneId);
    setRackId(initialValue.warehouseRackId);
    setBinId(initialValue.warehouseBinId);
  }, [initialValue.warehouseBinId, initialValue.warehouseRackId, initialValue.warehouseZoneId, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const selectedZone = zones.find((zone) => zone.id === zoneId);
  const selectedRack = racks.find((rack) => rack.id === rackId);
  const selectedBin = bins.find((bin) => bin.id === binId);
  const zoneRacks = getZoneRacks(racks, zoneId);
  const rackBins = getRackBins(bins, rackId);
  const isComplete = Boolean(selectedZone && selectedRack && selectedBin);

  const slotCounts = useMemo(() => racks.reduce<Record<string, number>>((counts, rack) => {
    counts[rack.zoneId] = Math.max(counts[rack.zoneId] ?? 0, rack.rackNumber);
    return counts;
  }, {}), [racks]);

  const selectZone = (nextZoneId: string) => {
    setZoneId(nextZoneId);
    setRackId('');
    setBinId('');
  };

  const selectRack = (nextRack: WarehouseRack) => {
    setZoneId(nextRack.zoneId);
    setRackId(nextRack.id);
    setBinId('');
  };

  if (!open) return null;

  return (
    <div
      className="wh-modal-overlay wlp-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="wlp-dialog" role="dialog" aria-modal="true" aria-labelledby="warehouse-location-picker-title">
        <header className="wlp-header">
          <div>
            <div className="wlp-eyebrow">WAREHOUSE MAP</div>
            <h2 id="warehouse-location-picker-title">เลือกตำแหน่งเก็บสินค้าจากผัง</h2>
            <p>กดช่องบนผังเพื่อเลือก Rack แล้วเลือกชั้นวางทางด้านขวา</p>
          </div>
          <button type="button" className="wh-modal-close" onClick={onClose} aria-label="ปิดหน้าต่างเลือกตำแหน่ง">✕</button>
        </header>

        <div className="wlp-steps" aria-label="ขั้นตอนเลือกตำแหน่ง">
          <span className={selectedZone ? 'done' : 'active'}><b>1</b> โซน</span>
          <span className={selectedRack ? 'done' : selectedZone ? 'active' : ''}><b>2</b> Rack</span>
          <span className={selectedBin ? 'done' : selectedRack ? 'active' : ''}><b>3</b> ชั้น</span>
        </div>

        <div className="wlp-content">
          <section className="wlp-map-shell" aria-label="แผนผังคลังสินค้า">
            {zones.length > 0 ? (
              <WarehouseMapCanvas
                zones={zones}
                selectedIds={[]}
                highlightedIds={selectedZone ? [selectedZone.id] : []}
                highlightedSlots={selectedZone && selectedRack ? { [selectedZone.id]: selectedRack.rackNumber } : {}}
                slotCounts={slotCounts}
                dimUnhighlighted={Boolean(selectedZone)}
                readOnly
                onSelectIds={() => undefined}
                onDragEnd={() => undefined}
                onBulkDragEnd={() => undefined}
                onResize={() => undefined}
                onEdit={() => undefined}
                onZoneClick={selectZone}
                onSlotHover={() => undefined}
                onSlotClick={({ zoneId: clickedZoneId, slotNumber }) => {
                  const clickedRack = racks.find((rack) => (
                    rack.zoneId === clickedZoneId && rack.rackNumber === slotNumber
                  ));
                  if (clickedRack) selectRack(clickedRack);
                  else selectZone(clickedZoneId);
                }}
              />
            ) : (
              <div className="wlp-empty">
                <div className="wlp-empty-icon">⌁</div>
                <strong>ยังโหลดแผนผังจาก Supabase ไม่ได้</strong>
                <span>รัน SQL โหมดไม่ล็อกอิน แล้วรีเฟรชหน้านี้อีกครั้ง</span>
              </div>
            )}
          </section>

          <aside className="wlp-panel">
            <section>
              <div className="wlp-section-title"><span>1</span> โซนที่เลือก</div>
              {selectedZone ? (
                <button type="button" className="wlp-selected-zone" onClick={() => selectZone(selectedZone.id)}>
                  <i style={{ background: selectedZone.color }} />
                  <span><b>ช่อง {selectedZone.locationCode}</b><small>{selectedZone.name}</small></span>
                </button>
              ) : (
                <div className="wlp-hint">เลือกช่องสีบนแผนผัง</div>
              )}
            </section>

            <section>
              <div className="wlp-section-title"><span>2</span> เลือก Rack</div>
              {selectedZone ? (
                zoneRacks.length > 0 ? (
                  <div className="wlp-option-grid">
                    {zoneRacks.map((rack) => (
                      <button
                        type="button"
                        key={rack.id}
                        className={rack.id === rackId ? 'selected' : ''}
                        onClick={() => selectRack(rack)}
                      >
                        Rack {rack.rackNumber}
                      </button>
                    ))}
                  </div>
                ) : <div className="wlp-hint warning">โซนนี้ยังไม่มี Rack ใน Supabase</div>
              ) : <div className="wlp-hint">เลือกโซนก่อน</div>}
            </section>

            <section>
              <div className="wlp-section-title"><span>3</span> เลือกชั้นวาง</div>
              {selectedRack ? (
                rackBins.length > 0 ? (
                  <div className="wlp-option-grid shelves">
                    {rackBins.map((bin) => (
                      <button
                        type="button"
                        key={bin.id}
                        className={bin.id === binId ? 'selected' : ''}
                        onClick={() => setBinId(bin.id)}
                      >
                        ชั้น {bin.shelfLevel}
                      </button>
                    ))}
                  </div>
                ) : <div className="wlp-hint warning">Rack นี้ยังไม่ได้กำหนดชั้น</div>
              ) : <div className="wlp-hint">เลือก Rack ก่อน</div>}
            </section>

            <div className={`wlp-summary${isComplete ? ' complete' : ''}`}>
              <small>ตำแหน่งที่จะบันทึก</small>
              <strong>{formatWarehousePlacement(selectedZone, selectedRack, selectedBin) || 'ยังเลือกไม่ครบ'}</strong>
            </div>

            <div className="wlp-actions">
              <button type="button" className="wh-btn wh-btn-ghost" onClick={onClose}>ยกเลิก</button>
              <button
                type="button"
                className="wh-btn wh-btn-gold"
                disabled={!isComplete}
                onClick={() => onConfirm({
                  warehouseZoneId: selectedZone?.id ?? '',
                  warehouseRackId: selectedRack?.id ?? '',
                  warehouseBinId: selectedBin?.id ?? '',
                })}
              >
                ยืนยันตำแหน่ง
              </button>
            </div>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .wlp-overlay { z-index: 1400; padding: 18px; }
        .wlp-dialog { width: min(1180px, 97vw); max-height: 94vh; overflow: auto; background: #fffdf8; border: 1px solid #d7e1ef; border-radius: 18px; box-shadow: 0 24px 80px rgba(14,48,96,.24); }
        .wlp-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding:20px 22px 14px; border-bottom:1px solid #e3eaf3; background:linear-gradient(120deg,#f8fbff,#fff8e8); }
        .wlp-header h2 { margin:2px 0 3px; color:var(--sp-navy); font-size:21px; }
        .wlp-header p { margin:0; color:var(--sp-text3); font-size:13px; }
        .wlp-eyebrow { color:#b7830a; font-size:10px; font-weight:900; letter-spacing:1.2px; }
        .wlp-steps { display:flex; gap:8px; padding:11px 22px; border-bottom:1px solid #e3eaf3; background:#fff; }
        .wlp-steps span { display:flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:#edf2f7; color:#718096; font-size:12px; font-weight:800; }
        .wlp-steps b { display:grid; place-items:center; width:19px; height:19px; border-radius:50%; background:#cbd5e1; color:#fff; font-size:10px; }
        .wlp-steps .active { background:#fff4cb; color:#7b5a09; }
        .wlp-steps .active b { background:#d5a41b; }
        .wlp-steps .done { background:#e3f5eb; color:#176b3a; }
        .wlp-steps .done b { background:#27905a; }
        .wlp-content { display:grid; grid-template-columns:minmax(0,1fr) 310px; min-height:535px; }
        .wlp-map-shell { min-width:0; height:535px; padding:12px; overflow:hidden; background-color:#f7faff; background-image:linear-gradient(#dfe8f4 1px,transparent 1px),linear-gradient(90deg,#dfe8f4 1px,transparent 1px); background-size:20px 20px; border-right:1px solid #dce5f0; }
        .wlp-map-shell :global(.wm-canvas-shell) { position:relative; width:100%; height:100%; min-height:0; background:transparent; }
        .wlp-map-shell :global(.wm-canvas-scroll) { width:100%; height:100%; min-height:0; overflow:hidden; }
        .wlp-map-shell :global(.wm-zoom-controls) { position:absolute; top:8px; right:8px !important; z-index:10; display:flex; gap:5px; }
        .wlp-map-shell :global(.wm-zoom-controls button) { min-width:30px; height:30px; padding:0 8px; border:1px solid #c9d5e4; border-radius:7px; background:rgba(255,255,255,.95); color:var(--sp-navy); font:700 13px 'Sarabun',sans-serif; cursor:pointer; box-shadow:0 3px 10px rgba(14,48,96,.12); }
        .wlp-map-shell :global(.wm-zoom-controls .wm-reset-view) { font-size:10px; }
        .wlp-panel { display:flex; flex-direction:column; gap:15px; padding:17px; background:#fff; overflow:auto; }
        .wlp-section-title { display:flex; align-items:center; gap:7px; margin-bottom:8px; color:var(--sp-navy); font-size:12px; font-weight:900; }
        .wlp-section-title span { display:grid; place-items:center; width:20px; height:20px; border-radius:6px; color:#fff; background:var(--sp-blue-md); font-size:10px; }
        .wlp-selected-zone { width:100%; display:flex; align-items:center; gap:9px; padding:10px; text-align:left; border:1px solid #c9d7e8; border-radius:10px; background:#f8fbff; color:var(--sp-navy); }
        .wlp-selected-zone i { width:8px; height:38px; border-radius:6px; flex:0 0 auto; }
        .wlp-selected-zone span { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .wlp-selected-zone b { font-size:13px; }
        .wlp-selected-zone small { color:var(--sp-text3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wlp-option-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        .wlp-option-grid.shelves { grid-template-columns:repeat(2,1fr); }
        .wlp-option-grid button { padding:8px 4px; border:1px solid #d6e0ec; border-radius:8px; color:#4b5f78; background:#fff; font-size:12px; font-weight:800; cursor:pointer; }
        .wlp-option-grid button:hover { border-color:#3777bd; background:#f1f7ff; }
        .wlp-option-grid button.selected { border-color:#d3a01c; background:#fff3bd; color:#694c05; box-shadow:inset 0 0 0 1px #d3a01c; }
        .wlp-hint { padding:10px; border:1px dashed #cad5e3; border-radius:9px; color:#8090a4; background:#f8fafc; font-size:12px; text-align:center; }
        .wlp-hint.warning { color:#946200; background:#fff8df; border-color:#e7ca6f; }
        .wlp-summary { margin-top:auto; padding:11px; border:1px solid #d7e0eb; border-radius:10px; background:#f8fafc; }
        .wlp-summary small { display:block; color:var(--sp-text3); font-size:10px; margin-bottom:3px; }
        .wlp-summary strong { color:#6f7f91; font-size:13px; }
        .wlp-summary.complete { border-color:#8fd0ab; background:#edf9f2; }
        .wlp-summary.complete strong { color:#176b3a; }
        .wlp-actions { display:grid; grid-template-columns:1fr 1.45fr; gap:8px; }
        .wlp-empty,.wlp-loading { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; text-align:center; color:var(--sp-text3); }
        .wlp-empty strong { color:var(--sp-navy); }
        .wlp-empty span { font-size:12px; }
        .wlp-empty-icon { display:grid; place-items:center; width:54px; height:54px; border-radius:50%; background:#eaf1fb; color:var(--sp-blue-md); font-size:30px; }
        @media (max-width: 850px) {
          .wlp-content { grid-template-columns:1fr; }
          .wlp-map-shell { height:420px; border-right:0; border-bottom:1px solid #dce5f0; }
          .wlp-panel { overflow:visible; }
        }
        @media (max-width: 520px) {
          .wlp-overlay { padding:6px; }
          .wlp-header { padding:15px; }
          .wlp-header h2 { font-size:17px; }
          .wlp-header p { display:none; }
          .wlp-steps { padding:8px 12px; }
          .wlp-map-shell { height:330px; padding:6px; }
        }
      `}</style>
    </div>
  );
}
