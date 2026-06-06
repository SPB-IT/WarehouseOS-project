'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [viewingItem, setViewingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('deposit_items')
      .select('*, deposits(tracking_id, customer_name, customer_phone, deposit_date)');
    setItems(data || []);
    setLoading(false);
  };

  const handlePrint = (id: string) => {
    const width = 800, height = 900;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(`/print/${id}`, 'PrintPopup', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,toolbar=no,menubar=no`);
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.deposits?.tracking_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.deposits?.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.deposits?.customer_phone?.includes(searchTerm) ||
      item.item_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const status = item.status || (item.remaining_quantity <= 0 ? 'คืนแล้ว' : 'กำลังฝาก');
    const matchesStatus = statusFilter === 'ทั้งหมด' || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = items.filter(i => i.status !== 'คืนแล้ว' && i.remaining_quantity > 0).length;
  const returnedCount = items.filter(i => i.status === 'คืนแล้ว' || i.remaining_quantity <= 0).length;

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <h1 className="wh-page-title">รายการสิ่งของในคลัง</h1>
        <p className="wh-page-sub">
          ทั้งหมด {items.length} รายการ &nbsp;·&nbsp;
          <span style={{ color: '#16a34a', fontWeight: 600 }}>กำลังฝาก {activeCount}</span> &nbsp;·&nbsp;
          <span style={{ color: '#64748b' }}>คืนแล้ว {returnedCount}</span>
        </p>
      </div>

      {/* Search & filter */}
      <div className="wh-search-bar">
        <div className="wh-search-wrap" style={{ flex: 1 }}>
          <svg className="wh-search-icon" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="wh-search-input"
            placeholder="ค้นหาด้วยชื่อผู้ฝาก, เบอร์โทร, หรือ Tracking ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="wh-flex-row">
          {['ทั้งหมด', 'กำลังฝาก', 'คืนแล้ว'].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="wh-btn"
              style={{
                padding: '7px 16px', fontSize: 13,
                background: statusFilter === f ? '#2563eb' : 'transparent',
                color: statusFilter === f ? '#fff' : '#64748b',
                border: statusFilter === f ? 'none' : '1.5px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={fetchItems} className="wh-btn wh-btn-ghost" style={{ padding: '7px 12px' }} title="รีเฟรช">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* Table */}
      <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: 'center' }}>รูป</th>
                <th>Tracking ID</th>
                <th>ผู้ฝาก</th>
                <th>รายละเอียดของ</th>
                <th>ตำแหน่งเก็บ</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="wh-empty-row">กำลังโหลดข้อมูล...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={7} className="wh-empty-row">ไม่พบข้อมูลที่ค้นหา</td></tr>
              ) : filteredItems.map((item) => {
                const isReturned = item.status === 'คืนแล้ว' || (!item.status && item.remaining_quantity <= 0);
                return (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'center' }}>
                      {item.item_image_url ? (
                        <img src={item.item_image_url} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 42, height: 42, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#94a3b8', border: '1px solid #e2e8f0', margin: '0 auto' }}>
                          ไม่มีรูป
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="wh-mono" style={{ color: '#2563eb', fontWeight: 700, fontSize: 13 }}>
                        {item.deposits?.tracking_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.deposits?.customer_name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{item.deposits?.customer_phone || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.item_name}</div>
                      {item.detail && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.detail}</div>}
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>
                        คงเหลือ {item.remaining_quantity}/{item.quantity} {item.unit}
                      </div>
                    </td>
                    <td style={{ color: '#64748b', fontSize: 13 }}>{item.storage_location || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {isReturned
                        ? <span className="wh-badge wh-badge-returned">คืนแล้ว</span>
                        : <span className="wh-badge wh-badge-active">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                            กำลังฝาก
                          </span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="wh-flex-row wh-gap-1" style={{ justifyContent: 'center' }}>
                        <button
                          onClick={() => setViewingItem(item)}
                          className="wh-btn"
                          style={{ padding: '5px 11px', fontSize: 12, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                        >
                          ดูข้อมูล
                        </button>
                        <button
                          onClick={() => handlePrint(item.id)}
                          className="wh-btn"
                          style={{
                            padding: '5px 11px', fontSize: 12,
                            background: isReturned ? '#f5f3ff' : '#f0fdf4',
                            color: isReturned ? '#7c3aed' : '#16a34a',
                            border: `1px solid ${isReturned ? '#ddd6fe' : '#bbf7d0'}`,
                          }}
                        >
                          {isReturned ? 'ปริ้นต์ใบคืน' : 'ปริ้นต์ใบฝาก'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {viewingItem && (
        <div className="wh-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewingItem(null); }}>
          <div className="wh-modal">
            <div className="wh-modal-title">
              รายละเอียดรายการ
              <button className="wh-modal-close" onClick={() => setViewingItem(null)}>×</button>
            </div>

            {viewingItem.item_image_url && (
              <img src={viewingItem.item_image_url} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10, marginBottom: 16, border: '1px solid #e2e8f0' }} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Tracking ID', value: viewingItem.deposits?.tracking_id, mono: true },
                { label: 'ชื่อผู้ฝาก', value: viewingItem.deposits?.customer_name },
                { label: 'เบอร์โทรศัพท์', value: viewingItem.deposits?.customer_phone || '—' },
                { label: 'รายละเอียดสิ่งของ', value: viewingItem.item_name },
                { label: 'ลักษณะเพิ่มเติม', value: viewingItem.detail || '—' },
                { label: 'จำนวนคงเหลือ', value: `${viewingItem.remaining_quantity} / ${viewingItem.quantity} ${viewingItem.unit}` },
                { label: 'พิกัดจัดเก็บ', value: viewingItem.storage_location || '—' },
                { label: 'สถานะ', value: viewingItem.status || (viewingItem.remaining_quantity <= 0 ? 'คืนแล้ว' : 'กำลังฝาก') },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'right', fontFamily: row.mono ? 'monospace' : 'inherit' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={() => handlePrint(viewingItem.id)} className="wh-btn wh-btn-primary" style={{ flex: 1 }}>
                พิมพ์ใบรับฝาก
              </button>
              <button onClick={() => setViewingItem(null)} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}