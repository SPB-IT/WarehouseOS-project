'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import type { Deposit, DepositItem } from '../../../types/warehouse';
import { Toast, useToast } from '../components/Toast';

type WithdrawRow = DepositItem & { deposit_info: Deposit };

export default function ReturnItemForm() {
  return (
    <Suspense fallback={<div className="wh-page" style={{ padding: 40, textAlign: 'center', color: 'var(--sp-text3)' }}>กำลังโหลด...</div>}>
      <ReturnItemFormInner />
    </Suspense>
  );
}

function ReturnItemFormInner() {
  const searchParams = useSearchParams();
  const [trackingId, setTrackingId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [allDeposits, setAllDeposits] = useState<Deposit[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<number, WithdrawRow>>({});
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [showModal, setShowModal] = useState(false);
  const { toasts, removeToast, toast } = useToast();

  // จัดการ State สำหรับระบบเรียงลำดับ ข้อมูลจำนวนแถว และหน้าปัจจุบัน (Pagination)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const loadInventoryItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deposits').select('*, deposit_items(*)')
      .order('id', { ascending: sortBy === 'oldest' });
    if (!error && data) setAllDeposits(data as Deposit[]);
    setLoading(false);
  };

  useEffect(() => { loadInventoryItems(); }, [sortBy]);

  // ถ้าเข้ามาจากหน้าสรุปสินค้า (inventory) พร้อม query ?q=... ให้เติมช่องค้นหาให้อัตโนมัติ
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setTrackingId(q);
  }, [searchParams]);

  // เมื่อไหร่ที่มีการเปลี่ยนขนาดหน้า (PageSize) ให้รีเซ็ตกลับไปหน้า 1 ป้องกันหน้าเอ๋อ
  useEffect(() => { setCurrentPage(1); }, [pageSize]);

  const handleFetchData = async () => {
    if (!trackingId) { toast('กรุณากรอก หรือสแกน Tracking ID', 'info'); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('deposits').select('*, deposit_items(*)')
      .eq('tracking_id', trackingId.trim()).maybeSingle();
    if (error) toast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    else if (!data) toast('ไม่พบข้อมูล Tracking ID นี้ในระบบ', 'error');
    else {
      const active = data.deposit_items?.filter((i: DepositItem) => i.remaining_quantity > 0) || [];
      if (active.length === 0) toast('พัสดุใน Tracking ID นี้ได้คืนครบหมดแล้ว', 'info');
      else await loadInventoryItems();
    }
    setLoading(false);
  };

  const handleToggle = (row: WithdrawRow) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[row.id]) {
        delete next[row.id];
        setReturnQuantities(q => { const nq = { ...q }; delete nq[row.id]; return nq; });
      } else {
        next[row.id] = row;
        setReturnQuantities(q => ({ ...q, [row.id]: row.remaining_quantity }));
      }
      return next;
    });
  };

  const handleReturnConfirm = async () => {
    const itemsToReturn = Object.values(selectedItems);
    if (itemsToReturn.length === 0) return;
    if (!itemsToReturn.some(item => (returnQuantities[item.id] || 0) > 0)) {
      toast('กรุณาระบุจำนวนสินค้าที่ต้องการส่งคืน', 'info'); return;
    }
    if (!staffName) { toast('กรุณากรอกชื่อพนักงานผู้คืนของ', 'info'); return; }
    setLoading(true);
    try {
      const createdWithdrawIds: number[] = [];
      await Promise.all(itemsToReturn.map(async item => {
        const qty = returnQuantities[item.id] || 0;
        if (qty <= 0) return;
        const { data: logData, error: logErr } = await supabase.from('withdrawals')
          .insert([{ deposit_item_id: item.id, withdraw_quantity: qty, staff_signature_name: staffName, remark: remark || 'คืนสินค้าเรียบร้อยแล้ว', status: 'completed' }])
          .select().single();
        if (logErr) throw new Error(`บันทึกประวัติล้มเหลว: ${logErr.message}`);
        if (logData) createdWithdrawIds.push(logData.id);
        const newRem = item.remaining_quantity - qty;
        const { error: itemErr } = await supabase.from('deposit_items')
          .update({ remaining_quantity: Math.max(0, newRem), status: newRem <= 0 ? 'คืนแล้ว' : 'กำลังฝาก' })
          .eq('id', item.id);
        if (itemErr) throw new Error(`อัปเดตสต็อกล้มเหลว: ${itemErr.message}`);
      }));
      if (createdWithdrawIds.length > 0) {
        const w = 800, h = 900;
        window.open(`/print-withdraw/${createdWithdrawIds.join(',')}`, 'PrintPopup-Bulk', `width=${w},height=${h},top=${window.screen.height/2-h/2},left=${window.screen.width/2-w/2},scrollbars=yes,status=no,toolbar=no,menubar=no`);
      }
      toast('บันทึกการส่งคืนสำเร็จ!', 'success');
      setShowModal(false); setSelectedItems({}); setReturnQuantities({});
      setStaffName(''); setRemark('');
      await loadInventoryItems();
    } catch (err: unknown) {
      toast('เกิดข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'), 'error');
    } finally { setLoading(false); }
  };

  // Build rows คัดเฉพาะของที่รอคืน (remaining_quantity > 0)
  const inventoryRows: WithdrawRow[] = [];
  allDeposits.forEach(deposit => {
    deposit.deposit_items?.forEach((item: DepositItem) => {
      if (item.remaining_quantity > 0) inventoryRows.push({ ...item, deposit_info: deposit });
    });
  });

  const s = trackingId.toLowerCase();
  const filteredRows = inventoryRows.filter(row =>
    !s ||
    row.deposit_info.tracking_id?.toLowerCase().includes(s) ||
    row.deposit_info.customer_name?.toLowerCase().includes(s) ||
    row.deposit_info.customer_phone?.toLowerCase().includes(s) ||
    row.item_name?.toLowerCase().includes(s) ||
    row.item_code?.toLowerCase().includes(s)
  );

  // คำนวณข้อมูลสำหรับ Pagination แยกตามหน้าจริง
  const totalItems = filteredRows.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const displayedRows = filteredRows.slice(startIndex, startIndex + pageSize);
  
  const selectedCount = Object.keys(selectedItems).length;
  const totalReturnQty = Object.values(returnQuantities).reduce((a, b) => a + b, 0);

  return (
    <div className="wh-page">
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Header ตามรูปแบบรูปที่ 1 */}
      <div className="wh-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, width: '100%' }}>
        <div style={{ paddingLeft: 12, textAlign: 'left' }}>
          <h1 className="wh-page-title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0e3060', textAlign: 'left' }}>
            บันทึกการส่งคืนสินค้า
          </h1>
          <p className="wh-page-sub" style={{ fontSize: 13, color: '#888', margin: '4px 0 0 0', textAlign: 'left' }}>
            เลือกรายการที่ต้องการคืน หรือค้นหาด้วย Tracking ID / ชื่อผู้ฝาก
          </p>
        </div>
        {selectedCount > 0 && (
          <button type="button" onClick={() => setShowModal(true)} className="wh-btn wh-btn-gold"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 8, fontWeight: 600, flexShrink: 0 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
            </svg>
            คืนสินค้าที่เลือก ({selectedCount} รายการ)
          </button>
        )}
      </div>

      {/* Control Panel / Search bar (เอาปุ่มสถานะในรูปที่ 2 ออกแล้ว) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        
        {/* ช่องค้นหา */}
        <div className="wh-search-wrap" style={{ flex: '1 1 260px', minWidth: 240, position: 'relative' }}>
          <svg className="wh-search-icon" width="16" height="16" fill="none" stroke="#999" strokeWidth="2" viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" className="wh-search-input"
            placeholder="ค้นหาชื่อผู้ฝาก, เบอร์, Tracking ID..."
            value={trackingId} onChange={e => setTrackingId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleFetchData(); }}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 8, border: '1px solid #d9e2ec', background: '#f0f4f8', outline: 'none', fontSize: 14 }}
          />
          {trackingId && (
            <button
              type="button"
              className="wh-search-clear"
              onClick={() => { setTrackingId(''); setSelectedItems({}); setReturnQuantities({}); }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}
            >✕</button>
          )}
        </div>

        {/* ตัวเลือกจัดเรียงลำดับข้อมูล */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9e2ec', background: '#f0f4f8', fontSize: 13, color: '#334e68', cursor: 'pointer', outline: 'none' }}
        >
          <option value="newest">เรียงตาม: วันใหม่สุด</option>
          <option value="oldest">เรียงตาม: วันเก่าสุด</option>
        </select>

        {/* ตัวเลือกจำนวนรายการที่แสดงผลต่อหน้า */}
        <select
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value))}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9e2ec', background: '#f0f4f8', fontSize: 13, color: '#334e68', cursor: 'pointer', outline: 'none' }}
        >
          <option value={10}>แสดง 10 รายการ</option>
          <option value={20}>แสดง 20 รายการ</option>
          <option value={50}>แสดง 50 รายการ</option>
        </select>

        {/* ปุ่มรีเฟรชข้อมูล */}
        <button
          type="button"
          onClick={loadInventoryItems}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8,
            border: '1px solid #d9e2ec', background: '#fff', fontSize: 13, color: '#334e68', fontWeight: 500, cursor: 'pointer', height: 38
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          รีเฟรช
        </button>
      </div>

      {/* Confirm Modal (คงเดิม) */}
      {showModal && selectedCount > 0 && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="wh-modal" style={{ maxWidth: 560 }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="var(--sp-gold)" strokeWidth="2.5" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                </svg>
                ยืนยันการคืนสินค้า
              </span>
              <button className="wh-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, background: '#deeafa', borderRadius: 9, padding: '10px 14px', textAlign: 'center', border: '1px solid #b3d0f0' }}>
                <div style={{ fontSize: 11, color: 'var(--sp-text3)', fontWeight: 700, letterSpacing: 0.5 }}>รายการที่เลือก</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--sp-blue)', lineHeight: 1.2 }}>{selectedCount}</div>
              </div>
              <div style={{ flex: 1, background: 'var(--sp-gold-bg)', borderRadius: 9, padding: '10px 14px', textAlign: 'center', border: '1px solid #f0d99a' }}>
                <div style={{ fontSize: 11, color: 'var(--sp-text3)', fontWeight: 700, letterSpacing: 0.5 }}>จำนวนรวม</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--sp-gold)', lineHeight: 1.2 }}>{totalReturnQty}</div>
              </div>
            </div>

            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {Object.values(selectedItems).map((item: any) => {
                const curQty = returnQuantities[item.id] || 0;
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--sp-bg)', border: '1px solid var(--sp-border)', borderLeft: '3px solid var(--sp-blue-md)', borderRadius: 10, padding: '10px 14px', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="wh-mono" style={{ fontSize: 11, background: '#deeafa', color: 'var(--sp-blue)', padding: '2px 8px', borderRadius: 5, fontWeight: 800, display: 'inline-block', marginBottom: 4 }}>
                        {item.deposit_info?.tracking_id}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--sp-text3)' }}>{item.deposit_info?.customer_name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button type="button"
                        onClick={() => setReturnQuantities(p => ({ ...p, [item.id]: Math.max(0, (p[item.id]||0) - 1) }))}
                        style={{ width: 28, height: 28, border: '1.5px solid var(--sp-border)', borderRadius: 7, background: 'var(--sp-white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--sp-text2)', fontSize: 16 }}>−</button>
                      <input
                        type="number" min={0} max={item.remaining_quantity} value={curQty}
                        onChange={e => setReturnQuantities(p => ({ ...p, [item.id]: Math.min(item.remaining_quantity, Math.max(0, parseInt(e.target.value) || 0)) }))}
                        style={{ width: 52, border: '1.5px solid var(--sp-border)', borderRadius: 7, padding: '4px 6px', fontSize: 14, fontWeight: 800, textAlign: 'center', fontFamily: 'inherit', outline: 'none', background: '#fff' }}
                      />
                      <button type="button"
                        onClick={() => setReturnQuantities(p => ({ ...p, [item.id]: Math.min(item.remaining_quantity, (p[item.id]||0) + 1) }))}
                        style={{ width: 28, height: 28, border: '1.5px solid var(--sp-border)', borderRadius: 7, background: 'var(--sp-white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--sp-blue)', fontSize: 16 }}>+</button>
                      <span style={{ fontSize: 11.5, color: 'var(--sp-text3)', whiteSpace: 'nowrap' }}>/{item.remaining_quantity} {item.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1.5px solid var(--sp-bg2)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="wh-label">ชื่อพนักงานผู้คืนของ <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" className="wh-input" placeholder="กรอกชื่อพนักงาน..." value={staffName} onChange={e => setStaffName(e.target.value)} />
              </div>
              <div>
                <label className="wh-label">หมายเหตุ (ถ้ามี)</label>
                <input type="text" className="wh-input" placeholder="ระบุรายละเอียดเพิ่มเติม..." value={remark} onChange={e => setRemark(e.target.value)} />
              </div>
            </div>

            <button type="button" disabled={loading} onClick={handleReturnConfirm} className="wh-btn wh-btn-success wh-btn-full wh-btn-lg" style={{ marginTop: '1.25rem' }}>
              {loading ? (
                <>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  ยืนยันคืนสินค้า {selectedCount} รายการ & พิมพ์บิล
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Table & Pagination Wrapper */}
      <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1.5px solid var(--sp-bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--sp-bg)' }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--sp-navy)' }}>
            สินค้าในคลัง (รอคืน) — ทั้งหมด {totalItems} รายการ
          </span>
          {selectedCount > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--sp-gold)', fontWeight: 800, background: 'var(--sp-gold-bg)', padding: '4px 12px', borderRadius: 99, border: '1px solid #f0d99a' }}>
              เลือกแล้ว {selectedCount} รายการ
            </span>
          )}
        </div>

        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>
                  <input
                    type="checkbox" style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#fff' }}
                    checked={selectedCount === displayedRows.length && displayedRows.length > 0}
                    onChange={e => {
                      if (e.target.checked) {
                        const next: Record<number, any> = {};
                        const qty: Record<number, number> = {};
                        displayedRows.forEach(r => { next[r.id] = r; qty[r.id] = r.remaining_quantity; });
                        setSelectedItems(next); setReturnQuantities(qty);
                      } else { setSelectedItems({}); setReturnQuantities({}); }
                    }}
                  />
                </th>
                <th style={{ width: 60, textAlign: 'center' }}>รูป</th>
                <th>Tracking ID</th>
                <th>ผู้ฝาก</th>
                <th>รายละเอียดของ</th>
                <th style={{ textAlign: 'center' }}>ตำแหน่งเก็บ</th>
                <th style={{ textAlign: 'center' }}>เลือก</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 ? (
                <tr><td colSpan={7} className="wh-empty-row">ไม่พบรายการสินค้าที่รอการคืน</td></tr>
              ) : displayedRows.map((row: WithdrawRow) => {
                const isSel = !!selectedItems[row.id];
                return (
                  <tr key={row.id} style={{ background: isSel ? '#eef3fb' : undefined, cursor: 'pointer' }}
                    onClick={() => handleToggle(row)}>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox" checked={isSel} onChange={() => handleToggle(row)}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--sp-blue)' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.item_image_url ? (
                        <img src={row.item_image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--sp-border)' }} />
                      ) : (
                        <div style={{ width: 44, height: 44, background: 'var(--sp-bg2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, color: 'var(--sp-text3)', border: '1.5px dashed var(--sp-border)', margin: '0 auto' }}>ไม่มีรูป</div>
                      )}
                    </td>
                    <td>
                      <span className="wh-mono" style={{ color: 'var(--sp-blue-md)', fontWeight: 800, fontSize: 12.5, background: '#deeafa', padding: '3px 8px', borderRadius: 6 }}>
                        {row.deposit_info.tracking_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{row.deposit_info.customer_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--sp-text3)', marginTop: 2 }}>{row.deposit_info.customer_phone || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--sp-text)' }}>{row.item_name}</div>
                      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ flex: 1, background: 'var(--sp-bg2)', borderRadius: 99, height: 5, overflow: 'hidden', maxWidth: 80 }}>
                          <div style={{ width: `${(row.remaining_quantity/row.quantity)*100}%`, height: '100%', background: 'linear-gradient(90deg,var(--sp-blue),var(--sp-blue-lt))', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-blue)', whiteSpace: 'nowrap' }}>
                          {row.remaining_quantity}/{row.quantity} {row.unit}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--sp-text2)', fontSize: 13 }}>{row.storage_location || '—'}</td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => handleToggle(row)} className="wh-btn" style={{
                        padding: '5px 13px', fontSize: 12.5, borderRadius: 8, fontWeight: 700,
                        background: isSel ? '#fef2f2' : '#dcfce7',
                        color: isSel ? 'var(--sp-danger)' : 'var(--sp-success)',
                        border: `1.5px solid ${isSel ? '#fecaca' : '#bbf7d0'}`,
                      }}>
                        {isSel ? '✕ ยกเลิก' : '✓ เลือก'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ส่วนแบ่งหน้า (Pagination) UI ที่เพิ่มเข้ามาใหม่ท้ายตาราง */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              แสดง {startIndex + 1} ถึง {Math.min(startIndex + pageSize, totalItems)} จากทั้งหมด {totalItems} รายการ
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', fontSize: 13, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#cbd5e1' : '#334155' }}
              >
                ก่อนหน้า
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pNum = idx + 1;
                const isCurrent = currentPage === pNum;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setCurrentPage(pNum)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                      border: isCurrent ? '1px solid #0e3060' : '1px solid #cbd5e1',
                      background: isCurrent ? '#0e3060' : '#fff',
                      color: isCurrent ? '#fff' : '#334155',
                      fontWeight: isCurrent ? 700 : 400
                    }}
                  >
                    {pNum}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', fontSize: 13, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: currentPage === totalPages ? '#cbd5e1' : '#334155' }}
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating action bar when items selected (คงเดิม) */}
      {selectedCount > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg,var(--sp-navy),var(--sp-blue-md))',
          color: '#fff', padding: '14px 28px', borderRadius: 99,
          boxShadow: '0 8px 28px rgba(14,48,96,0.40)',
          display: 'flex', alignItems: 'center', gap: 16,
          animation: 'slideInUp 0.22s ease',
          zIndex: 50,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>เลือก {selectedCount} รายการ ({totalReturnQty} หน่วย)</span>
          <button onClick={() => setShowModal(true)} className="wh-btn wh-btn-gold" style={{ padding: '8px 20px', fontSize: 13.5 }}>
            ดำเนินการคืน →
          </button>
          <button onClick={() => { setSelectedItems({}); setReturnQuantities({}); }}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600 }}>
            ล้างทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}