'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { Withdrawal } from '../../../types/warehouse';

type WithdrawalRow = Withdrawal & {
  deposit_items: {
    item_name: string;
    unit: string;
    deposits: { tracking_id: string; customer_name: string; customer_phone?: string };
  };
};

type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'qty_desc';

export default function HistoryPage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [totalCount, setTotalCount] = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');

  useEffect(() => { fetchHistory(); }, [page, pageSize]);
  useEffect(() => { setPage(0); }, [searchTerm, sortKey]);

  const fetchHistory = async () => {
    setLoading(true);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data: wdata, count, error: wErr } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact' })
      .order('withdraw_date', { ascending: false })
      .range(from, to);

    if (wErr) {
      console.error('[history] fetch withdrawals failed:', wErr.message);
      setRows([]); setTotalCount(0); setLoading(false);
      return;
    }

    const withdrawals = wdata || [];
    setTotalCount(count ?? 0);

    if (withdrawals.length === 0) {
      setRows([]); setLoading(false);
      return;
    }

    const itemIds = [...new Set(withdrawals.map((w: any) => w.deposit_item_id).filter(Boolean))];
    const { data: itemsData, error: iErr } = itemIds.length
      ? await supabase.from('deposit_items').select('id, item_name, unit, deposit_id').in('id', itemIds)
      : { data: [], error: null };
    if (iErr) console.error('[history] fetch deposit_items failed:', iErr.message);

    const depositIds = [...new Set((itemsData || []).map((i: any) => i.deposit_id).filter(Boolean))];
    const { data: depositsData, error: dErr } = depositIds.length
      ? await supabase.from('deposits').select('id, tracking_id, customer_name, customer_phone').in('id', depositIds)
      : { data: [], error: null };
    if (dErr) console.error('[history] fetch deposits failed:', dErr.message);

    const depositsById = new Map((depositsData || []).map((d: any) => [d.id, d]));
    const itemsById = new Map((itemsData || []).map((i: any) => [i.id, { ...i, deposits: depositsById.get(i.deposit_id) }]));

    const merged: WithdrawalRow[] = withdrawals.map((w: any) => ({
      ...w,
      deposit_items: itemsById.get(w.deposit_item_id),
    }));

    setRows(merged);
    setLoading(false);
  };

  const handleExportCSV = async () => {
    setExportLoading(true);
    const { data: wdata, error: wErr } = await supabase
      .from('withdrawals')
      .select('*')
      .order('withdraw_date', { ascending: false });
    if (wErr) { console.error('[history export] fetch withdrawals failed:', wErr.message); setExportLoading(false); return; }
    const withdrawals = wdata || [];
    if (withdrawals.length === 0) { setExportLoading(false); return; }

    const itemIds = [...new Set(withdrawals.map((w: any) => w.deposit_item_id).filter(Boolean))];
    const { data: itemsData } = itemIds.length
      ? await supabase.from('deposit_items').select('id, item_name, unit, deposit_id').in('id', itemIds)
      : { data: [] as any[] };

    const depositIds = [...new Set((itemsData || []).map((i: any) => i.deposit_id).filter(Boolean))];
    const { data: depositsData } = depositIds.length
      ? await supabase.from('deposits').select('id, tracking_id, customer_name, customer_phone').in('id', depositIds)
      : { data: [] as any[] };

    const depositsById = new Map((depositsData || []).map((d: any) => [d.id, d]));
    const itemsById = new Map((itemsData || []).map((i: any) => [i.id, { ...i, deposits: depositsById.get(i.deposit_id) }]));
    const data: WithdrawalRow[] = withdrawals.map((w: any) => ({ ...w, deposit_items: itemsById.get(w.deposit_item_id) }));

    const csvRows = [
      ['วันที่คืน', 'Tracking ID', 'ชื่อผู้ฝาก', 'เบอร์โทร', 'สินค้า', 'จำนวนที่คืน', 'หน่วย', 'พนักงาน', 'หมายเหตุ'],
      ...(data as WithdrawalRow[]).map(w => {
        const d = w.withdraw_date ? new Date(w.withdraw_date) : null;
        const dateStr = d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` : '';
        return [
          dateStr,
          w.deposit_items?.deposits?.tracking_id || '',
          w.deposit_items?.deposits?.customer_name || '',
          w.deposit_items?.deposits?.customer_phone || '',
          w.deposit_items?.item_name || '',
          w.withdraw_quantity,
          w.deposit_items?.unit || '',
          w.staff_signature_name || '',
          w.remark || '',
        ];
      }),
    ];

    const csvContent = '\uFEFF' + csvRows.map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `withdrawal-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportLoading(false);
  };

  const filtered = rows.filter(w => {
    const s = searchTerm.toLowerCase();
    return !s ||
      w.deposit_items?.deposits?.tracking_id?.toLowerCase().includes(s) ||
      w.deposit_items?.deposits?.customer_name?.toLowerCase().includes(s) ||
      w.deposit_items?.item_name?.toLowerCase().includes(s) ||
      w.staff_signature_name?.toLowerCase().includes(s);
  }).sort((a, b) => {
    if (sortKey === 'date_asc') return new Date(a.withdraw_date || 0).getTime() - new Date(b.withdraw_date || 0).getTime();
    if (sortKey === 'name_asc') return (a.deposit_items?.deposits?.customer_name || '').localeCompare(b.deposit_items?.deposits?.customer_name || '', 'th');
    if (sortKey === 'qty_desc') return (b.withdraw_quantity || 0) - (a.withdraw_quantity || 0);
    return new Date(b.withdraw_date || 0).getTime() - new Date(a.withdraw_date || 0).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="wh-page">
      {/* Header */}
      <div className="wh-page-header-row">
        <div className="wh-page-header-left">
          <h1 className="wh-page-title">ประวัติการคืนสินค้า</h1>
          <p className="wh-page-sub">ทั้งหมด {totalCount} รายการ</p>
        </div>
        <button onClick={handleExportCSV} disabled={exportLoading} className="wh-btn wh-btn-success" style={{ gap: 6, padding: '7px 14px', fontSize: 13 }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {exportLoading ? 'กำลัง Export...' : 'Export CSV'}
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div className="wh-search-wrap" style={{ flex: '1 1 220px', minWidth: 200, position: 'relative' }}>
          <svg className="wh-search-icon" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" className="wh-search-input"
            placeholder="ค้นหา Tracking ID, ชื่อผู้ฝาก, สินค้า, พนักงาน..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingRight: searchTerm ? 34 : 12 }} />
          {searchTerm && (
            <button type="button" className="wh-search-clear" onClick={() => setSearchTerm('')}>✕</button>
          )}
        </div>

        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
          className="wh-select" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}>
          <option value="date_desc">เรียงตาม: วันล่าสุด</option>
          <option value="date_asc">เรียงตาม: วันเก่าสุด</option>
          <option value="name_asc">เรียงตาม: ชื่อผู้ฝาก</option>
          <option value="qty_desc">เรียงตาม: จำนวนมากสุด</option>
        </select>

        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          className="wh-select" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}>
          <option value={10}>แสดง 10 รายการ</option>
          <option value={30}>แสดง 30 รายการ</option>
          <option value={50}>แสดง 50 รายการ</option>
          <option value={100}>แสดง 100 รายการ</option>
        </select>

        <button onClick={fetchHistory} className="wh-btn wh-btn-ghost" style={{ padding: '6px 12px', fontSize: 13, gap: 5 }} title="รีเฟรช">
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          รีเฟรช
        </button>
      </div>

      {/* Table */}
      <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                <th>วันที่-เวลา</th>
                <th>Tracking ID</th>
                <th>ผู้ฝาก</th>
                <th>สินค้า</th>
                <th style={{ textAlign: 'center' }}>จำนวนที่คืน</th>
                <th>พนักงานที่คืน</th>
                <th>หมายเหตุ</th>
                <th style={{ textAlign: 'center', width: 72 }}>พิมพ์</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="wh-empty-row">กำลังโหลดข้อมูล...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="wh-empty-row">ไม่พบข้อมูล</td></tr>
              ) : filtered.map(w => {
                const d = w.withdraw_date ? new Date(w.withdraw_date) : null;
                const dateStr = d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}` : '—';
                const timeStr = d ? `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} น.` : '';
                return (
                  <tr key={w.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sp-text)' }}>{dateStr}</div>
                      <div style={{ fontSize: 12, color: 'var(--sp-text3)' }}>{timeStr}</div>
                    </td>
                    <td>
                      <span className="wh-mono" style={{ color: 'var(--sp-blue-md)', fontWeight: 800, fontSize: 12.5, background: '#deeafa', padding: '3px 8px', borderRadius: 6 }}>
                        {w.deposit_items?.deposits?.tracking_id || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{w.deposit_items?.deposits?.customer_name || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--sp-text3)' }}>{w.deposit_items?.deposits?.customer_phone || ''}</div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--sp-text)' }}>{w.deposit_items?.item_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 900, fontSize: 15, color: 'var(--sp-blue)' }}>{w.withdraw_quantity}</span>
                      <span style={{ fontSize: 12, color: 'var(--sp-text3)', marginLeft: 4 }}>{w.deposit_items?.unit}</span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--sp-navy)' }}>{w.staff_signature_name || '—'}</span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--sp-text3)' }}>
                      {w.remark && w.remark !== 'คืนสินค้าเรียบร้อยแล้ว' ? w.remark : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          const ww = 800, hh = 900;
                          window.open(`/print-withdraw/${w.id}`, 'PrintPopup', `width=${ww},height=${hh},top=${window.screen.height/2-hh/2},left=${window.screen.width/2-ww/2},scrollbars=yes,status=no,toolbar=no,menubar=no`);
                        }}
                        className="wh-btn"
                        style={{ padding: '4px 10px', fontSize: 12, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 6 }}
                        title="พิมพ์ใบคืนสินค้า"
                      >
                        🖨
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages >= 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1.5px solid var(--sp-bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: 'var(--sp-text3)' }}>
              หน้า {page + 1} / {totalPages} &nbsp;(แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} จาก {totalCount} รายการ)
            </span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <button onClick={() => setPage(0)} disabled={page === 0} className="wh-btn wh-btn-ghost" style={{ padding: '5px 9px', fontSize: 12.5, opacity: page === 0 ? 0.4 : 1 }}>«</button>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="wh-btn wh-btn-ghost" style={{ padding: '5px 12px', fontSize: 12.5, opacity: page === 0 ? 0.4 : 1 }}>‹ ก่อนหน้า</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                const p = start + i;
                return (
                  <button key={p} onClick={() => setPage(p)} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12.5, minWidth: 32, background: p === page ? 'var(--sp-blue)' : 'transparent', color: p === page ? '#fff' : 'var(--sp-text2)', border: `1.5px solid ${p === page ? 'var(--sp-blue)' : 'var(--sp-border)'}`, borderRadius: 7 }}>
                    {p + 1}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="wh-btn wh-btn-ghost" style={{ padding: '5px 12px', fontSize: 12.5, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>ถัดไป ›</button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="wh-btn wh-btn-ghost" style={{ padding: '5px 9px', fontSize: 12.5, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
