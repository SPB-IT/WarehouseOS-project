'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export default function ReturnItemForm() {
  const [trackingId, setTrackingId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [allDeposits, setAllDeposits] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<number, any>>({});
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [showModal, setShowModal] = useState(false);

  const loadInventoryItems = async () => {
    const { data, error } = await supabase
      .from('deposits')
      .select('*, deposit_items(*)')
      .order('id', { ascending: false });
    if (!error && data) setAllDeposits(data);
  };

  useEffect(() => { loadInventoryItems(); }, []);

  const handleFetchData = async () => {
    if (!trackingId) { alert('กรุณากรอก หรือสแกน Tracking ID'); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('deposits').select('*, deposit_items(*)')
      .eq('tracking_id', trackingId.trim()).maybeSingle();

    if (error) alert('เกิดข้อผิดพลาด: ' + error.message);
    else if (!data) alert('ไม่พบข้อมูล Tracking ID นี้ในระบบ');
    else {
      const activeItems = data.deposit_items?.filter((item: any) => item.remaining_quantity > 0) || [];
      if (activeItems.length === 0) alert('พัสดุใน Tracking ID นี้ได้ทำการคืนครบหมดแล้ว');
      else await loadInventoryItems();
    }
    setLoading(false);
  };

  const handleToggleSelectItem = (row: any) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[row.id]) {
        delete next[row.id];
        setReturnQuantities((q) => { const nq = { ...q }; delete nq[row.id]; return nq; });
      } else {
        next[row.id] = row;
        setReturnQuantities((q) => ({ ...q, [row.id]: row.remaining_quantity }));
      }
      return next;
    });
  };

  const handleReturnConfirm = async () => {
    const itemsToReturn = Object.values(selectedItems);
    if (itemsToReturn.length === 0) return;
    if (!itemsToReturn.some(item => (returnQuantities[item.id] || 0) > 0)) {
      alert('กรุณาระบุจำนวนสินค้าที่ต้องการส่งคืน'); return;
    }
    if (!staffName) { alert('กรุณากรอกชื่อพนักงานผู้คืนของ'); return; }
    setLoading(true);

    try {
      const createdWithdrawIds: number[] = [];
      await Promise.all(itemsToReturn.map(async (item) => {
        const withdrawQty = returnQuantities[item.id] || 0;
        if (withdrawQty <= 0) return;

        const { data: logData, error: logError } = await supabase
          .from('withdrawals')
          .insert([{ deposit_item_id: item.id, withdraw_quantity: withdrawQty, staff_signature_name: staffName, remark: remark || 'คืนสินค้าเรียบร้อยแล้ว', status: 'completed' }])
          .select().single();
        if (logError) throw new Error(`บันทึกประวัติล้มเหลว: ${logError.message}`);
        if (logData) createdWithdrawIds.push(logData.id);

        const newRemaining = item.remaining_quantity - withdrawQty;
        const { error: itemError } = await supabase
          .from('deposit_items')
          .update({ remaining_quantity: newRemaining >= 0 ? newRemaining : 0, status: newRemaining <= 0 ? 'คืนแล้ว' : 'กำลังฝาก' })
          .eq('id', item.id);
        if (itemError) throw new Error(`อัปเดตสต็อกล้มเหลว: ${itemError.message}`);
      }));

      if (createdWithdrawIds.length > 0) {
        const width = 800, height = 900;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(`/print-withdraw/${createdWithdrawIds.join(',')}`, 'PrintPopup-Bulk', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,toolbar=no,menubar=no`);
      }

      alert('บันทึกการส่งคืนสำเร็จ!');
      setShowModal(false); setSelectedItems({}); setReturnQuantities({});
      setStaffName(''); setRemark('');
      await loadInventoryItems();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const inventoryRows: any[] = [];
  allDeposits.forEach((deposit) => {
    deposit.deposit_items?.forEach((item: any) => {
      if (item.remaining_quantity > 0) inventoryRows.push({ ...item, deposit_info: deposit });
    });
  });

  const filteredRows = inventoryRows.filter((row) => {
    const s = trackingId.toLowerCase();
    return !s || row.deposit_info.tracking_id?.toLowerCase().includes(s)
      || row.deposit_info.customer_name?.toLowerCase().includes(s)
      || row.deposit_info.customer_phone?.toLowerCase().includes(s)
      || row.item_name?.toLowerCase().includes(s);
  });

  const selectedCount = Object.keys(selectedItems).length;

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <h1 className="wh-page-title">บันทึกการส่งคืนสินค้า</h1>
        <p className="wh-page-sub">เลือกรายการที่ต้องการคืนจากตารางด้านล่าง หรือค้นหาด้วย Tracking ID</p>
      </div>

      {/* Search bar */}
      <div className="wh-search-bar">
        <div className="wh-search-wrap" style={{ flex: 1 }}>
          <svg className="wh-search-icon" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="wh-search-input"
            placeholder="ค้นหาด้วยชื่อผู้ฝาก, เบอร์โทร, หรือ Tracking ID..."
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFetchData(); }}
          />
        </div>
        <button type="button" disabled={loading} onClick={handleFetchData} className="wh-btn wh-btn-primary">
          {loading ? 'กำลังโหลด...' : 'ค้นหา'}
        </button>

        {selectedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="wh-btn wh-btn-success"
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
            </svg>
            คืนสินค้าที่เลือก ({selectedCount})
          </button>
        )}
      </div>

      {/* Confirm Modal */}
      {showModal && selectedCount > 0 && (
        <div className="wh-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="wh-modal" style={{ maxWidth: 540 }}>
            <div className="wh-modal-title">
              ยืนยันการคืนสินค้า ({selectedCount} รายการ)
              <button className="wh-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            {/* Items list */}
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {Object.values(selectedItems).map((item: any) => {
                const currentQty = returnQuantities[item.id] || 0;
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="wh-mono" style={{ fontSize: 11, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4, fontWeight: 700, display: 'inline-block', marginBottom: 4 }}>
                        {item.deposit_info?.tracking_id}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.deposit_info?.customer_name}</div>
                    </div>
                    <div className="wh-flex-row wh-gap-1" style={{ flexShrink: 0 }}>
                      <input
                        type="number" min={0} max={item.remaining_quantity} value={currentQty}
                        onChange={(e) => {
                          const val = Math.min(item.remaining_quantity, Math.max(0, parseInt(e.target.value) || 0));
                          setReturnQuantities(prev => ({ ...prev, [item.id]: val }));
                        }}
                        style={{ width: 60, border: '1.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px', fontSize: 13, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
                      />
                      <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>/ {item.remaining_quantity} {item.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Staff info */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="wh-label">ชื่อพนักงานผู้คืนของ <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" className="wh-input" placeholder="กรอกชื่อพนักงาน..." value={staffName} onChange={(e) => setStaffName(e.target.value)} />
              </div>
              <div>
                <label className="wh-label">หมายเหตุ (ถ้ามี)</label>
                <input type="text" className="wh-input" placeholder="ระบุรายละเอียดเพิ่มเติม..." value={remark} onChange={(e) => setRemark(e.target.value)} />
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleReturnConfirm}
              className="wh-btn wh-btn-success wh-btn-full wh-btn-lg"
              style={{ marginTop: '1.25rem' }}
            >
              {loading ? 'กำลังบันทึก...' : `ยืนยันคืนสินค้า ${selectedCount} รายการ & พิมพ์บิล`}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
            สินค้าในคลัง (ยังไม่ได้ส่งคืน) — {filteredRows.length} รายการ
          </span>
          {selectedCount > 0 && (
            <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>เลือกแล้ว {selectedCount} รายการ</span>
          )}
        </div>

        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    style={{ cursor: 'pointer' }}
                    checked={selectedCount === filteredRows.length && filteredRows.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const next: Record<number, any> = {};
                        const qty: Record<number, number> = {};
                        filteredRows.forEach(r => { next[r.id] = r; qty[r.id] = r.remaining_quantity; });
                        setSelectedItems(next); setReturnQuantities(qty);
                      } else {
                        setSelectedItems({}); setReturnQuantities({});
                      }
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
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="wh-empty-row">ไม่พบรายการสินค้าที่รอการคืน</td></tr>
              ) : filteredRows.map((row: any) => {
                const isSelected = !!selectedItems[row.id];
                return (
                  <tr key={row.id} style={{ background: isSelected ? '#eff6ff' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectItem(row)}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#2563eb' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {row.item_image_url ? (
                        <img src={row.item_image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 44, height: 44, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#94a3b8', border: '1px solid #e2e8f0', margin: '0 auto' }}>
                          ไม่มีรูป
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="wh-mono" style={{ color: '#2563eb', fontWeight: 700, fontSize: 13 }}>
                        {row.deposit_info.tracking_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{row.deposit_info.customer_name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{row.deposit_info.customer_phone || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>{row.item_name}</div>
                      <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginTop: 3 }}>
                        คงเหลือ {row.remaining_quantity}/{row.quantity} {row.unit}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>{row.storage_location || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleSelectItem(row)}
                        className="wh-btn"
                        style={{
                          padding: '5px 12px', fontSize: 12,
                          background: isSelected ? '#fef2f2' : '#f0fdf4',
                          color: isSelected ? '#dc2626' : '#16a34a',
                          border: `1px solid ${isSelected ? '#fecaca' : '#bbf7d0'}`,
                        }}
                      >
                        {isSelected ? 'ยกเลิก' : 'เลือก'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}