'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function MainPage() {
  const [stats, setStats] = useState({
    totalDeposits: 0,
    totalItems: 0,
    totalRemaining: 0,
    activeItems: 0,
    returnedItems: 0,
    totalWithdrawals: 0,
  });
  const [recentWithdrawals, setRecentWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: items },
        { data: deposits },
        { data: withdrawals }
      ] = await Promise.all([
        supabase.from('deposit_items').select('quantity, remaining_quantity, status'),
        supabase.from('deposits').select('id'),
        supabase.from('withdrawals')
          .select('*, deposit_items(item_name, deposits(customer_name, tracking_id))')
          .order('withdraw_date', { ascending: false })
          .limit(8)
      ]);

      if (items) {
        setStats({
          totalDeposits: deposits?.length || 0,
          totalItems: items.reduce((acc, i) => acc + (i.quantity || 0), 0),
          totalRemaining: items.reduce((acc, i) => acc + (i.remaining_quantity || 0), 0),
          activeItems: items.filter(i => i.status !== 'คืนแล้ว' && i.remaining_quantity > 0).length,
          returnedItems: items.filter(i => i.status === 'คืนแล้ว' || i.remaining_quantity <= 0).length,
          totalWithdrawals: withdrawals?.length || 0,
        });
      }
      if (withdrawals) setRecentWithdrawals(withdrawals);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const quickLinks = [
    { href: '/deposit', label: 'รับฝากสินค้าใหม่', desc: 'บันทึกสินค้าเข้าคลัง', color: '#2563eb', bg: '#eff6ff',
      icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
    { href: '/inventory', label: 'ดูรายการคลังทั้งหมด', desc: 'ค้นหาและจัดการสินค้า', color: '#0891b2', bg: '#ecfeff',
      icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { href: '/return', label: 'บันทึกส่งคืนสินค้า', desc: 'คืนสินค้าให้ลูกค้า', color: '#16a34a', bg: '#f0fdf4',
      icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg> },
  ];

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <h1 className="wh-page-title">ภาพรวมคลังสินค้า</h1>
        <p className="wh-page-sub">สรุปสถานะและกิจกรรมล่าสุดของระบบ</p>
      </div>

      <div className="wh-stat-grid wh-mb-4">
        <div className="wh-stat wh-stat-blue">
          <div className="wh-stat-label">ใบรับฝากทั้งหมด</div>
          <div><span className="wh-stat-value">{loading ? '—' : stats.totalDeposits}</span><span className="wh-stat-unit">บิล</span></div>
        </div>
        <div className="wh-stat wh-stat-green">
          <div className="wh-stat-label">คงเหลือในคลัง</div>
          <div><span className="wh-stat-value">{loading ? '—' : stats.totalRemaining}</span><span className="wh-stat-unit">หน่วย</span></div>
        </div>
        <div className="wh-stat wh-stat-amber">
          <div className="wh-stat-label">รายการกำลังฝาก</div>
          <div><span className="wh-stat-value">{loading ? '—' : stats.activeItems}</span><span className="wh-stat-unit">รายการ</span></div>
        </div>
        <div className="wh-stat wh-stat-indigo">
          <div className="wh-stat-label">คืนแล้วทั้งหมด</div>
          <div><span className="wh-stat-value">{loading ? '—' : stats.returnedItems}</span><span className="wh-stat-unit">รายการ</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem', alignItems: 'start' }}>
        <div className="wh-card">
          <div className="wh-card-title">รายการส่งคืนล่าสุด</div>
          {loading ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>กำลังโหลด...</p>
          ) : recentWithdrawals.length === 0 ? (
            <p className="wh-empty-row">ยังไม่มีรายการส่งคืน</p>
          ) : (
            <div className="wh-table-wrap">
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>ชื่อสินค้า</th>
                    <th>ผู้ฝาก</th>
                    <th style={{ textAlign: 'center' }}>จำนวนคืน</th>
                    <th style={{ textAlign: 'right' }}>วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWithdrawals.map((w: any) => (
                    <tr key={w.id}>
                      <td style={{ fontWeight: 600, color: '#1e293b' }}>{w.deposit_items?.item_name || '-'}</td>
                      <td style={{ color: '#64748b', fontSize: 12.5 }}>
                        <div>{w.deposit_items?.deposits?.customer_name || '-'}</div>
                        <div className="wh-mono" style={{ color: '#94a3b8', marginTop: 2 }}>{w.deposit_items?.deposits?.tracking_id}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{w.withdraw_quantity}</td>
                      <td style={{ textAlign: 'right', fontSize: 12.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(w.withdraw_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="wh-card">
          <div className="wh-card-title">เมนูด่วน</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {quickLinks.map((q) => (
              <Link key={q.href} href={q.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 16px', borderRadius: '10px',
                  border: '1.5px solid #f1f5f9', background: '#fafafa',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = q.bg; (e.currentTarget as HTMLElement).style.borderColor = q.color + '40'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fafafa'; (e.currentTarget as HTMLElement).style.borderColor = '#f1f5f9'; }}
                >
                  <div style={{ color: q.color, flexShrink: 0 }}>{q.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1e293b' }}>{q.label}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{q.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <style jsx>{` @media (max-width: 768px) { div[style*="320px"] { grid-template-columns: 1fr !important; } } `}</style>
    </div>
  );
}